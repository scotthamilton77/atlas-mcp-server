import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { config } from '../../../config/index.js';
import { logger } from '../../../utils/logger.js';
import { neo4jDriver } from '../driver.js';
import { databaseEvents, DatabaseEventType } from '../events.js';
import { NodeLabels, RelationshipTypes } from '../types.js';
import { autoExportManager } from './autoExportManager.js';

// Promisify filesystem operations
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const unlink = promisify(fs.unlink);

/**
 * Service for exporting Neo4j data to JSON files
 */
export class ExportService {
  private backupDir: string;
  private maxBackupCount: number;
  private isInitialized: boolean = false;

  constructor() {
    this.backupDir = config.backup.backupPath;
    this.maxBackupCount = config.backup.maxBackups;
  }

  /**
   * Initialize the export service and connect to database events
   */
  public initialize(): void {
    if (this.isInitialized) {
      return;
    }

    // Initialize the auto export manager with this service
    autoExportManager.initializeWithExportService(this);

    logger.info('Export service initialized');
    this.isInitialized = true;
  }

  /**
   * Export all Neo4j data to a JSON file
   * @param options Export options
   * @returns Promise with the path to the exported file
   */
  async exportAllData(options: {
    includeMetadata?: boolean;
    compressionLevel?: number;
  } = {}): Promise<string> {
    logger.info('Starting database export to JSON');
    
    try {
      // Ensure backup directory exists
      await this.ensureBackupDirExists();
      
      // Generate timestamp and filename
      const timestamp = this.generateTimestamp();
      const filename = `atlas-backup-${timestamp}.json`;
      const filepath = path.join(this.backupDir, filename);
      
      // Export all entities and relationships in a single transaction for consistency
      const exportData = await this.collectAllDataInTransaction();
      
      // Add metadata if requested
      if (options.includeMetadata !== false) {
        exportData.metadata = {
          exportTimestamp: new Date().toISOString(),
          version: '1.0.0',
          nodeCount: {
            projects: exportData.projects.length,
            tasks: exportData.tasks.length,
            knowledge: exportData.knowledge.length,
          }
        };
      }
      
      // Write to file
      await writeFile(filepath, JSON.stringify(exportData, null, 2), 'utf8');
      
      // Rotate backups to keep only the latest N
      await this.rotateBackups();
      
      // Publish transaction complete event
      databaseEvents.publish(DatabaseEventType.TRANSACTION_COMPLETE, {
        operation: 'export',
        timestamp: new Date().toISOString(),
        filepath
      });
      
      logger.info(`Database export completed successfully: ${filepath}`);
      return filepath;
    } catch (error) {
      logger.error('Error exporting database to JSON', { error });
      throw new Error(`Failed to export database: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Ensure the backup directory exists
   * @private
   */
  private async ensureBackupDirExists(): Promise<void> {
    try {
      await mkdir(this.backupDir, { recursive: true });
      logger.info(`Ensured backup directory exists: ${this.backupDir}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        logger.error(`Failed to create backup directory: ${this.backupDir}`, { error });
        throw error;
      }
    }
  }

  /**
   * Generate a timestamp string for the backup filename
   * @private
   */
  private generateTimestamp(): string {
    const now = new Date();
    return now.toISOString()
      .replace(/:/g, '-')
      .replace(/\..+/, '')
      .replace('T', '_');
  }

