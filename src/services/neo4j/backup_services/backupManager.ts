import { logger } from '../../../utils/logger.js';
import { databaseEvents, DatabaseEventType } from '../events.js';
import { Neo4jUtils } from '../utils.js';
import { autoExportManager } from './autoExportManager.js';
import { exportService } from './exportService.js';
import { importService } from './importService.js';

/**
 * Backup Manager for the Neo4j database
 * Provides utility functions for managing database backups
 */
export class BackupManager {
  private static instance: BackupManager;
  private isInitialized: boolean = false;
  private isRestoreInProgress: boolean = false;
  private lastOperation: string = '';

  /**
   * Get the singleton instance
   */
  public static getInstance(): BackupManager {
    if (!BackupManager.instance) {
      BackupManager.instance = new BackupManager();
    }
    return BackupManager.instance;
  }

  private constructor() {
    // Private constructor to enforce singleton pattern
  }

  /**
   * Initialize the backup manager
   */
  public initialize(): void {
    if (this.isInitialized) {
      return;
    }

    // Set up event listeners
    databaseEvents.subscribe(DatabaseEventType.TRANSACTION_COMPLETE, (data: any) => {
      if (data.operation === 'backup' || data.operation === 'restore') {
        logger.info(`Backup operation completed: ${data.operation}`, {
          timestamp: data.timestamp,
          filepath: data.filepath
        });
        this.lastOperation = data.operation;
      }
    });

    this.isInitialized = true;
    logger.info('Backup manager initialized');
  }

