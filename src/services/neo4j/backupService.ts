import { createReadStream, createWriteStream, promises as fs } from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { createGzip } from 'zlib';

import { logger } from '../../utils/logger.js';
import { neo4jDriver } from './driver.js';
import {
  Neo4jKnowledge,
  Neo4jProject,
  Neo4jTask,
  NodeLabels
} from './types.js';
import { Neo4jUtils } from './utils.js';

/**
 * Configuration options for database backup
 */
export interface BackupOptions {
  destinationPath: string;
  includeProjects?: boolean;
  includeTasks?: boolean;
  includeKnowledge?: boolean;
  compressionLevel?: number;
  encryptBackup?: boolean;
  scheduleBackup?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    retentionPeriod: number;
    maxBackups: number;
  };
}

/**
 * Result of a backup operation
 */
export interface BackupResult {
  success: boolean;
  timestamp: string;
  filename: string;
  size: number;
  entities: {
    projects: number;
    tasks: number;
    knowledge: number;
  };
  error?: string;
}

/**
 * Service for database backup operations
 */
export class BackupService {
  /**
   * Create a backup of the Neo4j database
   * @param options Backup configuration options
   * @returns Result of the backup operation
   */
  static async createBackup(options: BackupOptions): Promise<BackupResult> {
    try {
      logger.info('Starting Neo4j database backup', { destinationPath: options.destinationPath });
      
      // Ensure destination directory exists
      await fs.mkdir(path.dirname(options.destinationPath), { recursive: true });
      
      // Default options
      const includeProjects = options.includeProjects !== false;
      const includeTasks = options.includeTasks !== false;
      const includeKnowledge = options.includeKnowledge !== false;
      
      // Initialize backup data object
      const backupData: {
        metadata: {
          timestamp: string;
          version: string;
        };
        projects: Neo4jProject[];
        tasks: Neo4jTask[];
        knowledge: Neo4jKnowledge[];
      } = {
        metadata: {
          timestamp: new Date().toISOString(),
          version: '1.0.0'
        },
        projects: [],
        tasks: [],
        knowledge: []
      };
      
      // Fetch data for backup
      if (includeProjects) {
        backupData.projects = await this.fetchAllProjects();
        logger.info(`Fetched ${backupData.projects.length} projects for backup`);
      }
      
      if (includeTasks) {
        backupData.tasks = await this.fetchAllTasks();
        logger.info(`Fetched ${backupData.tasks.length} tasks for backup`);
      }
      
      if (includeKnowledge) {
        backupData.knowledge = await this.fetchAllKnowledge();
        logger.info(`Fetched ${backupData.knowledge.length} knowledge items for backup`);
      }
      
      // Generate backup file name if not a full path
      const backupFileName = path.basename(options.destinationPath).endsWith('.json.gz') 
        ? options.destinationPath 
        : path.join(options.destinationPath, `atlas_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json.gz`);
      
      // Convert data to JSON string
      const backupJson = JSON.stringify(backupData, null, 2);
      
      // Create gzip compressed file
      const gzip = createGzip({
        level: options.compressionLevel || 6 // Default compression level
      });
      
      // Write to file with compression
      await pipeline(
        Buffer.from(backupJson),
        gzip,
        createWriteStream(backupFileName)
      );
      
      // Get file size
      const stats = await fs.stat(backupFileName);
      
      // Handle scheduled backups if configured
      if (options.scheduleBackup) {
        await this.manageScheduledBackups(
          path.dirname(backupFileName),
          options.scheduleBackup
        );
      }
      
      logger.info('Neo4j database backup completed successfully', {
        filename: backupFileName,
        size: stats.size
      });
      
      return {
        success: true,
        timestamp: backupData.metadata.timestamp,
        filename: backupFileName,
        size: stats.size,
        entities: {
          projects: backupData.projects.length,
          tasks: backupData.tasks.length,
          knowledge: backupData.knowledge.length
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
          knowledge: 0
        },
        error: errorMessage
      };
    }
  }
  