  /**
   * Collect all data from Neo4j database in a single transaction for consistency
   * @private
   */
  private async collectAllDataInTransaction(): Promise<{
    metadata?: {
      exportTimestamp: string;
      version: string;
      nodeCount?: {
        projects: number;
        tasks: number;
        knowledge: number;
      };
    };
    projects: any[];
    tasks: any[];
    knowledge: any[];
    dependencies: {
      projectDependencies: any[];
      taskDependencies: any[];
    };
    domains: any[];
    citations: any[];
    users: any[];
  }> {
    const session = await neo4jDriver.getSession();
    
    try {
      // Use a single read transaction for the entire export to ensure consistency
      return await session.executeRead(async tx => {
        // Collect projects
        const projectsQuery = `
          MATCH (p:${NodeLabels.Project})
          RETURN p
        `;
        const projectsResult = await tx.run(projectsQuery);
        const projects = projectsResult.records.map(record => record.get('p').properties);
        
        // Collect tasks
        const tasksQuery = `
          MATCH (t:${NodeLabels.Task})
          RETURN t
        `;
        const tasksResult = await tx.run(tasksQuery);
        const tasks = tasksResult.records.map(record => record.get('t').properties);
        
        // Collect knowledge
        const knowledgeQuery = `
          MATCH (k:${NodeLabels.Knowledge})
          RETURN k
        `;
        const knowledgeResult = await tx.run(knowledgeQuery);
        const knowledge = knowledgeResult.records.map(record => record.get('k').properties);
        
        // Collect project dependencies
        const projectDepsQuery = `
          MATCH (source:${NodeLabels.Project})-[r:${RelationshipTypes.DEPENDS_ON}]->(target:${NodeLabels.Project})
          RETURN source.id AS sourceId, target.id AS targetId, r.id AS relationshipId, r.type AS type, r.description AS description, r.createdAt AS createdAt
        `;
        const projectDepsResult = await tx.run(projectDepsQuery);
        const projectDependencies = projectDepsResult.records.map(record => ({
          id: record.get('relationshipId'),
          sourceProjectId: record.get('sourceId'),
          targetProjectId: record.get('targetId'),
          type: record.get('type'),
          description: record.get('description'),
          createdAt: record.get('createdAt')
        }));
        
        // Collect task dependencies
        const taskDepsQuery = `
          MATCH (source:${NodeLabels.Task})-[r:${RelationshipTypes.DEPENDS_ON}]->(target:${NodeLabels.Task})
          RETURN source.id AS sourceId, target.id AS targetId, r.id AS relationshipId, r.createdAt AS createdAt
        `;
        const taskDepsResult = await tx.run(taskDepsQuery);
        const taskDependencies = taskDepsResult.records.map(record => ({
          id: record.get('relationshipId'),
          sourceTaskId: record.get('sourceId'),
          targetTaskId: record.get('targetId'),
          createdAt: record.get('createdAt')
        }));
        
        // Collect domains
        const domainsQuery = `
          MATCH (d:${NodeLabels.Domain})
          RETURN d
        `;
        const domainsResult = await tx.run(domainsQuery);
        const domains = domainsResult.records.map(record => record.get('d').properties);
        
        // Collect citations
        const citationsQuery = `
          MATCH (c:${NodeLabels.Citation})
          RETURN c
        `;
        const citationsResult = await tx.run(citationsQuery);
        const citations = citationsResult.records.map(record => record.get('c').properties);
        
        // Collect users
        const usersQuery = `
          MATCH (u:${NodeLabels.User})
          RETURN u
        `;
        const usersResult = await tx.run(usersQuery);
        const users = usersResult.records.map(record => record.get('u').properties);
        
        // Return all collected data
        return {
          projects,
          tasks,
          knowledge,
          dependencies: {
            projectDependencies,
            taskDependencies
          },
          domains,
          citations,
          users
        };
      });
    } finally {
      await session.close();
    }
  }

