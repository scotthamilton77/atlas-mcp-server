/**
 * File management module for Neo4j backup service
 */
import { createReadStream, createWriteStream, promises as fs } from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { createGzip, createGunzip } from 'zlib';
import { logger } from '../../../utils/logger.js';
import { BackupData, RetentionOptions, VerifyBackupResult } from './types.js';

/**
 * Handles file operations for backups
 */
export class FileManager {
  /**
   * Create a compressed backup file
   * @param backupData The data to backup
   * @param destinationPath Path where the backup should be saved
   * @param compressionLevel Level of compression (0-9)
   * @returns The file path and size
   */
  static async createCompressedBackupFile(
    backupData: BackupData,
    destinationPath: string,
    compressionLevel: number = 6
  ): Promise<{ filePath: string; size: number }> {
    try {
      // Ensure destination directory exists
      await fs.mkdir(path.dirname(destinationPath), { recursive: true });
      
      // Generate backup file name if not a full path
      const backupFileName = path.basename(destinationPath).endsWith('.json.gz') 
        ? destinationPath 
        : path.join(destinationPath, `atlas_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json.gz`);
      
      // Convert data to JSON string
      const backupJson = JSON.stringify(backupData, null, 2);
      
      // Create gzip compressed file
      const gzip = createGzip({ level: compressionLevel });
      
      // Write to file with compression
      await pipeline(
        Buffer.from(backupJson),
        gzip,
        createWriteStream(backupFileName)
      );
      
      // Get file size
      const stats = await fs.stat(backupFileName);
      
      return {
        filePath: backupFileName,
        size: stats.size
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to create compressed backup file', { error, destinationPath });
      throw new Error(`Failed to create backup file: ${errorMessage}`);
    }
  }

  /**
   * Extract backup data from a compressed backup file
   * @param backupPath Path to the backup file
   * @returns The extracted backup data
   */
  static async extractBackupData(backupPath: string): Promise<BackupData> {
    try {
      // Check if file exists
      await fs.access(backupPath);
      
      // Create a temporary file to store decompressed content
      const tempFile = path.join(
        path.dirname(backupPath),
        `temp-extract-${Date.now()}.json`
      );
      
      // Decompress the backup file
      try {
        await pipeline(
          createReadStream(backupPath),
          createGunzip(),
          createWriteStream(tempFile)
        );
      } catch (error) {
        logger.error('Failed to decompress backup file', { error });
        throw new Error(`Failed to decompress backup file: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      // Read and parse the JSON content
      const content = await fs.readFile(tempFile, 'utf8');
      let backupData: BackupData;
      
      try {
        backupData = JSON.parse(content);
      } catch (error) {
        // Delete temporary file
        await fs.unlink(tempFile);
        throw new Error(`Invalid backup JSON: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      // Delete temporary file
      await fs.unlink(tempFile);
      
      // Validate backup structure
      if (!backupData.metadata || !backupData.metadata.timestamp) {
        throw new Error('Invalid backup file structure: Missing metadata');
      }
      
      return backupData;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to extract backup data', { error, backupPath });
      throw new Error(`Failed to extract backup data: ${errorMessage}`);
    }
  }

  /**
   * Manage backup files according to retention policy
   * @param backupDir Directory containing backups
   * @param options Retention policy options
   */
  static async manageBackupRetention(
    backupDir: string,
    options: RetentionOptions
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
      if (backupFiles.length > options.maxBackups) {
        const filesToDelete = backupFiles.slice(options.maxBackups);
        
        for (const file of filesToDelete) {
          logger.info(`Removing old backup file: ${file.name}`);
          await fs.unlink(file.path);
        }
      }
      
      // Apply retention policy based on age
      if (options.retentionPeriod > 0) {
        const cutoffDate = new Date();
        // Convert retention period days to milliseconds
        cutoffDate.setTime(cutoffDate.getTime() - (options.retentionPeriod * 24 * 60 * 60 * 1000));
        
        for (const file of backupFiles) {
          if (file.timestamp < cutoffDate) {
            logger.info(`Removing expired backup file: ${file.name}`);
            await fs.unlink(file.path);
          }
        }
      }
    } catch (error) {
      logger.error('Error managing backup retention', { error, backupDir });
      // Don't throw error to avoid failing the main backup
    }
  }

  /**
   * Verify a backup file's integrity and contents
   * @param backupPath Path to the backup file
   * @returns Validation result with metadata about the backup
   */
  static async verifyBackup(backupPath: string): Promise<VerifyBackupResult> {
    try {
      logger.info('Verifying backup file integrity', { backupPath });
      
      if (!backupPath.endsWith('.json.gz')) {
        return {
          valid: false,
          error: 'Invalid backup file format. Expected .json.gz file'
        };
      }
      
      // Extract backup data
      let backupData: BackupData;
      try {
        backupData = await this.extractBackupData(backupPath);
      } catch (error) {
        return {
          valid: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
      
      // Validate backup structure
      if (!Array.isArray(backupData.projects) || 
          !Array.isArray(backupData.tasks) || 
          !Array.isArray(backupData.knowledge)) {
        return {
          valid: false,
          error: 'Invalid backup file structure. Missing entity arrays'
        };
      }
      
      logger.info('Backup file verified successfully', {
        timestamp: backupData.metadata.timestamp,
        version: backupData.metadata.version,
        projects: backupData.projects.length,
        tasks: backupData.tasks.length,
        knowledge: backupData.knowledge.length,
        relationships: backupData.relationships?.length || 0
      });
      
      return {
        valid: true,
        metadata: {
          timestamp: backupData.metadata.timestamp,
          version: backupData.metadata.version,
          entityCounts: {
            projects: backupData.projects.length,
            tasks: backupData.tasks.length,
            knowledge: backupData.knowledge.length,
            relationships: backupData.relationships?.length || 0
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

  /**
   * Extract timestamp from backup filename
   * @param filename Backup filename
   * @returns Date object
   */
  static extractTimestampFromFilename(filename: string): Date {
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
}