  /**
   * Fetch all projects from the database
   * @private
   */
  private static async fetchAllProjects(): Promise<Neo4jProject[]> {
    const session = await neo4jDriver.getSession();
    
    try {
      const query = `
        MATCH (p:${NodeLabels.Project})
        RETURN p
        ORDER BY p.createdAt
      `;
      
      const result = await session.executeRead(async (tx) => {
        const result = await tx.run(query);
        return result.records;
      });
      
      return Neo4jUtils.processRecords<Neo4jProject>(result, 'p');
    } catch (error) {
      logger.error('Error fetching projects for backup', { error });
      throw error;
    } finally {
      await session.close();
    }
  }
  
  /**
   * Fetch all tasks from the database
   * @private
   */
  private static async fetchAllTasks(): Promise<Neo4jTask[]> {
    const session = await neo4jDriver.getSession();
    
    try {
      const query = `
        MATCH (t:${NodeLabels.Task})
        RETURN t
        ORDER BY t.createdAt
      `;
      
      const result = await session.executeRead(async (tx) => {
        const result = await tx.run(query);
        return result.records;
      });
      
      return Neo4jUtils.processRecords<Neo4jTask>(result, 't');
    } catch (error) {
      logger.error('Error fetching tasks for backup', { error });
      throw error;
    } finally {
      await session.close();
    }
  }
  
  /**
   * Fetch all knowledge items from the database
   * @private
   */
  private static async fetchAllKnowledge(): Promise<Neo4jKnowledge[]> {
    const session = await neo4jDriver.getSession();
    
    try {
      const query = `
        MATCH (k:${NodeLabels.Knowledge})
        RETURN k
        ORDER BY k.createdAt
      `;
      
      const result = await session.executeRead(async (tx) => {
        const result = await tx.run(query);
        return result.records;
      });
      
      return Neo4jUtils.processRecords<Neo4jKnowledge>(result, 'k');
    } catch (error) {
      logger.error('Error fetching knowledge items for backup', { error });
      throw error;
    } finally {
      await session.close();
    }
  }
  
