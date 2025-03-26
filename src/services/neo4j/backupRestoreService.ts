import { Driver, Session } from "neo4j-driver";
import { neo4jDriver } from "./driver.js"; // Correct import
import { logger } from "../../utils/logger.js";
import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync } from "fs";
import path from "path";
import { config } from "../../config/index.js";
import { format } from "date-fns"; // Keep this

// Helper function to escape relationship types for Cypher queries
const escapeRelationshipType = (type: string): string => {
  // Backtick the type name and escape any backticks within the name itself.
  return `\`${type.replace(/`/g, '``')}\``;
};

/**
 * Manages backup rotation, deleting the oldest backups if the count exceeds the limit.
 */
const manageBackupRotation = async (): Promise<void> => {
  const backupRoot = config.backup.backupPath;
  const maxBackups = config.backup.maxBackups;

  if (!existsSync(backupRoot)) {
    logger.warn(`Backup root directory does not exist: ${backupRoot}. Skipping rotation.`);
    return;
  }

  try {
    logger.debug(`Checking backup rotation in ${backupRoot}. Max backups: ${maxBackups}`);
    const backupDirs = readdirSync(backupRoot)
      .map(name => path.join(backupRoot, name))
      .filter(source => statSync(source).isDirectory())
      .map(dirPath => ({ path: dirPath, time: statSync(dirPath).mtime.getTime() }))
      .sort((a, b) => a.time - b.time); // Sort oldest first

    const backupsToDelete = backupDirs.length - maxBackups;

    if (backupsToDelete > 0) {
      logger.info(`Found ${backupDirs.length} backups. Deleting ${backupsToDelete} oldest backups to maintain limit of ${maxBackups}.`);
      for (let i = 0; i < backupsToDelete; i++) {
        const dirToDelete = backupDirs[i].path;
        try {
          rmSync(dirToDelete, { recursive: true, force: true });
          logger.info(`Deleted old backup directory: ${dirToDelete}`);
        } catch (rmError) {
          const errorMsg = rmError instanceof Error ? rmError.message : String(rmError);
          logger.error(`Failed to delete old backup directory ${dirToDelete}: ${errorMsg}`);
          // Continue trying to delete others even if one fails
        }
      }
    } else {
      logger.debug(`Backup count (${backupDirs.length}) is within the limit (${maxBackups}). No rotation needed.`);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`Error during backup rotation management: ${errorMsg}`, { error });
    // Don't throw, allow backup process to continue if possible
  }
};


/**
 * Exports all Project, Task, and Knowledge nodes and relationships to JSON files.
 * Also manages backup rotation.
 * @returns The path to the directory containing the backup files.
 * @throws Error if the export step fails. Rotation errors are logged but don't throw.
 */
