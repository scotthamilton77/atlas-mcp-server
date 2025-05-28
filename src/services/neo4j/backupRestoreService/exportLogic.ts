/**
 * @fileoverview Implements the database export logic for Neo4j.
 * @module src/services/neo4j/backupRestoreService/exportLogic
 */

import { format } from "date-fns";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { Session } from "neo4j-driver";
import { logger, requestContextService } from "../../../utils/index.js";
import { neo4jDriver } from "../driver.js";
import { FullExport } from "./backupRestoreTypes.js";
import {
  manageBackupRotation,
  secureResolve,
  validatedBackupRoot,
} from "./backupUtils.js";

/**
 * Exports all Project, Task, and Knowledge nodes and relationships to JSON files.
 * Also creates a full-export.json file containing all data in a single file.
 * Manages backup rotation before creating the new backup.
 * @returns The path to the directory containing the backup files.
 * @throws Error if the export step fails. Rotation errors are logged but don't throw.
 */
export const _exportDatabase = async (): Promise<string> => {
  const operationName = "_exportDatabase"; // Renamed
  const baseContext = requestContextService.createRequestContext({
    operation: operationName,
  });

  await manageBackupRotation();

  let session: Session | null = null;
  const timestamp = format(new Date(), "yyyyMMddHHmmss");
  const backupDirName = `atlas-backup-${timestamp}`;

  const backupDir = secureResolve(validatedBackupRoot, backupDirName);
  if (!backupDir) {
    throw new Error(
      `Failed to create secure backup directory path for ${backupDirName} within ${validatedBackupRoot}`,
    );
  }

  const fullExport: FullExport = {
    nodes: {},
    relationships: [],
  };

  try {
    session = await neo4jDriver.getSession();
    logger.info(`Starting database export to ${backupDir}...`, baseContext);

    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true });
      logger.debug(`Created backup directory: ${backupDir}`, baseContext);
    }

    logger.debug("Fetching all node labels from database...", baseContext);
    const labelsResult = await session.run(
      "CALL db.labels() YIELD label RETURN label",
    );
    const nodeLabels: string[] = labelsResult.records.map((record) =>
      record.get("label"),
    );
    logger.info(`Found labels: ${nodeLabels.join(", ")}`, {
      ...baseContext,
      labels: nodeLabels,
    });

    for (const label of nodeLabels) {
      logger.debug(`Exporting nodes with label: ${label}`, {
        ...baseContext,
        currentLabel: label,
      });
      const escapedLabel = `\`${label.replace(/`/g, "``")}\``;
      const nodeResult = await session.run(
        `MATCH (n:${escapedLabel}) RETURN n`,
      );
      const nodes = nodeResult.records.map(
        (record) => record.get("n").properties,
      );

      const fileName = `${label.toLowerCase()}s.json`;
      const filePath = secureResolve(backupDir, fileName);
      if (!filePath) {
        logger.error(
          `Skipping export for label ${label}: Could not create secure path for ${fileName} in ${backupDir}`,
          new Error("Secure path resolution failed"),
          { ...baseContext, label, fileName, targetDir: backupDir },
        );
        continue;
      }

      writeFileSync(filePath, JSON.stringify(nodes, null, 2));
      logger.info(
        `Successfully exported ${nodes.length} ${label} nodes to ${filePath}`,
        { ...baseContext, label, count: nodes.length, filePath },
      );
      fullExport.nodes[label] = nodes;
    }

    logger.debug("Exporting relationships...", baseContext);
    const relResult = await session.run(`
      MATCH (start)-[r]->(end)
      WHERE start.id IS NOT NULL AND end.id IS NOT NULL
      RETURN 
        start.id as startNodeAppId, 
        end.id as endNodeAppId, 
        type(r) as relType, 
        properties(r) as relProps
    `);
    const relationships = relResult.records.map((record) => ({
      startNodeId: record.get("startNodeAppId"),
      endNodeId: record.get("endNodeAppId"),
      type: record.get("relType"),
      properties: record.get("relProps") || {},
    }));

    const relFileName = "relationships.json";
    const relFilePath = secureResolve(backupDir, relFileName);
    if (!relFilePath) {
      throw new Error(
        `Failed to create secure path for ${relFileName} in ${backupDir}`,
      );
    }
    writeFileSync(relFilePath, JSON.stringify(relationships, null, 2));
    logger.info(
      `Successfully exported ${relationships.length} relationships to ${relFilePath}`,
      { ...baseContext, count: relationships.length, filePath: relFilePath },
    );
    fullExport.relationships = relationships;

    const fullExportFileName = "full-export.json";
    const fullExportPath = secureResolve(backupDir, fullExportFileName);
    if (!fullExportPath) {
      throw new Error(
        `Failed to create secure path for ${fullExportFileName} in ${backupDir}`,
      );
    }
    writeFileSync(fullExportPath, JSON.stringify(fullExport, null, 2));
    logger.info(
      `Successfully created full database export to ${fullExportPath}`,
      { ...baseContext, filePath: fullExportPath },
    );

    logger.info(
      `Database export completed successfully to ${backupDir}`,
      baseContext,
    );
    return backupDir;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      `Database export failed: ${errorMessage}`,
      error as Error,
      baseContext,
    );
    if (backupDir && existsSync(backupDir)) {
      if (!backupDir.startsWith(validatedBackupRoot + require("path").sep)) {
        // Use require("path") for sep
        logger.error(
          `Security Error: Attempting cleanup of directory outside backup root: ${backupDir}. Aborting cleanup.`,
          new Error("Cleanup security violation"),
          { ...baseContext, cleanupDir: backupDir },
        );
      } else {
        try {
          rmSync(backupDir, { recursive: true, force: true });
          logger.warning(
            `Removed partially created backup directory due to export failure: ${backupDir}`,
            { ...baseContext, cleanupDir: backupDir },
          );
        } catch (rmError) {
          const rmErrorMsg =
            rmError instanceof Error ? rmError.message : String(rmError);
          logger.error(
            `Failed to remove partial backup directory ${backupDir}: ${rmErrorMsg}`,
            rmError as Error,
            { ...baseContext, cleanupDir: backupDir },
          );
        }
      }
    }
    throw new Error(`Database export failed: ${errorMessage}`);
  } finally {
    if (session) {
      await session.close();
    }
  }
};
