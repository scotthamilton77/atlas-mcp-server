/**
 * Core backup service implementation
 */
import nodeCron from 'node-cron';
import { config } from '../../../config/index.js';
import { logger } from '../../../utils/logger.js';
import { DataFetcher } from './data-fetcher.js';
import { FileManager } from './file-manager.js';
import { ImportService } from './import-service.js';
import { 
  BackupData, 
  BackupOptions, 
  BackupResult, 
  ImportOptions,
  ImportResult,
  VerifyBackupResult
} from './types.js';

/**
 * Primary service for Neo4j database backup and import operations
 */
export class BackupService {
  private static cronJob: nodeCron.ScheduledTask | null = null;
  
  /**
   * Initialize the backup service
   */
  static async init(): Promise<void> {
    if (config.backup.enabled) {
      await this.setupScheduledBackups();
      
      // Perform startup backup if configured
      if (config.backup.backupOnStart) {
        try {
          logger.info('Performing startup backup...');
          await this.performBackup();
        } catch (error) {
          logger.error('Failed to perform startup backup', { error });
        }
      }
    } else {
      logger.info('Automatic database backups are disabled');
    }
  }
  
  /**
   * Configure scheduled backups based on configuration
   */
  private static async setupScheduledBackups(): Promise<void> {
    // Stop any existing cron job
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
    
    if (config.backup.enabled && config.backup.schedule) {
      try {
        // Add detailed debug logging
        logger.debug('Backup configuration values:', {
          enabled: config.backup.enabled,
          schedule: config.backup.schedule,
          rawSchedule: process.env.BACKUP_SCHEDULE,
          maxBackups: config.backup.maxBackups,
          backupOnStart: config.backup.backupOnStart,
          backupPath: config.backup.backupPath,
          compressionLevel: config.backup.compressionLevel,
          retentionDays: config.backup.retentionDays
        });
        
        // Validate the cron schedule
        if (!nodeCron.validate(config.backup.schedule)) {
          throw new Error(`Invalid cron schedule: ${config.backup.schedule}`);
        }
        
        logger.info('Setting up scheduled database backups', { 
          schedule: config.backup.schedule,
          backupPath: config.backup.backupPath
        });
        
        // Create the scheduled task
        this.cronJob = nodeCron.schedule(config.backup.schedule, async () => {
          try {
            logger.info('Running scheduled database backup...');
            await this.performBackup();
          } catch (error) {
            logger.error('Scheduled backup failed', { error });
          }
        });
        
        logger.info('Scheduled database backups configured successfully');
      } catch (error) {
        logger.error('Failed to setup scheduled backups', { error });
        throw error;
      }
    }
  }
  
  /**
   * Perform a database backup using current configuration
   */
  static async performBackup(): Promise<BackupResult> {
    return this.createBackup({
      destinationPath: config.backup.backupPath,
      compressionLevel: config.backup.compressionLevel,
      includeProjects: true,
      includeTasks: true,
      includeKnowledge: true,
      includeRelationships: true,
      scheduleBackup: {
        frequency: 'daily',
        retentionPeriod: config.backup.retentionDays,
        maxBackups: config.backup.maxBackups
      }
    });
  }
  
  /**
   * Stop the backup service
   */
  static stop(): void {
    if (this.cronJob) {
      logger.info('Stopping scheduled database backups');
      this.cronJob.stop();
      this.cronJob = null;
    }
  }

  /**
   * Create a backup of the Neo4j database
   * @param options Backup configuration options
   * @returns Result of the backup operation
   */
  static async createBackup(options: BackupOptions): Promise<BackupResult> {
    try {
      logger.info('Starting Neo4j database backup', { destinationPath: options.destinationPath });
      
      // Default options
      const includeProjects = options.includeProjects !== false;
      const includeTasks = options.includeTasks !== false;
      const includeKnowledge = options.includeKnowledge !== false;
      const includeRelationships = options.includeRelationships !== false;
      
      // Initialize backup data object
      const backupData: BackupData = {
        metadata: {
          timestamp: new Date().toISOString(),
          version: '1.1.0',
          databaseInfo: {
            neo4jVersion: 'neo4j-' + process.env.NEO4J_VERSION || 'unknown'
          }
        },
        projects: [],
        tasks: [],
        knowledge: [],
        relationships: []
      };
      
      // Fetch data for backup
      if (includeProjects) {
        backupData.projects = await DataFetcher.fetchAllProjects();
        logger.info(`Fetched ${backupData.projects.length} projects for backup`);
      }
      
      if (includeTasks) {
        backupData.tasks = await DataFetcher.fetchAllTasks();
        logger.info(`Fetched ${backupData.tasks.length} tasks for backup`);
      }
      
      if (includeKnowledge) {
        backupData.knowledge = await DataFetcher.fetchAllKnowledge();
        logger.info(`Fetched ${backupData.knowledge.length} knowledge items for backup`);
      }
      
      if (includeRelationships) {
        backupData.relationships = await DataFetcher.fetchAllRelationships();
        logger.info(`Fetched ${backupData.relationships.length} relationships for backup`);
      }
      
      // Create the compressed backup file
      const { filePath, size } = await FileManager.createCompressedBackupFile(
        backupData,
        options.destinationPath,
        options.compressionLevel || config.backup.compressionLevel
      );
      
      // Handle scheduled backups if configured
      if (options.scheduleBackup) {
        await FileManager.manageBackupRetention(
          path.dirname(filePath),
          options.scheduleBackup
        );
      }
      
      logger.info('Neo4j database backup completed successfully', {
        filename: filePath,
        size: size
      });
      
      return {
        success: true,
        timestamp: backupData.metadata.timestamp,
        filename: filePath,
        size: size,
        entities: {
          projects: backupData.projects.length,
          tasks: backupData.tasks.length,
          knowledge: backupData.knowledge.length,
          relationships: backupData.relationships.length
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to create Neo4j database backup', { error });
      
      return {
        success: false,
        timestamp: new Date().toISOString(),
        filename: '',
        size: 0,
        entities: {
          projects: 0,
          tasks: 0,
          knowledge: 0,
          relationships: 0
        },
        error: errorMessage
      };
    }
  }
  
  /**
   * Import data from a backup file into the Neo4j database
   * @param options Import configuration options
   * @returns Result of the import operation
   */
  static async importBackup(options: ImportOptions): Promise<ImportResult> {
    return ImportService.importBackup(options);
  }
  
  /**
   * Verify a backup file's integrity and contents
   * @param backupPath Path to the backup file
   * @returns Validation result with metadata about the backup
   */
  static async verifyBackup(backupPath: string): Promise<VerifyBackupResult> {
    return FileManager.verifyBackup(backupPath);
  }
  
  /**
   * List available backups in a directory
   * @param backupDir Directory containing backups (defaults to configured backup path)
   */
  static async listBackups(backupDir?: string): Promise<Array<{
    filename: string;
    path: string;
    timestamp: Date;
    size: number;
  }>> {
    return FileManager.listBackups(backupDir || config.backup.backupPath);
  }
}

// Import path module needed for the class
import path from 'path';
