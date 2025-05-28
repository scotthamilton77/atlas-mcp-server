#!/usr/bin/env node
import { existsSync, lstatSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { importDatabase } from "../index.js"; // Adjusted path
import { closeNeo4jConnection } from "../../index.js"; // Adjusted path
import { logger, requestContextService } from "../../../../utils/index.js"; // Adjusted path
import { config } from "../../../../config/index.js"; // Added config import
import { McpLogLevel } from "../../../../utils/internal/logger.js"; // Added McpLogLevel import

/**
 * DB Import Script
 * ================
 *
 * Description:
 *   Imports data from a specified backup directory into the Neo4j database,
 *   overwriting existing data. Validates paths for security.
 *
 * Usage:
 *   - Update package.json script for db:import to point to the new path.
 *   - Run directly: npm run db:import <path_to_backup_directory>
 *   - Example: npm run db:import ./backups/atlas-backup-20230101120000
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root is now 5 levels up from src/services/neo4j/backupRestoreService/scripts/
const projectRoot = path.resolve(__dirname, "../../../../../");

/**
 * Validates the provided backup directory path.
 * Ensures the path is within the project root and is a directory.
 * @param backupDir Path to the backup directory.
 * @returns True if valid, false otherwise.
 */
const isValidBackupDir = (backupDir: string): boolean => {
  const resolvedBackupDir = path.resolve(backupDir);
  const reqContext = requestContextService.createRequestContext({
    operation: "isValidBackupDir.validation",
    backupDir: resolvedBackupDir,
    projectRoot,
  });

  if (
    !resolvedBackupDir.startsWith(projectRoot + path.sep) &&
    resolvedBackupDir !== projectRoot
  ) {
    logger.error(
      `Invalid backup directory: Path is outside the project boundary.`,
      new Error("Path security violation: outside project boundary."),
      { ...reqContext, pathChecked: resolvedBackupDir },
    );
    return false;
  }

  if (
    !existsSync(resolvedBackupDir) ||
    !lstatSync(resolvedBackupDir).isDirectory()
  ) {
    logger.error(
      `Invalid backup directory: Path does not exist or is not a directory.`,
      new Error("Path validation failed: not a directory or does not exist."),
      { ...reqContext, pathChecked: resolvedBackupDir },
    );
    return false;
  }

  const expectedFiles = [
    "projects.json",
    "tasks.json",
    "knowledge.json",
    "relationships.json",
    "full-export.json", // Check for full-export as well, though import logic handles its absence
  ];
  let foundAtLeastOne = false;
  for (const file of expectedFiles) {
    const filePath = path.join(resolvedBackupDir, file);
    const resolvedFilePath = path.resolve(filePath);

    if (
      !resolvedFilePath.startsWith(resolvedBackupDir + path.sep) &&
      resolvedFilePath !== resolvedBackupDir
    ) {
      logger.warning(
        `Skipping check for potentially unsafe file path: ${resolvedFilePath} (outside ${resolvedBackupDir})`,
        { ...reqContext, filePath: resolvedFilePath },
      );
      continue;
    }

    if (existsSync(resolvedFilePath)) {
      foundAtLeastOne = true;
      // For full-export, its presence is enough. For others, we just note if they are missing.
      if (file !== "full-export.json" && !existsSync(resolvedFilePath)) {
        logger.warning(
          `Expected backup file not found: ${resolvedFilePath}. Import might be incomplete if not using full-export.json.`,
          { ...reqContext, missingFile: resolvedFilePath },
        );
      }
    } else if (file !== "full-export.json") {
      // Only warn if individual files are missing and full-export isn't the one being checked
      logger.warning(
        `Expected backup file not found: ${resolvedFilePath}. Import might be incomplete if not using full-export.json.`,
        { ...reqContext, missingFile: resolvedFilePath },
      );
    }
  }
  // If neither full-export.json nor any of the individual main files are found, it's likely not a valid backup.
  // However, the import logic itself checks for full-export first, then individual files.
  // This validation is more of a sanity check.
  return true;
};

/**
 * Manual import script entry point.
 */
const runManualImport = async () => {
  await logger.initialize(config.logLevel as McpLogLevel);

  const args = process.argv.slice(2);

  if (args.length !== 1) {
    logger.error(
      "Usage: npm run db:import <path_to_backup_directory>",
      new Error("Invalid arguments"),
      requestContextService.createRequestContext({
        operation: "runManualImport.argCheck",
      }),
    );
    process.exit(1);
  }

  const userInputPath = args[0];
  const resolvedBackupDir = path.resolve(userInputPath);

  logger.info(`Attempting manual database import from: ${resolvedBackupDir}`);
  logger.warning(
    "!!! THIS WILL OVERWRITE ALL EXISTING DATA IN THE DATABASE !!!",
  );

  if (!isValidBackupDir(resolvedBackupDir)) {
    process.exit(1);
  }

  try {
    await importDatabase(resolvedBackupDir); // importDatabase itself uses validatedBackupRoot internally
    logger.info(
      `Manual import from ${resolvedBackupDir} completed successfully.`,
    );
  } catch (error) {
    const reqContext = requestContextService.createRequestContext({
      operation: "runManualImport.catch",
      backupDir: resolvedBackupDir,
    });
    const errorToLog =
      error instanceof Error ? error : new Error(JSON.stringify(error));
    logger.error("Manual database import failed:", errorToLog, reqContext);
    process.exitCode = 1;
  } finally {
    logger.info("Closing Neo4j connection...");
    await closeNeo4jConnection();
    logger.info("Neo4j connection closed.");
  }
};

runManualImport();
