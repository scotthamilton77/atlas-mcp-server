import { Driver, Session } from "neo4j-driver";
import { neo4jDriver } from "./driver.js"; // Correct import
import { logger } from "../../utils/logger.js";
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import { config } from "../../config/index.js";
import { format } from "date-fns"; // Keep this

// Helper function to escape relationship types for Cypher queries
const escapeRelationshipType = (type: string): string => {
  // Backtick the type name and escape any backticks within the name itself.
  // This ensures it's treated as a literal type name even with special characters.
  return `\`${type.replace(/`/g, '``')}\``;
};

// No longer need to get driver directly here

/**
 * Exports all Project, Task, and Knowledge nodes to JSON files.
 * @returns The path to the directory containing the backup files.
 * @throws Error if any step fails.
 */
export const exportDatabase = async (): Promise<string> => {
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
      const result = await session.run(`MATCH (n:${label}) RETURN properties(n) as node`);
      const nodes = result.records.map(record => record.get("node"));
      
      // Convert Neo4j Integer objects to standard numbers if necessary
      const sanitizedNodes = nodes.map(node => {
        const sanitizedNode: Record<string, any> = {};
        for (const key in node) {
          if (typeof node[key] === 'object' && node[key] !== null && 'low' in node[key] && 'high' in node[key]) {
             // Check if it looks like a Neo4j Integer and convert
             // This handles potential large numbers, though JSON might lose precision
             sanitizedNode[key] = node[key].toNumber(); 
          } else {
            sanitizedNode[key] = node[key];
          }
        }
        return sanitizedNode;
      });


      const filePath = path.join(backupDir, `${label.toLowerCase()}s.json`);
      writeFileSync(filePath, JSON.stringify(sanitizedNodes, null, 2));
      logger.info(`Successfully exported ${nodes.length} ${label} nodes to ${filePath}`);
    }

    // Export Relationships
    logger.debug("Exporting relationships...");
    const relResult = await session.run(`
      MATCH (start)-[r]->(end)
      RETURN 
        elementId(start) as startNodeId, 
        elementId(end) as endNodeId, 
        type(r) as relType, 
        properties(r) as relProps,
        start.id as startNodeAppId, // Assuming nodes have an 'id' property for matching during import
        end.id as endNodeAppId     // Assuming nodes have an 'id' property for matching during import
    `);

    const relationships = relResult.records.map(record => ({
      // Using application-level IDs for matching during import
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

      // Use UNWIND for potentially better performance with many nodes
      const query = `
        UNWIND $nodes as nodeProps
        CREATE (n:${label})
        SET n = nodeProps
      `;
      
      // Batching might be needed for very large datasets to avoid memory issues
      // For simplicity, importing all at once here.
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
        let importedCount = 0;
        let failedCount = 0;
        // Process relationships one by one. This is less efficient than UNWIND
        // but necessary to handle dynamic relationship types in standard Cypher.
        for (const rel of relationships) {
          // Basic validation
          if (!rel.startNodeId || !rel.endNodeId || !rel.type) {
            logger.warn(`Skipping relationship due to missing startNodeId, endNodeId, or type: ${JSON.stringify(rel)}`);
            failedCount++;
            continue;
          }

          const escapedType = escapeRelationshipType(rel.type);
          const relQuery = `
            MATCH (start {id: $startNodeId})
            MATCH (end {id: $endNodeId})
            CREATE (start)-[r:${escapedType}]->(end)
            SET r = $properties
          `;
          try {
            await session.run(relQuery, {
              startNodeId: rel.startNodeId,
              endNodeId: rel.endNodeId,
              properties: rel.properties || {}, // Ensure properties is an object, default to empty if null/undefined
            });
            importedCount++;
          } catch (relError) {
            const errorMsg = relError instanceof Error ? relError.message : String(relError);
            logger.error(`Failed to create relationship ${rel.type} from ${rel.startNodeId} to ${rel.endNodeId}: ${errorMsg}`, { relationship: rel });
            failedCount++;
            // Continue importing other relationships despite individual failures
          }
        }
        logger.info(`Relationship import summary: Attempted=${relationships.length}, Succeeded=${importedCount}, Failed=${failedCount}`);
      } else {
        logger.info(`No relationships found to import in ${relFilePath}.`);
      }
    } else {
      logger.warn(`Relationships file not found: ${relFilePath}. Skipping relationship import.`);
    }

    logger.info("Database import completed successfully, including node and relationship data.");

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
