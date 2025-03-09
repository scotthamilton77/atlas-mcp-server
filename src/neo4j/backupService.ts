import { scheduleJob } from 'node-schedule';
import path from "path";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";
import { promises as fsPromises } from "fs";
import { exportDatabase, listDatabaseExports } from "./exportImport.js";
import { logger } from "../utils/logger.js";

// Compute __filename and __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Set the backup directory to the "backups" folder at the project root
const BACKUP_DIR = join(__dirname, "../../backups");

// Backup service configuration interface
interface BackupServiceConfig {
  schedule?: string;       // Cron expression (default: every 6 hours)
  maxBackups?: number;     // Maximum number of backups to keep (default: 10)
  backupOnStart?: boolean; // Whether to perform a backup when the service starts (default: false)
  enabled?: boolean;       // Whether the service is enabled (default: true)
}

/**
 * Service for managing automated database backups.
 */
export class BackupService {
  private schedule: string;
  private maxBackups: number;
  private backupOnStart: boolean;
  private enabled: boolean;
  private job: ReturnType<typeof scheduleJob> | null = null;

  constructor(config: BackupServiceConfig = {}) {
    this.schedule = config.schedule || '0 */6 * * *';
    this.maxBackups = config.maxBackups || 10;
    this.backupOnStart = config.backupOnStart !== undefined ? config.backupOnStart : false;
    this.enabled = config.enabled !== undefined ? config.enabled : true;
  }

  /**
   * Starts the backup service.
   */
  public async start(): Promise<void> {
    if (!this.enabled) {
      logger.info('Backup service is disabled');
      return;
    }

    logger.info('Starting database backup service', {
      schedule: this.schedule,
      maxBackups: this.maxBackups,
      backupOnStart: this.backupOnStart
    });

    // Ensure backup directory exists
    await this.ensureBackupDirExists();

    // Perform initial backup if configured
    if (this.backupOnStart) {
      try {
        logger.info('Performing initial backup on service start');
        await this.performBackup();
      } catch (error) {
        logger.error('Initial backup failed', { error });
      }
    }

    // Schedule regular backups
    this.job = scheduleJob('database-backup', this.schedule, async () => {
      try {
        logger.info('Performing scheduled database backup');
        await this.performBackup();
      } catch (error) {
        logger.error('Scheduled backup failed', { error });
      }
    });

    logger.info('Database backup service started');
  }

  /**
   * Stops the backup service.
   */
  public stop(): void {
    if (this.job) {
      this.job.cancel();
      this.job = null;
      logger.info('Database backup service stopped');
    }
  }

  /**
   * Manually triggers a backup.
   */
  public async triggerBackup(): Promise<string> {
    logger.info('Manual backup triggered');
    const result = await this.performBackup();
    return result.filePath;
  }

  /**
   * Performs a backup and manages backup rotation.
   */
  private async performBackup() {
    // Perform the export
    const result = await exportDatabase();
    
    logger.info('Database backup completed', {
      filePath: result.filePath,
      nodeCount: result.nodeCount,
      relationshipCount: result.relationshipCount
    });

    // Manage backup rotation (keep only the most recent backups)
    await this.cleanupOldBackups();

    return result;
  }

  /**
   * Ensures the backup directory exists.
   */
  private async ensureBackupDirExists(): Promise<void> {
    try {
      await fsPromises.mkdir(BACKUP_DIR, { recursive: true });
    } catch (error) {
      logger.error('Failed to create backup directory', { error, path: BACKUP_DIR });
      throw error;
    }
  }

  /**
   * Cleans up old backups according to the maxBackups setting.
   */
  private async cleanupOldBackups(): Promise<void> {
    try {
      const exports = await listDatabaseExports();
      
      // If there are more backups than allowed, delete the oldest ones
      if (exports.length > this.maxBackups) {
        const exportsToDelete = exports.slice(this.maxBackups);
        
        for (const exp of exportsToDelete) {
          logger.info('Removing old backup file', { path: exp.path });
          await fsPromises.unlink(exp.path);
        }
        
        logger.info(`Cleaned up ${exportsToDelete.length} old backup files`);
      }
    } catch (error) {
      logger.error('Failed to clean up old backups', { error });
    }
  }
}

// Singleton instance of the backup service
let backupServiceInstance: BackupService | null = null;

/**
 * Gets the backup service instance, creating it if it doesn't exist.
 */
export const getBackupService = (config?: BackupServiceConfig): BackupService => {
  if (!backupServiceInstance) {
    backupServiceInstance = new BackupService(config);
  }
  return backupServiceInstance;
};