  /**
   * Initialize the database from the latest backup if available
   * @param forceRestore Whether to force restoration even if the database isn't empty
   * @returns Promise with the initialization result
   */
  async initializeFromLatestBackup(forceRestore: boolean = false): Promise<{
    success: boolean;
    message: string;
    backupUsed?: string;
  }> {
    try {
      if (this.isRestoreInProgress) {
        return {
          success: false,
          message: 'Another restore operation is already in progress.'
        };
      }

      this.isRestoreInProgress = true;
      
      // Check if database is empty
      const isEmpty = await Neo4jUtils.isDatabaseEmpty();
      
      if (!isEmpty && !forceRestore) {
        logger.info('Database is not empty, skipping backup restoration');
        this.isRestoreInProgress = false;
        return {
          success: true,
          message: 'Database already contains data, no restoration needed.'
        };
      }
      
      // Get the latest backup file
      const latestBackupFile = await importService.getLatestBackupFile();
      
      if (!latestBackupFile) {
        logger.info('No backup files found, starting with empty database');
        this.isRestoreInProgress = false;
        return {
          success: true,
          message: 'No backup files found, started with an empty database.'
        };
      }
      
      // Verify backup file integrity before importing
      const verificationResult = await exportService.verifyBackup(latestBackupFile);
      if (!verificationResult.isValid) {
        logger.error('Backup file validation failed', { 
          filepath: latestBackupFile,
          reason: verificationResult.message 
        });
        this.isRestoreInProgress = false;
        return {
          success: false,
          message: `Backup validation failed: ${verificationResult.message}`,
          backupUsed: latestBackupFile
        };
      }
      
      // Import from the latest backup
      logger.info(`Initializing database from backup: ${latestBackupFile}`);
      const importResult = await importService.importFromFile(latestBackupFile, true);
      
      if (importResult.success) {
        // Create a fresh backup after successful import
        databaseEvents.publish(DatabaseEventType.TRANSACTION_COMPLETE, {
          operation: 'backup_restore',
          timestamp: new Date().toISOString(),
          filepath: latestBackupFile
        });
        
        // Force export a new backup with updated timestamp
        const newBackupFile = await autoExportManager.forceExport();
        
        this.isRestoreInProgress = false;
        return {
          success: true,
          message: `Database initialized successfully from backup with ${
            importResult.importedEntities.projects
          } projects, ${
            importResult.importedEntities.tasks
          } tasks, and ${
            importResult.importedEntities.knowledge
          } knowledge items.`,
          backupUsed: latestBackupFile
        };
      } else {
        const errors = importResult.errors || ['Unknown import error'];
        logger.error('Failed to initialize database from backup', { errors });
        
        // Publish error event
        databaseEvents.publish(DatabaseEventType.ERROR, {
          operation: 'backup_restore',
          timestamp: new Date().toISOString(),
          error: errors[0],
          filepath: latestBackupFile
        });
        
        this.isRestoreInProgress = false;
        return {
          success: false,
          message: `Failed to initialize database from backup: ${errors[0]}`,
          backupUsed: latestBackupFile
        };
      }
    } catch (error) {
      logger.error('Error initializing database from backup', { error });
      
      // Publish error event
      databaseEvents.publish(DatabaseEventType.ERROR, {
        operation: 'backup_restore',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error)
      });
      
      this.isRestoreInProgress = false;
      return {
        success: false,
        message: `Error initializing database from backup: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
  
  /**
   * Get a list of all available backups
   * @returns Promise with array of backup information
   */
  async listAllBackups(): Promise<Array<{
    filename: string;
    filepath: string;
    size: number;
    created: Date;
  }>> {
    return exportService.listBackups();
  }
  
  /**
   * Create a manual backup of the database
   * @param options Backup options
   * @returns Promise with the path to the created backup file
   */
  async createManualBackup(options: {
    includeMetadata?: boolean;
    compressionLevel?: number;
  } = {}): Promise<string> {
    logger.info('Creating manual database backup', options);
    
    try {
      // Check if database is empty before backup
      const isEmpty = await Neo4jUtils.isDatabaseEmpty();
      if (isEmpty) {
        logger.warn('Creating backup of empty database');
      }
      
      const backupFile = await exportService.exportAllData({
        includeMetadata: options.includeMetadata !== false, // default to true
        compressionLevel: options.compressionLevel
      });
      
      // Publish backup event
      databaseEvents.publish(DatabaseEventType.TRANSACTION_COMPLETE, {
        operation: 'manual_backup',
        timestamp: new Date().toISOString(),
        filepath: backupFile
      });
      
      return backupFile;
    } catch (error) {
      logger.error('Error creating manual backup', { error });
      
      // Publish error event
      databaseEvents.publish(DatabaseEventType.ERROR, {
        operation: 'manual_backup',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error)
      });
      
      throw error;
    }
  }
  
  /**
   * Restore the database from a specific backup file
   * @param backupFilePath Path to the backup file
   * @returns Promise with the restoration result
   */
  async restoreFromBackup(backupFilePath: string): Promise<{
    success: boolean;
    message: string;
    importedEntities?: {
      projects: number;
      tasks: number;
      knowledge: number;
      dependencies: number;
      domains: number;
      citations: number;
      users: number;
    };
  }> {
    try {
      if (this.isRestoreInProgress) {
        return {
          success: false,
          message: 'Another restore operation is already in progress.'
        };
      }

      this.isRestoreInProgress = true;
      logger.info(`Restoring database from backup: ${backupFilePath}`);
      
      // First verify the backup file
      const verificationResult = await exportService.verifyBackup(backupFilePath);
      if (!verificationResult.isValid) {
        logger.error('Backup file validation failed', { 
          filepath: backupFilePath,
          reason: verificationResult.message 
        });
        
        this.isRestoreInProgress = false;
        return {
          success: false,
          message: `Backup validation failed: ${verificationResult.message}`
        };
      }
      
      // Import from the backup file
      const importResult = await importService.importFromFile(backupFilePath, true);
      
      if (importResult.success) {
        // Create a fresh backup after successful import
        databaseEvents.publish(DatabaseEventType.TRANSACTION_COMPLETE, {
          operation: 'backup_restore',
          timestamp: new Date().toISOString(),
          filepath: backupFilePath,
          entityCounts: importResult.importedEntities
        });
        
        // Force export a new backup with updated timestamp
        await autoExportManager.forceExport();
        
        this.isRestoreInProgress = false;
        return {
          success: true,
          message: `Database restored successfully with ${
            importResult.importedEntities.projects
          } projects, ${
            importResult.importedEntities.tasks
          } tasks, and ${
            importResult.importedEntities.knowledge
          } knowledge items.`,
          importedEntities: importResult.importedEntities
        };
      } else {
        const errors = importResult.errors || ['Unknown import error'];
        logger.error('Failed to restore database from backup', { errors });
        
        // Publish error event
        databaseEvents.publish(DatabaseEventType.ERROR, {
          operation: 'backup_restore',
          timestamp: new Date().toISOString(),
          error: errors[0],
          filepath: backupFilePath
        });
        
        this.isRestoreInProgress = false;
        return {
          success: false,
          message: `Failed to restore database from backup: ${errors[0]}`
        };
      }
    } catch (error) {
      logger.error('Error restoring database from backup', { error });
      
      // Publish error event
      databaseEvents.publish(DatabaseEventType.ERROR, {
        operation: 'backup_restore',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
        filepath: backupFilePath
      });
      
      this.isRestoreInProgress = false;
      return {
        success: false,
        message: `Error restoring database from backup: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
  
  /**
   * Get information about a specific backup file
   * @param backupFilePath Path to the backup file
   * @returns Promise with backup information
   */
  async getBackupInfo(backupFilePath: string): Promise<{
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
      return await exportService.verifyBackup(backupFilePath);
    } catch (error) {
      logger.error('Error getting backup info', { error, backupFilePath });
      return {
        isValid: false,
        message: `Error retrieving backup information: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
}

// Export a singleton instance
export const backupManager = BackupManager.getInstance();
// Do not auto-initialize - will be initialized by initializeNeo4jServices() in the correct order