  /**
   * Rotate backup files to keep only the specified number of most recent backups
   * @private
   */
  private async rotateBackups(): Promise<void> {
    try {
      // Get all backup files
      const files = await readdir(this.backupDir);
      const backupFiles = files.filter(file => file.startsWith('atlas-backup-') && file.endsWith('.json'));
      
      // If we don't have too many backups, no need to rotate
      if (backupFiles.length <= this.maxBackupCount) {
        return;
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
      
      // Delete older files beyond the maximum count
      const filesToDelete = fileStats.slice(this.maxBackupCount);
      for (const fileInfo of filesToDelete) {
        await unlink(fileInfo.filePath);
        logger.info(`Deleted old backup file: ${fileInfo.file}`);
      }
    } catch (error) {
      logger.error('Error rotating backup files', { error });
      // Don't throw here, as this shouldn't fail the export process
    }
  }

  /**
   * Get a list of all available backup files with their stats
   * @returns Array of backup file information
   */
  async listBackups(): Promise<Array<{
    filename: string;
    filepath: string;
    size: number;
    created: Date;
  }>> {
    try {
      await this.ensureBackupDirExists();
      
      const files = await readdir(this.backupDir);
      const backupFiles = files.filter(file => file.startsWith('atlas-backup-') && file.endsWith('.json'));
      
      const backupInfo = await Promise.all(
        backupFiles.map(async file => {
          const filepath = path.join(this.backupDir, file);
          const stats = await stat(filepath);
          return {
            filename: file,
            filepath,
            size: stats.size,
            created: stats.mtime
          };
        })
      );
      
      // Sort by creation time (newest first)
      return backupInfo.sort((a, b) => b.created.getTime() - a.created.getTime());
    } catch (error) {
      logger.error('Error listing backup files', { error });
      throw new Error(`Failed to list backups: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Auto-export database after critical operations
   * This method is triggered by the AutoExportManager
   */
  async autoExport(): Promise<string | null> {
    logger.info('Auto-export triggered - attempting to create backup');
    try {
      // Ensure backup directory exists
      await this.ensureBackupDirExists();
      logger.info(`Using backup directory: ${this.backupDir}`);
      
      const filePath = await this.exportAllData({ includeMetadata: true });
      logger.info(`Auto-export completed successfully: ${filePath}`);
      return filePath;
    } catch (error) {
      logger.error('Auto-export failed', { error });
      return null;
    }
  }

  /**
   * Verify a backup file's integrity
   * @param filepath Path to the backup file
   * @returns Promise with validation result
   */
  async verifyBackup(filepath: string): Promise<{
    isValid: boolean;
    message: string;
    stats?: {
      entities: {
        projects: number;
        tasks: number;
        knowledge: number;
        domains: number;
        citations: number;
        users: number;
      };
      relationships: {
        projectDependencies: number;
        taskDependencies: number;
      };
    };
  }> {
    try {
      // Check if file exists
      if (!fs.existsSync(filepath)) {
        return {
          isValid: false,
          message: `Backup file not found: ${filepath}`
        };
      }

      // Read and parse the backup file
      const fileContent = await fs.promises.readFile(filepath, 'utf8');
      let backupData;
      
      try {
        backupData = JSON.parse(fileContent);
      } catch (error) {
        return {
          isValid: false,
          message: `Invalid JSON format in backup file: ${error instanceof Error ? error.message : String(error)}`
        };
      }

      // Validate structure
      if (!backupData.projects || !Array.isArray(backupData.projects) ||
          !backupData.tasks || !Array.isArray(backupData.tasks) ||
          !backupData.knowledge || !Array.isArray(backupData.knowledge) ||
          !backupData.dependencies || typeof backupData.dependencies !== 'object') {
        return {
          isValid: false,
          message: 'Invalid backup structure: missing required data collections'
        };
      }

      // Calculate statistics
      const stats = {
        entities: {
          projects: backupData.projects.length,
          tasks: backupData.tasks.length,
          knowledge: backupData.knowledge.length,
          domains: backupData.domains?.length || 0,
          citations: backupData.citations?.length || 0,
          users: backupData.users?.length || 0
        },
        relationships: {
          projectDependencies: backupData.dependencies.projectDependencies?.length || 0,
          taskDependencies: backupData.dependencies.taskDependencies?.length || 0
        }
      };

      return {
        isValid: true,
        message: 'Backup file is valid',
        stats
      };
    } catch (error) {
      logger.error('Error verifying backup file', { error, filepath });
      return {
        isValid: false,
        message: `Error verifying backup: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
}

// Export a singleton instance
export const exportService = new ExportService();
// Do not auto-initialize - will be initialized by initializeNeo4jServices() in the correct order
