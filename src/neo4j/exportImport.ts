import fs from 'fs';
import path from 'path';
import { promises as fsPromises } from 'fs';
import {
  driver,
  getSession,
  withTransaction,
  dropConstraints,
  initializeSchema,
} from './driver.js';
import { logger } from '../utils/logger.js';
import { handleOperationError } from '../utils/errorHandler.js';
import { McpError, BaseErrorCode, DatabaseExportImportErrorCode } from '../types/errors.js';
import {
  Neo4jExport,
  ExportOptions,
  ImportOptions,
  ExportResult,
  ImportResult,
} from './exportImportTypes.js';

// Constants
const BACKUP_DIR = path.join(process.cwd(), 'backups');
const EXPORT_VERSION = '1.0';

/**
 * Ensures the backup directory exists
 */
const ensureBackupDirExists = async (): Promise<void> => {
  try {
    await fsPromises.mkdir(BACKUP_DIR, { recursive: true });
  } catch (error) {
    logger.error('Failed to create backup directory', { error });
    throw new McpError(
      DatabaseExportImportErrorCode.FILE_ACCESS_ERROR,
      'Failed to create backup directory',
      { path: BACKUP_DIR }
    );
  }
};

/**
 * Generates a default filename for exports based on current timestamp
 */
const generateExportFilename = (): string => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(BACKUP_DIR, `neo4j_export_${timestamp}.json`);
};

/**
 * Exports the entire Neo4j database to a JSON file
 * 
 * @param options Export options
 * @returns Export result with file path and statistics
 */
export const exportDatabase = async (
  options: ExportOptions = {}
): Promise<ExportResult> => {
  const startTime = Date.now();
  const filePath = options.filePath || generateExportFilename();
  let nodeCount = 0;
  let relationshipCount = 0;

  try {
    await ensureBackupDirExists();

    logger.info('Starting database export', { filePath });
    const session = getSession();

    try {
      // Step 1: Export all nodes
      logger.debug('Exporting nodes');
      const nodeResult = await session.run('MATCH (n) RETURN n, ID(n) as neoId');
      const nodes = nodeResult.records.map(record => {
        const node = record.get('n');
        const neoId = record.get('neoId').toString(); // Internal Neo4j ID for reference
        return {
          id: neoId,
          labels: node.labels,
          properties: node.properties
        };
      });
      nodeCount = nodes.length;
      logger.debug(`Exported ${nodeCount} nodes`);

      // Step 2: Export all relationships
      logger.debug('Exporting relationships');
      const relResult = await session.run(`
        MATCH (s)-[r]->(e)
        RETURN r, ID(r) as relId, ID(s) as startId, ID(e) as endId
      `);
      
      const relationships = relResult.records.map(record => {
        const rel = record.get('r');
        const relId = record.get('relId').toString();
        const startId = record.get('startId').toString();
        const endId = record.get('endId').toString();
        
        return {
          id: relId,
          startNode: startId,
          endNode: endId,
          type: rel.type,
          properties: rel.properties
        };
      });
      relationshipCount = relationships.length;
      logger.debug(`Exported ${relationshipCount} relationships`);

      // Step 3: Create the export data structure
      const exportData: Neo4jExport = {
        metadata: {
          version: EXPORT_VERSION,
          exportDate: new Date().toISOString(),
          nodeCount,
          relationshipCount
        },
        nodes,
        relationships
      };

      // Step 4: Write to file
      await fsPromises.writeFile(
        filePath,
        JSON.stringify(exportData, null, 2)
      );

      logger.info('Database export completed successfully', {
        filePath,
        nodeCount,
        relationshipCount,
        duration: Date.now() - startTime
      });

      return {
        filePath,
        nodeCount,
        relationshipCount,
        exportTime: Date.now() - startTime
      };
    } finally {
      await session.close();
    }
  } catch (error) {
    logger.error('Database export failed', { error, filePath });
    throw new McpError(
      DatabaseExportImportErrorCode.EXPORT_ERROR,
      `Failed to export database: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { filePath }
    );
  }
};

/**
 * Imports a database from a JSON export file
 * 
 * @param options Import options including file path and whether to clear the database
 * @returns Import result with statistics
 */
export const importDatabase = async (
  options: ImportOptions
): Promise<ImportResult> => {
  const startTime = Date.now();
  const { filePath, clearDatabase = true } = options;
  
  if (!filePath) {
    throw new McpError(
      BaseErrorCode.VALIDATION_ERROR,
      'File path is required for import',
    );
  }

  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new McpError(
        DatabaseExportImportErrorCode.FILE_ACCESS_ERROR,
        `Import file not found: ${filePath}`,
        { filePath }
      );
    }

    logger.info('Starting database import', { filePath, clearDatabase });

    // Read and parse the import file
    const fileContent = await fsPromises.readFile(filePath, 'utf-8');
    const importData = JSON.parse(fileContent) as Neo4jExport;

    // Validate import data structure
    if (!importData.nodes || !importData.relationships || !importData.metadata) {
      throw new McpError(
        DatabaseExportImportErrorCode.INVALID_EXPORT_FORMAT,
        'Invalid export format: missing required sections',
        { filePath }
      );
    }

    const { nodes, relationships } = importData;
    logger.info('Import file loaded', {
      version: importData.metadata.version,
      nodeCount: nodes.length,
      relationshipCount: relationships.length
    });

    // Clear existing database if specified
    if (clearDatabase) {
      logger.info('Clearing existing database');
      await dropConstraints();
      const session = getSession();
      try {
        await session.run('MATCH (n) DETACH DELETE n');
      } finally {
        await session.close();
      }
    }

    // Re-initialize schema constraints
    await initializeSchema();

    // Use a transaction for the import
    await withTransaction(async (tx) => {
      // Step 1: Create all nodes
      logger.debug('Importing nodes');
      const nodeIdMap = new Map<string, string>(); // Map external IDs to internal Neo4j IDs
      
      for (const node of nodes) {
        const labels = node.labels.join(':');
        const properties = Object.entries(node.properties)
          .map(([key, value]) => `${key}: $${key}`)
          .join(', ');
        
        const result = await tx.run(
          `CREATE (n:${labels} {${properties}}) RETURN ID(n) as newId`,
          node.properties
        );
        
        // Store mapping from export ID to new Neo4j internal ID
        const newId = result.records[0].get('newId').toString();
        nodeIdMap.set(node.id, newId);
      }
      
      logger.debug(`Imported ${nodes.length} nodes`);

      // Step 2: Create all relationships
      logger.debug('Importing relationships');
      for (const rel of relationships) {
        // Use the mapped internal IDs
        const startNodeId = nodeIdMap.get(rel.startNode);
        const endNodeId = nodeIdMap.get(rel.endNode);
        
        if (!startNodeId || !endNodeId) {
          logger.warn('Skipping relationship due to missing node reference', {
            relType: rel.type,
            startNode: rel.startNode,
            endNode: rel.endNode
          });
          continue;
        }
        
        const properties = Object.entries(rel.properties)
          .map(([key, value]) => `${key}: $${key}`)
          .join(', ');
        
        const propertiesClause = properties ? `{${properties}}` : '';
        
        await tx.run(
          `
          MATCH (s), (e)
          WHERE ID(s) = $startNodeId AND ID(e) = $endNodeId
          CREATE (s)-[r:${rel.type} ${propertiesClause}]->(e)
          `,
          { ...rel.properties, startNodeId, endNodeId }
        );
      }
      
      logger.debug(`Imported ${relationships.length} relationships`);
    });

    const importTime = Date.now() - startTime;
    logger.info('Database import completed successfully', {
      filePath,
      nodeCount: nodes.length,
      relationshipCount: relationships.length,
      duration: importTime
    });

    return {
      nodeCount: nodes.length,
      relationshipCount: relationships.length,
      importTime,
      success: true
    };
  } catch (error) {
    logger.error('Database import failed', { error, filePath });
    
    if (error instanceof McpError) {
      throw error;
    }
    
    throw new McpError(
      DatabaseExportImportErrorCode.IMPORT_ERROR,
      `Failed to import database: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { filePath }
    );
  }
};

