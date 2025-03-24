import fs from 'fs';
import { ManagedTransaction, Session } from 'neo4j-driver';
import path from 'path';
import { promisify } from 'util';
import { config } from '../../../config/index.js';
import { logger } from '../../../utils/logger.js';
import { neo4jDriver } from '../driver.js';
import { databaseEvents, DatabaseEventType } from '../events.js';
import { NodeLabels, RelationshipTypes } from '../types.js';
import { Neo4jUtils } from '../utils.js';
import { autoExportManager } from './autoExportManager.js';

// Promisify filesystem operations
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

/**
 * Service for importing JSON data into Neo4j database
 */
export class ImportService {
  private backupDir: string;
  private isInitialized: boolean = false;

  constructor() {
    this.backupDir = config.backup.backupPath;
  }

  /**
   * Initialize the import service
   */
  public initialize(): void {
    if (this.isInitialized) {
      return;
    }

    // Set up event listeners
    databaseEvents.subscribe(DatabaseEventType.TRANSACTION_COMPLETE, (data: any) => {
      if (data.operation === 'import') {
        logger.info('Import transaction completed, triggering post-import actions', { 
          timestamp: data.timestamp,
          entityCounts: data.entityCounts
        });
      }
    });

    this.isInitialized = true;
    logger.info('Import service initialized');
  }

