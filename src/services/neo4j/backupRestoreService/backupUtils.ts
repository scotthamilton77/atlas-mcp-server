/**
 * @fileoverview Provides utility functions for the backup and restore service,
 * including secure path resolution and backup rotation management.
 * @module src/services/neo4j/backupRestoreService/backupUtils
 */

import { existsSync, mkdirSync, readdirSync, rmSync } from "fs";
import { stat } from "fs/promises";
import path from "path";
import { config } from "../../../config/index.js";
import { logger, requestContextService } from "../../../utils/index.js";

// Define the validated root backup path from config
export const validatedBackupRoot = config.backup.backupPath;

/**
 * Securely resolves a path against a base directory and ensures it stays within that base.
 * @param basePath The absolute, validated base path.
 * @param targetPath The relative or absolute path to resolve.
 * @returns The resolved absolute path if it's within the base path, otherwise null.
 */
export const secureResolve = (
  basePath: string,
  targetPath: string,
): string | null => {
  const resolvedTarget = path.resolve(basePath, targetPath);
  if (
    resolvedTarget.startsWith(basePath + path.sep) ||
    resolvedTarget === basePath
  ) {
    return resolvedTarget;
  }
  const errorContext = requestContextService.createRequestContext({
    operation: "secureResolve.PathViolation",
    targetPath,
    resolvedTarget,
    basePath,
  });
  logger.error(
    `Security Violation: Path "${targetPath}" resolves to "${resolvedTarget}", which is outside the allowed base directory "${basePath}".`,
    new Error("Path security violation"),
    errorContext,
  );
  return null;
};

/**
 * Manages backup rotation, deleting the oldest backups if the count exceeds the limit.
 */
export const manageBackupRotation = async (): Promise<void> => {
  const maxBackups = config.backup.maxBackups;

  const operationName = "manageBackupRotation";
  const baseContext = requestContextService.createRequestContext({
    operation: operationName,
  });

  if (!existsSync(validatedBackupRoot)) {
    logger.warning(
      `Backup root directory does not exist: ${validatedBackupRoot}. Skipping rotation.`,
      { ...baseContext, pathChecked: validatedBackupRoot },
    );
    return;
  }

  try {
    logger.debug(
      `Checking backup rotation in ${validatedBackupRoot}. Max backups: ${maxBackups}`,
      baseContext,
    );

    const dirNames = readdirSync(validatedBackupRoot);

    const processedDirs = await Promise.all(
      dirNames.map(
        async (name): Promise<{ path: string; time: number } | null> => {
          const potentialDirPath = secureResolve(validatedBackupRoot, name);
          if (!potentialDirPath) return null;

          try {
            const stats = await stat(potentialDirPath);
            if (stats.isDirectory()) {
              return { path: potentialDirPath, time: stats.mtime.getTime() };
            }
          } catch (statError: any) {
            if (statError.code !== "ENOENT") {
              logger.warning(
                `Could not stat potential backup directory ${potentialDirPath}: ${statError.message}. Skipping.`,
                {
                  ...baseContext,
                  path: potentialDirPath,
                  errorCode: statError.code,
                },
              );
            }
          }
          return null;
        },
      ),
    );

    const validBackupDirs = processedDirs
      .filter((dir): dir is { path: string; time: number } => dir !== null)
      .sort((a, b) => a.time - b.time);

    const backupsToDeleteCount = validBackupDirs.length - maxBackups;

    if (backupsToDeleteCount > 0) {
      logger.info(
        `Found ${validBackupDirs.length} valid backups. Deleting ${backupsToDeleteCount} oldest backups to maintain limit of ${maxBackups}.`,
        baseContext,
      );
      for (let i = 0; i < backupsToDeleteCount; i++) {
        const dirToDelete = validBackupDirs[i].path;
        if (!dirToDelete.startsWith(validatedBackupRoot + path.sep)) {
          logger.error(
            `Security Error: Attempting to delete directory outside backup root: ${dirToDelete}. Aborting deletion.`,
            new Error("Backup deletion security violation"),
            { ...baseContext, dirToDelete },
          );
          continue;
        }
        try {
          rmSync(dirToDelete, { recursive: true, force: true });
          logger.info(`Deleted old backup directory: ${dirToDelete}`, {
            ...baseContext,
            deletedPath: dirToDelete,
          });
        } catch (rmError) {
          const errorMsg =
            rmError instanceof Error ? rmError.message : String(rmError);
          logger.error(
            `Failed to delete old backup directory ${dirToDelete}: ${errorMsg}`,
            rmError as Error,
            { ...baseContext, dirToDelete },
          );
        }
      }
    } else {
      logger.debug(
        `Backup count (${validBackupDirs.length}) is within the limit (${maxBackups}). No rotation needed.`,
        baseContext,
      );
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(
      `Error during backup rotation management: ${errorMsg}`,
      error as Error,
      baseContext,
    );
  }
};