  /**
   * Manage scheduled backups by enforcing retention policies
   * @param backupDir Directory containing backups
   * @param schedule Schedule configuration
   * @private
   */
  private static async manageScheduledBackups(
    backupDir: string,
    schedule: {
      frequency: 'daily' | 'weekly' | 'monthly';
      retentionPeriod: number;
      maxBackups: number;
    }
  ): Promise<void> {
    try {
      // Get all backup files
      const files = await fs.readdir(backupDir);
      const backupFiles = files
        .filter(file => file.startsWith('atlas_backup_') && file.endsWith('.json.gz'))
        .map(file => ({
          name: file,
          path: path.join(backupDir, file),
          timestamp: this.extractTimestampFromFilename(file)
        }))
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()); // Sort newest first
      
      // Apply retention policy based on count
      if (backupFiles.length > schedule.maxBackups) {
        const filesToDelete = backupFiles.slice(schedule.maxBackups);
        
        for (const file of filesToDelete) {
          logger.info(`Removing old backup file: ${file.name}`);
          await fs.unlink(file.path);
        }
      }
      
      // Apply retention policy based on age
      if (schedule.retentionPeriod > 0) {
        const cutoffDate = new Date();
        // Convert retention period days to milliseconds
        cutoffDate.setTime(cutoffDate.getTime() - (schedule.retentionPeriod * 24 * 60 * 60 * 1000));
        
        for (const file of backupFiles) {
          if (file.timestamp < cutoffDate) {
            logger.info(`Removing expired backup file: ${file.name}`);
            await fs.unlink(file.path);
          }
        }
      }
    } catch (error) {
      logger.error('Error managing scheduled backups', { error });
      // Don't throw error to avoid failing the main backup
    }
  }
  
  /**
   * Extract timestamp from backup filename
   * @param filename Backup filename
   * @returns Date object
   * @private
   */
  private static extractTimestampFromFilename(filename: string): Date {
    try {
      // Filename format: atlas_backup_YYYY-MM-DDThh-mm-ss-mmmZ.json.gz
      const timestampPart = filename
        .replace('atlas_backup_', '')
        .replace('.json.gz', '')
        .replace(/-/g, (match, offset) => {
          // Convert back to standard ISO format but only replace the hyphens that 
          // replaced colons (positions that would have colons in original ISO string)
          if (offset === 13 || offset === 16) return ':';
          return match;
        });
      
      return new Date(timestampPart);
    } catch (error) {
      logger.warn('Could not parse timestamp from filename', { filename });
      return new Date(0); // Return epoch if parsing fails
    }
  }
  
  /**
   * Verify a backup file's integrity
   * @param backupPath Path to the backup file
   * @returns Validation result
   */
  static async verifyBackup(backupPath: string): Promise<{
    valid: boolean;
    metadata?: {
      timestamp: string;
      version: string;
      entityCounts: {
        projects: number;
        tasks: number;
        knowledge: number;
      };
    };
    error?: string;
  }> {
    try {
      logger.info('Verifying backup file integrity', { backupPath });
      
      if (!backupPath.endsWith('.json.gz')) {
        return {
          valid: false,
          error: 'Invalid backup file format. Expected .json.gz file'
        };
      }
      
      // Check if file exists
      await fs.access(backupPath);
      
      // Create a temporary file to store decompressed content
      const tempFile = path.join(
        path.dirname(backupPath),
        `temp-verify-${Date.now()}.json`
      );
      
      // Decompress file
      await pipeline(
        createReadStream(backupPath),
        createGzip({ level: 6 }),
        createWriteStream(tempFile)
      );
      
      // Read and parse the JSON content
      const content = await fs.readFile(tempFile, 'utf8');
      const backup = JSON.parse(content);
      
      // Delete temporary file
      await fs.unlink(tempFile);
      
      // Validate backup structure
      if (!backup.metadata || !backup.metadata.timestamp || !backup.metadata.version) {
        return {
          valid: false,
          error: 'Invalid backup file structure. Missing metadata'
        };
      }
      
      if (!Array.isArray(backup.projects) || 
          !Array.isArray(backup.tasks) || 
          !Array.isArray(backup.knowledge)) {
        return {
          valid: false,
          error: 'Invalid backup file structure. Missing entity arrays'
        };
      }
      
      logger.info('Backup file verified successfully', {
        timestamp: backup.metadata.timestamp,
        version: backup.metadata.version,
        projects: backup.projects.length,
        tasks: backup.tasks.length,
        knowledge: backup.knowledge.length
      });
      
      return {
        valid: true,
        metadata: {
          timestamp: backup.metadata.timestamp,
          version: backup.metadata.version,
          entityCounts: {
            projects: backup.projects.length,
            tasks: backup.tasks.length,
            knowledge: backup.knowledge.length
          }
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error verifying backup file', { error, backupPath });
      
      return {
        valid: false,
        error: `Backup verification failed: ${errorMessage}`
      };
    }
  }
  
  /**
   * List available backups in a directory
   * @param backupDir Directory containing backups
   * @returns List of backup files with metadata
   */
  static async listBackups(backupDir: string): Promise<Array<{
    filename: string;
    path: string;
    timestamp: Date;
    size: number;
  }>> {
    try {
      logger.info('Listing backup files', { backupDir });
      
      // Ensure directory exists
      await fs.mkdir(backupDir, { recursive: true });
      
      // Get all files in the directory
      const files = await fs.readdir(backupDir);
      const backupFiles = files.filter(file => 
        file.startsWith('atlas_backup_') && file.endsWith('.json.gz')
      );
      
      // Get details for each backup file
      const backups = await Promise.all(backupFiles.map(async (file) => {
        const filePath = path.join(backupDir, file);
        const stats = await fs.stat(filePath);
        
        return {
          filename: file,
          path: filePath,
          timestamp: this.extractTimestampFromFilename(file),
          size: stats.size
        };
      }));
      
      // Sort by timestamp (newest first)
      return backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    } catch (error) {
      logger.error('Error listing backup files', { error, backupDir });
      throw error;
    }
  }
}