export const exportDatabase = async (): Promise<string> => {
  // First, manage rotation before creating the new backup
  await manageBackupRotation();

  let session: Session | null = null; // Initialize session variable
  const timestamp = format(new Date(), "yyyyMMddHHmmss");
  const backupDir = path.join(config.backup.backupPath, `atlas-backup-${timestamp}`);
  try {
    session = await neo4jDriver.getSession(); // Get session from singleton
    logger.info(`Starting database export to ${backupDir}...`);
    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true });
      logger.debug(`Created backup directory: ${backupDir}`);
    }

    const nodeLabels = ["Project", "Task", "Knowledge"];
    for (const label of nodeLabels) {
      logger.debug(`Exporting nodes with label: ${label}`);
      // Fetch all properties directly
      const result = await session.run(`MATCH (n:${label}) RETURN n`);
      // Extract properties from each node
      const nodes = result.records.map(record => record.get("n").properties);

      // No need for sanitization if disableLosslessIntegers: true is set on driver
      const filePath = path.join(backupDir, `${label.toLowerCase()}s.json`);
      writeFileSync(filePath, JSON.stringify(nodes, null, 2));
      logger.info(`Successfully exported ${nodes.length} ${label} nodes to ${filePath}`);
    }

    // Export Relationships
    logger.debug("Exporting relationships...");
    // Use application-level IDs (assuming 'id' property exists) for reliable matching during import
    const relResult = await session.run(`
      MATCH (start)-[r]->(end)
      WHERE start.id IS NOT NULL AND end.id IS NOT NULL // Ensure nodes have the 'id' property
      RETURN 
        start.id as startNodeAppId, 
        end.id as endNodeAppId, 
        type(r) as relType, 
        properties(r) as relProps
    `);

    const relationships = relResult.records.map(record => ({
      startNodeId: record.get("startNodeAppId"), 
      endNodeId: record.get("endNodeAppId"),
      type: record.get("relType"),
      properties: record.get("relProps") || {}, // Ensure properties is an object
    }));

    const relFilePath = path.join(backupDir, 'relationships.json');
    writeFileSync(relFilePath, JSON.stringify(relationships, null, 2));
    logger.info(`Successfully exported ${relationships.length} relationships to ${relFilePath}`);


    logger.info(`Database export completed successfully to ${backupDir}`);
    return backupDir;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Database export failed: ${errorMessage}`, { error });
    // Clean up partially created backup directory on failure
    if (existsSync(backupDir)) {
      try {
        rmSync(backupDir, { recursive: true, force: true });
        logger.warn(`Removed partially created backup directory due to export failure: ${backupDir}`);
      } catch (rmError) {
        // Log cleanup error but prioritize throwing the original export error
        const rmErrorMsg = rmError instanceof Error ? rmError.message : String(rmError);
        logger.error(`Failed to remove partial backup directory ${backupDir}: ${rmErrorMsg}`);
      }
    }
    throw new Error(`Database export failed: ${errorMessage}`);
  } finally {
    if (session) {
      await session.close(); // Close session if it was opened
    }
  }
};

/**
 * Imports data from JSON files, overwriting the existing database.
 * @param backupDir The path to the directory containing the backup JSON files.
 * @throws Error if any step fails.
 */
export const importDatabase = async (backupDir: string): Promise<void> => {
  let session: Session | null = null; // Initialize session variable
  logger.warn(`Starting database import from ${backupDir}. THIS WILL OVERWRITE ALL EXISTING DATA.`);

  try {
    session = await neo4jDriver.getSession(); // Get session from singleton
    // 1. Clear the database
    logger.info("Clearing existing database...");
    // Use DETACH DELETE for simplicity and safety
    await session.run("MATCH (n) DETACH DELETE n");
    logger.info("Existing database cleared.");

    // 2. Import nodes
    const nodeLabels = ["Project", "Task", "Knowledge"];
    for (const label of nodeLabels) {
      const filePath = path.join(backupDir, `${label.toLowerCase()}s.json`);
      if (!existsSync(filePath)) {
        logger.warn(`Backup file not found for label ${label}: ${filePath}. Skipping.`);
        continue;
      }

      logger.debug(`Importing nodes with label: ${label} from ${filePath}`);
      const fileContent = readFileSync(filePath, 'utf-8');
      const nodes: Record<string, any>[] = JSON.parse(fileContent);

      if (nodes.length === 0) {
        logger.info(`No ${label} nodes to import from ${filePath}.`);
        continue;
      }

      // Use UNWIND for batching node creation
      // Ensure properties are correctly passed (no nested objects expected here after export fix)
      const query = `
        UNWIND $nodes as nodeProps
        CREATE (n:${label})
        SET n = nodeProps
      `;
      
      // Consider batching for very large datasets if memory becomes an issue
      await session.run(query, { nodes });
      logger.info(`Successfully imported ${nodes.length} ${label} nodes from ${filePath}`);
    }

    // 3. Import Relationships
    const relFilePath = path.join(backupDir, 'relationships.json');
    if (existsSync(relFilePath)) {
      logger.info(`Importing relationships from ${relFilePath}...`);
      const relFileContent = readFileSync(relFilePath, 'utf-8');
      const relationships: Array<{ startNodeId: string; endNodeId: string; type: string; properties: Record<string, any> }> = JSON.parse(relFileContent);

      if (relationships.length > 0) {
        logger.info(`Attempting to import ${relationships.length} relationships individually (Community Edition compatible)...`);
        
        let importedCount = 0;
        let failedCount = 0;
        const batchSize = 500; // Process in batches to manage transaction size/memory
        
        for (let i = 0; i < relationships.length; i += batchSize) {
          const batch = relationships.slice(i, i + batchSize);
          logger.debug(`Processing relationship batch ${i / batchSize + 1}...`);

          // Use a transaction for each batch
          try {
            await session.executeWrite(async tx => {
              for (const rel of batch) {
                if (!rel.startNodeId || !rel.endNodeId || !rel.type) {
                  logger.warn(`Skipping relationship in batch due to missing startNodeId, endNodeId, or type: ${JSON.stringify(rel)}`);
                  failedCount++;
                  continue;
                }

                const escapedType = escapeRelationshipType(rel.type);
                // Match nodes based on the application-level 'id' property
                const relQuery = `
                  MATCH (start {id: $startNodeId})
                  MATCH (end {id: $endNodeId})
                  CREATE (start)-[r:${escapedType}]->(end)
                  SET r = $properties
                `;
                try {
                  await tx.run(relQuery, {
                    startNodeId: rel.startNodeId,
                    endNodeId: rel.endNodeId,
                    properties: rel.properties || {},
                  });
                  importedCount++;
                } catch (relError) {
                  // Log error for specific relationship but continue batch
                  const errorMsg = relError instanceof Error ? relError.message : String(relError);
                  logger.error(`Failed to create relationship ${rel.type} from ${rel.startNodeId} to ${rel.endNodeId}: ${errorMsg}`, { relationship: rel });
                  failedCount++;
                }
              }
            });
            logger.debug(`Completed relationship batch ${i / batchSize + 1}.`);
          } catch (batchError) {
             // Log error for the whole batch transaction
             const errorMsg = batchError instanceof Error ? batchError.message : String(batchError);
             logger.error(`Failed to process relationship batch starting at index ${i}: ${errorMsg}`);
             // Increment failed count for the entire batch size, assuming none succeeded in this failed transaction
             failedCount += batch.length - (batch.filter(rel => !rel.startNodeId || !rel.endNodeId || !rel.type).length); 
             // Decide if we should stop or continue with next batch
             // For now, let's continue
          }
        }
        /* // Original iterative approach (kept for reference, replaced by batched approach above) */ // Add closing comment tag
        logger.info(`Relationship import summary: Attempted=${relationships.length}, Succeeded=${importedCount}, Failed=${failedCount}`);
      } else {
        logger.info(`No relationships found to import in ${relFilePath}.`);
      }
    } else {
      logger.warn(`Relationships file not found: ${relFilePath}. Skipping relationship import.`);
    }

    logger.info("Database import completed successfully.");

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Database import failed: ${errorMessage}`, { error });
    throw new Error(`Database import failed: ${errorMessage}`);
  } finally {
    if (session) {
      await session.close(); // Close session if it was opened
    }
  }
};