/**
 * Gets a list of available database exports
 * 
 * @returns Array of available export files with stats
 */
export const listDatabaseExports = async (): Promise<Array<{
  filename: string;
  path: string;
  size: number;
  createdAt: Date;
  metadata?: Partial<Neo4jExport['metadata']>;
}>> => {
  try {
    await ensureBackupDirExists();
    
    const files = await fsPromises.readdir(BACKUP_DIR);
    const exportFiles = files.filter(f => f.startsWith('neo4j_export_') && f.endsWith('.json'));
    
    const result = await Promise.all(
      exportFiles.map(async (filename) => {
        const filePath = path.join(BACKUP_DIR, filename);
        const stats = await fsPromises.stat(filePath);
        
        // Try to read metadata without loading the entire file
        let metadata = undefined;
        try {
          const fileHandle = await fsPromises.open(filePath, 'r');
          const buffer = Buffer.alloc(1024); // Read first 1KB to get metadata
          await fileHandle.read(buffer, 0, 1024, 0);
          await fileHandle.close();
          
          const content = buffer.toString('utf-8');
          const metadataMatch = content.match(/"metadata":\s*({[^}]+})/);
          if (metadataMatch) {
            // Extract and parse just the metadata portion
            const metadataStr = metadataMatch[1].replace(/,\s*"nodes"/, '');
            metadata = JSON.parse(`${metadataStr}}`);
          }
        } catch (err) {
          logger.warn('Failed to read export metadata', { filename, error: err });
        }
        
        return {
          filename,
          path: filePath,
          size: stats.size,
          createdAt: stats.birthtime,
          metadata
        };
      })
    );
    
    // Sort by creation date, newest first
    return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  } catch (error) {
    logger.error('Failed to list database exports', { error });
    throw new McpError(
      DatabaseExportImportErrorCode.FILE_ACCESS_ERROR,
      `Failed to list database exports: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { directory: BACKUP_DIR }
    );
  }
};