  /**
   * Import data from a JSON backup file into Neo4j
   * @param filepath Path to the JSON backup file
   * @param clearDatabase Whether to clear the database before import (default: true)
   * @returns Promise with import summary
   */
  async importFromFile(
    filepath: string,
    clearDatabase: boolean = true
  ): Promise<{
    success: boolean;
    importedEntities: {
      projects: number;
      tasks: number;
      knowledge: number;
      dependencies: number;
      domains: number;
      citations: number;
      users: number;
    };
    errors?: string[];
  }> {
    logger.info(`Starting database import from ${filepath}`);
    
    // Validate file existence
    if (!fs.existsSync(filepath)) {
      throw new Error(`Backup file not found: ${filepath}`);
    }
    
    // Read the backup file
    let data;
    
    try {
      const fileContent = await fs.promises.readFile(filepath, 'utf8');
      data = JSON.parse(fileContent);
    } catch (error) {
      const errorMessage = `Failed to parse backup file as JSON: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(errorMessage, { filepath });
      
      databaseEvents.publish(DatabaseEventType.ERROR, {
        operation: 'import',
        timestamp: new Date().toISOString(),
        error: errorMessage,
        filepath
      });
      
      throw new Error(errorMessage);
    }
    
    // Validate backup data structure
    try {
      this.validateBackupData(data);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(errorMessage, { filepath });
      
      databaseEvents.publish(DatabaseEventType.ERROR, {
        operation: 'import',
        timestamp: new Date().toISOString(),
        error: errorMessage,
        filepath
      });
      
      throw error;
    }
    
    const session = await neo4jDriver.getSession();
    const errors: string[] = [];
    
    try {
      // Clear database if requested (this is done outside the main transaction)
      if (clearDatabase) {
        logger.info('Clearing database before import');
        await Neo4jUtils.clearDatabase();
      }
      
      // Create an aggregated count to track progress
      const importedEntities = {
        projects: 0,
        tasks: 0,
        knowledge: 0,
        dependencies: 0,
        domains: 0,
        citations: 0,
        users: 0
      };

      // Phase 1: Import all node entities first
      await this.importNodeEntities(session, data, importedEntities, errors);
      
      // Phase 2: Import all relationships
      await this.importRelationships(session, data, importedEntities, errors);
      
      // Publish transaction complete event with the import information
      databaseEvents.publish(DatabaseEventType.TRANSACTION_COMPLETE, {
        operation: 'import',
        timestamp: new Date().toISOString(),
        entityCounts: importedEntities,
        filepath
      });
      
      // Create a post-import backup
      if (errors.length === 0) {
        try {
          await autoExportManager.forceExport();
        } catch (error) {
          logger.warn('Failed to create post-import backup', { error });
        }
      }
      
      logger.info('Database import completed successfully', { importedEntities });
      
      return {
        success: true,
        importedEntities,
        errors: errors.length > 0 ? errors : undefined
      };
    } catch (error) {
      logger.error('Error importing database from JSON', { error, filepath });
      
      // Add the main error to the errors array
      errors.unshift(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
      
      // Publish error event
      databaseEvents.publish(DatabaseEventType.ERROR, {
        operation: 'import',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
        filepath
      });
      
      return {
        success: false,
        importedEntities: {
          projects: 0,
          tasks: 0,
          knowledge: 0,
          dependencies: 0,
          domains: 0,
          citations: 0,
          users: 0
        },
        errors
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Import node entities in transaction blocks
   * @param session Neo4j session
   * @param data Import data
   * @param importedEntities Counter for imported entities
   * @param errors Array to collect errors
   * @private
   */
  private async importNodeEntities(
    session: Session,
    data: Record<string, any>,
    importedEntities: {
      projects: number;
      tasks: number;
      knowledge: number;
      dependencies: number;
      domains: number;
      citations: number;
      users: number;
    },
    errors: string[]
  ): Promise<void> {
    // Step 1: Import domains (Batch size: all)
    if (data.domains && Array.isArray(data.domains) && data.domains.length > 0) {
      try {
        await session.executeWrite(async (tx: ManagedTransaction) => {
          // Use parameterized query with batching for better performance
          const query = `
            UNWIND $domains AS domain
            MERGE (d:${NodeLabels.Domain} {name: domain.name})
            ON CREATE SET d += domain
            RETURN count(d) as domainCount
          `;
          
          const result = await tx.run(query, { domains: data.domains });
          importedEntities.domains = result.records[0]?.get('domainCount')?.toNumber() || 0;
        });
      } catch (error) {
        const errorMessage = `Error importing domains: ${error instanceof Error ? error.message : String(error)}`;
        logger.error(errorMessage);
        errors.push(errorMessage);
      }
    }
    
    // Step 2: Import users (Batch size: all)
    if (data.users && Array.isArray(data.users) && data.users.length > 0) {
      try {
        await session.executeWrite(async (tx: ManagedTransaction) => {
          const query = `
            UNWIND $users AS user
            MERGE (u:${NodeLabels.User} {id: user.id})
            ON CREATE SET u = user
            RETURN count(u) as userCount
          `;
          
          const result = await tx.run(query, { users: data.users });
          importedEntities.users = result.records[0]?.get('userCount')?.toNumber() || 0;
        });
      } catch (error) {
        const errorMessage = `Error importing users: ${error instanceof Error ? error.message : String(error)}`;
        logger.error(errorMessage);
        errors.push(errorMessage);
      }
    }
    
    // Step 3: Import projects (Batch size: 100)
    if (data.projects && Array.isArray(data.projects) && data.projects.length > 0) {
      const batchSize = 100;
      const projectBatches = this.batchArray(data.projects, batchSize);
      
      for (const batch of projectBatches) {
        try {
          await session.executeWrite(async (tx: ManagedTransaction) => {
            const query = `
              UNWIND $projects AS project
              CREATE (p:${NodeLabels.Project})
              SET p = project
              RETURN count(p) as projectCount
            `;
            
            const result = await tx.run(query, { projects: batch });
            importedEntities.projects += result.records[0]?.get('projectCount')?.toNumber() || 0;
          });
        } catch (error) {
          const errorMessage = `Error importing projects batch: ${error instanceof Error ? error.message : String(error)}`;
          logger.error(errorMessage);
          errors.push(errorMessage);
        }
      }
    }
    
    // Step 4: Import tasks (Batch size: 100)
    if (data.tasks && Array.isArray(data.tasks) && data.tasks.length > 0) {
      const batchSize = 100;
      const taskBatches = this.batchArray(data.tasks, batchSize);
      
      for (const batch of taskBatches) {
        try {
          await session.executeWrite(async (tx: ManagedTransaction) => {
            const query = `
              UNWIND $tasks AS task
              MATCH (p:${NodeLabels.Project} {id: task.projectId})
              CREATE (t:${NodeLabels.Task})
              SET t = task
              CREATE (p)-[:${RelationshipTypes.CONTAINS_TASK}]->(t)
              RETURN count(t) as taskCount
            `;
            
            const result = await tx.run(query, { tasks: batch });
            importedEntities.tasks += result.records[0]?.get('taskCount')?.toNumber() || 0;
          });
        } catch (error) {
          const errorMessage = `Error importing tasks batch: ${error instanceof Error ? error.message : String(error)}`;
          logger.error(errorMessage);
          errors.push(errorMessage);
        }
      }
    }
    
    // Step 5: Import knowledge items (Batch size: 100)
    if (data.knowledge && Array.isArray(data.knowledge) && data.knowledge.length > 0) {
      const batchSize = 100;
      const knowledgeBatches = this.batchArray(data.knowledge, batchSize);
      
      for (const batch of knowledgeBatches) {
        try {
          await session.executeWrite(async (tx: ManagedTransaction) => {
            const query = `
              UNWIND $knowledge AS item
              MATCH (p:${NodeLabels.Project} {id: item.projectId})
              MATCH (d:${NodeLabels.Domain} {name: item.domain})
              CREATE (k:${NodeLabels.Knowledge})
              SET k = item
              CREATE (p)-[:${RelationshipTypes.CONTAINS_KNOWLEDGE}]->(k)
              CREATE (k)-[:${RelationshipTypes.BELONGS_TO_DOMAIN}]->(d)
              RETURN count(k) as knowledgeCount
            `;
            
            const result = await tx.run(query, { knowledge: batch });
            importedEntities.knowledge += result.records[0]?.get('knowledgeCount')?.toNumber() || 0;
          });
        } catch (error) {
          const errorMessage = `Error importing knowledge batch: ${error instanceof Error ? error.message : String(error)}`;
          logger.error(errorMessage);
          errors.push(errorMessage);
        }
      }
    }
    
    // Step 6: Import citations (Batch size: all)
    if (data.citations && Array.isArray(data.citations) && data.citations.length > 0) {
      try {
        await session.executeWrite(async (tx: ManagedTransaction) => {
          const query = `
            UNWIND $citations AS citation
            CREATE (c:${NodeLabels.Citation})
            SET c = citation
            RETURN count(c) as citationCount
          `;
          
          const result = await tx.run(query, { citations: data.citations });
          importedEntities.citations = result.records[0]?.get('citationCount')?.toNumber() || 0;
        });
      } catch (error) {
        const errorMessage = `Error importing citations: ${error instanceof Error ? error.message : String(error)}`;
        logger.error(errorMessage);
        errors.push(errorMessage);
      }
    }
  }

  /**
   * Import relationship entities in transaction blocks
   * @param session Neo4j session
   * @param data Import data
   * @param importedEntities Counter for imported entities
   * @param errors Array to collect errors
   * @private
   */
  private async importRelationships(
    session: Session,
    data: Record<string, any>,
    importedEntities: {
      projects: number;
      tasks: number;
      knowledge: number;
      dependencies: number;
      domains: number;
      citations: number;
      users: number;
    },
    errors: string[]
  ): Promise<void> {
    // Step 1: Import project dependencies
    if (data.dependencies?.projectDependencies && 
        Array.isArray(data.dependencies.projectDependencies) && 
        data.dependencies.projectDependencies.length > 0) {
      try {
        await session.executeWrite(async (tx: ManagedTransaction) => {
          const query = `
            UNWIND $dependencies AS dep
            MATCH (source:${NodeLabels.Project} {id: dep.sourceProjectId})
            MATCH (target:${NodeLabels.Project} {id: dep.targetProjectId})
            CREATE (source)-[r:${RelationshipTypes.DEPENDS_ON} {
              id: dep.id,
              type: dep.type,
              description: dep.description,
              createdAt: dep.createdAt
            }]->(target)
            RETURN count(r) as depCount
          `;
          
          const result = await tx.run(query, { 
            dependencies: data.dependencies.projectDependencies 
          });
          importedEntities.dependencies += result.records[0]?.get('depCount')?.toNumber() || 0;
        });
      } catch (error) {
        const errorMessage = `Error importing project dependencies: ${error instanceof Error ? error.message : String(error)}`;
        logger.error(errorMessage);
        errors.push(errorMessage);
      }
    }
    
    // Step 2: Import task dependencies
    if (data.dependencies?.taskDependencies && 
        Array.isArray(data.dependencies.taskDependencies) && 
        data.dependencies.taskDependencies.length > 0) {
      try {
        await session.executeWrite(async (tx: ManagedTransaction) => {
          const query = `
            UNWIND $dependencies AS dep
            MATCH (source:${NodeLabels.Task} {id: dep.sourceTaskId})
            MATCH (target:${NodeLabels.Task} {id: dep.targetTaskId})
            CREATE (source)-[r:${RelationshipTypes.DEPENDS_ON} {
              id: dep.id,
              createdAt: dep.createdAt
            }]->(target)
            RETURN count(r) as depCount
          `;
          
          const result = await tx.run(query, { 
            dependencies: data.dependencies.taskDependencies 
          });
          importedEntities.dependencies += result.records[0]?.get('depCount')?.toNumber() || 0;
        });
      } catch (error) {
        const errorMessage = `Error importing task dependencies: ${error instanceof Error ? error.message : String(error)}`;
        logger.error(errorMessage);
        errors.push(errorMessage);
      }
    }
    
    // Step 3: Create relationships between knowledge and citations
    if (data.knowledge && Array.isArray(data.knowledge)) {
      // Filter knowledge items that have citations
      const knowledgeWithCitations = data.knowledge.filter(
        (k: Record<string, any>) => k.citations && Array.isArray(k.citations) && k.citations.length > 0
      );
      
      if (knowledgeWithCitations.length > 0) {
        try {
          await session.executeWrite(async (tx: ManagedTransaction) => {
            // Prepare a flattened array of knowledge-citation relationships
            const relationships = knowledgeWithCitations.flatMap((knowledge: Record<string, any>) => 
              knowledge.citations.map((citationId: string) => ({
                knowledgeId: knowledge.id,
                citationId
              }))
            );
            
            const query = `
              UNWIND $relationships AS rel
              MATCH (k:${NodeLabels.Knowledge} {id: rel.knowledgeId})
              MATCH (c:${NodeLabels.Citation} {id: rel.citationId})
              CREATE (k)-[r:${RelationshipTypes.CITES}]->(c)
              RETURN count(r) as citesCount
            `;
            
            const result = await tx.run(query, { relationships });
            // These aren't counted separately in the importedEntities object
            const citesCount = result.records[0]?.get('citesCount')?.toNumber() || 0;
            logger.debug(`Created ${citesCount} citation relationships`);
          });
        } catch (error) {
          const errorMessage = `Error importing citation relationships: ${error instanceof Error ? error.message : String(error)}`;
          logger.error(errorMessage);
          errors.push(errorMessage);
        }
      }
    }
  }

  /**
   * Validate that the backup data has the required structure
   * @param data The parsed backup data to validate
   * @private
   */
  private validateBackupData(data: Record<string, any>): void {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid backup data: not an object');
    }
    
    // Metadata is now optional, but check if it exists
    if (data.metadata && (!data.metadata.exportTimestamp || typeof data.metadata.exportTimestamp !== 'string')) {
      throw new Error('Invalid backup data: metadata exists but has invalid exportTimestamp');
    }
    
    if (!Array.isArray(data.projects)) {
      throw new Error('Invalid backup data: projects must be an array');
    }
    
    if (!Array.isArray(data.tasks)) {
      throw new Error('Invalid backup data: tasks must be an array');
    }
    
    if (!Array.isArray(data.knowledge)) {
      throw new Error('Invalid backup data: knowledge must be an array');
    }
    
    if (!data.dependencies || typeof data.dependencies !== 'object') {
      throw new Error('Invalid backup data: missing dependencies object');
    }
    
    // Additional validation - check if projects have all required fields
    for (let i = 0; i < data.projects.length; i++) {
      const project = data.projects[i];
      if (!project.id || typeof project.id !== 'string') {
        throw new Error(`Invalid project at index ${i}: missing or invalid 'id' field`);
      }
    }
    
    // Check if tasks have all required fields
    for (let i = 0; i < data.tasks.length; i++) {
      const task = data.tasks[i];
      if (!task.id || typeof task.id !== 'string') {
        throw new Error(`Invalid task at index ${i}: missing or invalid 'id' field`);
      }
      if (!task.projectId || typeof task.projectId !== 'string') {
        throw new Error(`Invalid task at index ${i}: missing or invalid 'projectId' field`);
      }
    }
  }

  /**
   * Get the latest backup file
   * @returns Promise with the path to the latest backup file, or null if none found
   */
  async getLatestBackupFile(): Promise<string | null> {
    try {
      // Ensure directory exists
      if (!fs.existsSync(this.backupDir)) {
        return null;
      }
      
      const files = await readdir(this.backupDir);
      const backupFiles = files.filter(file => file.startsWith('atlas-backup-') && file.endsWith('.json'));
      
      if (backupFiles.length === 0) {
        return null;
      }
      
      // Get file stats to sort by modification time
      const fileStats = await Promise.all(
        backupFiles.map(async file => {
          const filePath = path.join(this.backupDir, file);
          const stats = await stat(filePath);
          return { file, filePath, mtime: stats.mtime };
        })
      );
      
      // Sort by modification time (newest first)
      fileStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
      
      // Return the path to the latest backup file
      return fileStats[0].filePath;
    } catch (error) {
      logger.error('Error getting latest backup file', { error });
      return null;
    }
  }

  /**
   * Split an array into batches of specified size
   * @param array Array to split
   * @param batchSize Size of each batch
   * @returns Array of batches
   * @private
   */
  private batchArray<T>(array: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }
}

// Export a singleton instance
export const importService = new ImportService();
// Do not auto-initialize - will be initialized by initializeNeo4jServices() in the correct order
