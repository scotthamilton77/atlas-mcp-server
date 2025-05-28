/**
 * @fileoverview Implements the database import logic for Neo4j.
 * @module src/services/neo4j/backupRestoreService/importLogic
 */

import { existsSync, readdirSync, readFileSync } from "fs";
import { stat } from "fs/promises";
import { Session } from "neo4j-driver";
import path from "path";
import { logger, requestContextService } from "../../../utils/index.js";
import { neo4jDriver } from "../driver.js";
import { escapeRelationshipType } from "../helpers.js";
import { FullExport } from "./backupRestoreTypes.js";
import { secureResolve, validatedBackupRoot } from "./backupUtils.js";

/**
 * Imports data from JSON files, overwriting the existing database.
 * Can import from either full-export.json (if it exists) or individual entity files.
 * @param backupDirInput The path to the directory containing the backup JSON files.
 * @throws Error if any step fails or if the backup directory is invalid.
 */
export const _importDatabase = async (
  backupDirInput: string,
): Promise<void> => {
  const backupDir = secureResolve(
    validatedBackupRoot,
    path.relative(validatedBackupRoot, path.resolve(backupDirInput)),
  );
  if (!backupDir) {
    throw new Error(
      `Invalid backup directory provided: "${backupDirInput}". It must be within "${validatedBackupRoot}".`,
    );
  }
  try {
    const stats = await stat(backupDir);
    if (!stats.isDirectory()) {
      throw new Error(
        `Backup path "${backupDir}" exists but is not a directory.`,
      );
    }
  } catch (error: any) {
    if (error.code === "ENOENT") {
      throw new Error(`Backup directory "${backupDir}" does not exist.`);
    }
    throw new Error(
      `Failed to access backup directory "${backupDir}": ${error.message}`,
    );
  }

  const operationName = "_importDatabase"; // Renamed
  const baseContext = requestContextService.createRequestContext({
    operation: operationName,
    importDir: backupDir,
  });

  let session: Session | null = null;
  logger.warning(
    `Starting database import from validated directory ${backupDir}. THIS WILL OVERWRITE ALL EXISTING DATA.`,
    baseContext,
  );

  try {
    session = await neo4jDriver.getSession();
    logger.info("Clearing existing database...", baseContext);
    await session.executeWrite(async (tx) => {
      logger.debug("Executing clear database transaction...", baseContext);
      await tx.run("MATCH (n) DETACH DELETE n");
      logger.debug("Clear database transaction executed.", baseContext);
    });
    logger.info("Existing database cleared.", baseContext);

    let relationships: Array<{
      startNodeId: string;
      endNodeId: string;
      type: string;
      properties: Record<string, any>;
    }> = [];

    const fullExportPath = secureResolve(backupDir, "full-export.json");

    if (fullExportPath && existsSync(fullExportPath)) {
      logger.info(
        `Found full-export.json at ${fullExportPath}. Using consolidated import.`,
        { ...baseContext, filePath: fullExportPath },
      );
      const fullExportContent = readFileSync(fullExportPath, "utf-8");
      const fullExport: FullExport = JSON.parse(fullExportContent);

      for (const label in fullExport.nodes) {
        if (Object.prototype.hasOwnProperty.call(fullExport.nodes, label)) {
          const nodesToImport = fullExport.nodes[label];
          if (!nodesToImport || nodesToImport.length === 0) {
            logger.info(`No ${label} nodes to import from full-export.json.`, {
              ...baseContext,
              label,
            });
            continue;
          }
          logger.debug(
            `Importing ${nodesToImport.length} ${label} nodes from full-export.json`,
            { ...baseContext, label, count: nodesToImport.length },
          );
          const escapedLabel = `\`${label.replace(/`/g, "``")}\``;
          const query = `UNWIND $nodes as nodeProps CREATE (n:${escapedLabel}) SET n = nodeProps`;
          await session.executeWrite(async (tx) => {
            logger.debug(
              `Executing node creation transaction for label ${label} (full-export)...`,
              { ...baseContext, label },
            );
            await tx.run(query, { nodes: nodesToImport });
            logger.debug(
              `Node creation transaction for label ${label} (full-export) executed.`,
              { ...baseContext, label },
            );
          });
          logger.info(
            `Successfully imported ${nodesToImport.length} ${label} nodes from full-export.json`,
            { ...baseContext, label, count: nodesToImport.length },
          );
        }
      }
      if (fullExport.relationships && fullExport.relationships.length > 0) {
        logger.info(
          `Found ${fullExport.relationships.length} relationships in full-export.json.`,
          { ...baseContext, count: fullExport.relationships.length },
        );
        relationships = fullExport.relationships;
      } else {
        logger.info(`No relationships found in full-export.json.`, baseContext);
      }
    } else {
      logger.info(
        `No full-export.json found or path invalid. Using individual entity files from ${backupDir}.`,
        baseContext,
      );
      const filesInBackupDir = readdirSync(backupDir);
      const nodeFiles = filesInBackupDir.filter(
        (file) =>
          file.toLowerCase().endsWith(".json") &&
          file !== "relationships.json" &&
          file !== "full-export.json",
      );

      for (const nodeFile of nodeFiles) {
        const filePath = secureResolve(backupDir, nodeFile);
        if (!filePath) {
          logger.warning(
            `Skipping potentially insecure node file path: ${nodeFile} in ${backupDir}`,
            { ...baseContext, nodeFile },
          );
          continue;
        }
        const inferredLabelFromFile = path.basename(nodeFile, ".json");
        const label = inferredLabelFromFile.endsWith("s")
          ? inferredLabelFromFile.charAt(0).toUpperCase() +
            inferredLabelFromFile.slice(1, -1)
          : inferredLabelFromFile.charAt(0).toUpperCase() +
            inferredLabelFromFile.slice(1);

        if (!existsSync(filePath)) {
          logger.warning(
            `Node file ${nodeFile} (inferred label ${label}) not found at ${filePath}. Skipping.`,
            { ...baseContext, nodeFile, label, filePath },
          );
          continue;
        }
        logger.debug(
          `Importing nodes with inferred label: ${label} from ${filePath}`,
          { ...baseContext, label, filePath },
        );
        const fileContent = readFileSync(filePath, "utf-8");
        const nodesToImport: Record<string, any>[] = JSON.parse(fileContent);

        if (nodesToImport.length === 0) {
          logger.info(`No ${label} nodes to import from ${filePath}.`, {
            ...baseContext,
            label,
            filePath,
          });
          continue;
        }
        const escapedLabel = `\`${label.replace(/`/g, "``")}\``;
        const query = `UNWIND $nodes as nodeProps CREATE (n:${escapedLabel}) SET n = nodeProps`;
        await session.executeWrite(async (tx) => {
          logger.debug(
            `Executing node creation transaction for label ${label} (individual file)...`,
            { ...baseContext, label },
          );
          await tx.run(query, { nodes: nodesToImport });
          logger.debug(
            `Node creation transaction for label ${label} (individual file) executed.`,
            { ...baseContext, label },
          );
        });
        logger.info(
          `Successfully imported ${nodesToImport.length} ${label} nodes from ${filePath}`,
          { ...baseContext, label, count: nodesToImport.length, filePath },
        );
      }
      const relFilePath = secureResolve(backupDir, "relationships.json");
      if (relFilePath && existsSync(relFilePath)) {
        logger.info(`Importing relationships from ${relFilePath}...`, {
          ...baseContext,
          filePath: relFilePath,
        });
        const relFileContent = readFileSync(relFilePath, "utf-8");
        relationships = JSON.parse(relFileContent);
        if (relationships.length === 0) {
          logger.info(`No relationships found to import in ${relFilePath}.`, {
            ...baseContext,
            filePath: relFilePath,
          });
        }
      } else {
        logger.warning(
          `Relationships file not found or path invalid: ${relFilePath}. Skipping relationship import.`,
          { ...baseContext, filePath: relFilePath },
        );
      }
    }

    if (relationships.length > 0) {
      logger.info(
        `Attempting to import ${relationships.length} relationships...`,
        { ...baseContext, totalRelationships: relationships.length },
      );
      let importedCount = 0;
      let failedCount = 0;
      const relationshipsByType: Record<
        string,
        Array<{
          startNodeId: string;
          endNodeId: string;
          properties: Record<string, any>;
        }>
      > = {};

      for (const rel of relationships) {
        if (!rel.startNodeId || !rel.endNodeId || !rel.type) {
          logger.warning(
            `Skipping relationship due to missing critical data (startNodeId, endNodeId, or type): ${JSON.stringify(rel)}`,
            { ...baseContext, relationshipData: rel },
          );
          failedCount++;
          continue;
        }
        if (!relationshipsByType[rel.type]) {
          relationshipsByType[rel.type] = [];
        }
        relationshipsByType[rel.type].push({
          startNodeId: rel.startNodeId,
          endNodeId: rel.endNodeId,
          properties: rel.properties || {},
        });
      }

      const batchSize = 500;
      for (const relType in relationshipsByType) {
        if (
          Object.prototype.hasOwnProperty.call(relationshipsByType, relType)
        ) {
          const relsOfType = relationshipsByType[relType];
          const escapedType = escapeRelationshipType(relType);
          logger.debug(
            `Processing ${relsOfType.length} relationships of type ${relType} (escaped: ${escapedType})`,
            { ...baseContext, relType, count: relsOfType.length },
          );
          for (let i = 0; i < relsOfType.length; i += batchSize) {
            const batch = relsOfType.slice(i, i + batchSize);
            const batchNumber = i / batchSize + 1;
            logger.debug(
              `Processing batch ${batchNumber} for type ${relType} (size: ${batch.length})`,
              { ...baseContext, relType, batchNumber, batchSize: batch.length },
            );
            const relQuery = `
              UNWIND $rels AS relData
              MATCH (start {id: relData.startNodeId})
              MATCH (end {id: relData.endNodeId})
              CREATE (start)-[r:${escapedType}]->(end)
              SET r = relData.properties
              RETURN count(r) as createdCount
            `;
            try {
              const result = await session.executeWrite(async (tx) => {
                logger.debug(
                  `Executing UNWIND transaction for type ${relType}, batch ${batchNumber}`,
                  { ...baseContext, relType, batchNumber },
                );
                const txResult = await tx.run(relQuery, { rels: batch });
                logger.debug(
                  `UNWIND transaction executed for type ${relType}, batch ${batchNumber}`,
                  { ...baseContext, relType, batchNumber },
                );
                return txResult.records[0]?.get("createdCount").toNumber() || 0;
              });
              importedCount += result;
              logger.debug(
                `Successfully created ${result} relationships of type ${relType} in batch ${batchNumber}`,
                { ...baseContext, relType, batchNumber, count: result },
              );
            } catch (error) {
              const errorMsg =
                error instanceof Error ? error.message : String(error);
              logger.error(
                `Failed to create relationships of type ${relType} in batch ${batchNumber}: ${errorMsg}`,
                error as Error,
                {
                  ...baseContext,
                  relType,
                  batchNumber,
                  batchDataSample: batch.slice(0, 5),
                },
              );
              failedCount += batch.length;
            }
          }
        }
      }
      logger.info(
        `Relationship import summary: Attempted=${relationships.length}, Succeeded=${importedCount}, Failed=${failedCount}`,
        {
          ...baseContext,
          attempted: relationships.length,
          succeeded: importedCount,
          failed: failedCount,
        },
      );
    } else {
      logger.info("No relationships to import.", baseContext);
    }
    logger.info("Database import completed successfully.", baseContext);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      `Database import failed: ${errorMessage}`,
      error as Error,
      baseContext,
    );
    throw new Error(`Database import failed: ${errorMessage}`);
  } finally {
    if (session) {
      await session.close();
    }
  }
};
