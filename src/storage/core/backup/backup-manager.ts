import { promises as fs } from 'fs';
import path from 'path';
import { Logger } from '../../../logging/index.js';
import { ErrorCodes, createError } from '../../../errors/index.js';

interface BackupSet {
  timestamp: number;
  files: string[];
}

export class BackupManager {
  private readonly logger: Logger;
  private readonly maxBackups = 10;
  private readonly backupDir: string;
  private readonly dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.backupDir = path.join(path.dirname(dbPath), 'backups');
    this.logger = Logger.getInstance().child({ component: 'BackupManager' });
  }

  /**
   * Create a new backup set including db, WAL, and SHM files
   */
  async createBackup(): Promise<void> {
    const timestamp = Date.now();
    const backupName = `backup-${timestamp}`;

    try {
      // Ensure backup directory exists
      await fs.mkdir(this.backupDir, { recursive: true });

      // Create backup directory for this set
      const backupSetDir = path.join(this.backupDir, backupName);
      await fs.mkdir(backupSetDir);

      // Always try to backup the main database file first
      const mainDbExists = await fs
        .access(this.dbPath)
        .then(() => true)
        .catch(() => false);

      if (!mainDbExists) {
        this.logger.error('Main database file not found during backup', {
          context: {
            operation: 'createBackup',
            dbPath: this.dbPath,
          },
        });
        await fs.rm(backupSetDir, { recursive: true, force: true });
        throw createError(
          ErrorCodes.STORAGE_ERROR,
          'Main database file not found',
          'createBackup',
          `Database file not found at ${this.dbPath}`
        );
      }

      // Copy main database file
      const mainDbDest = path.join(backupSetDir, path.basename(this.dbPath));
      await fs.copyFile(this.dbPath, mainDbDest);

      // Check for WAL mode files only if they exist
      const walFile = `${this.dbPath}-wal`;
      const shmFile = `${this.dbPath}-shm`;

      const walExists = await fs
        .access(walFile)
        .then(() => true)
        .catch(() => false);

      const shmExists = await fs
        .access(shmFile)
        .then(() => true)
        .catch(() => false);

      if (walExists) {
        await fs.copyFile(walFile, path.join(backupSetDir, path.basename(walFile)));
      }

      if (shmExists) {
        await fs.copyFile(shmFile, path.join(backupSetDir, path.basename(shmFile)));
      }

      // Verify backup contains at least the main database file
      const backupFiles = await fs.readdir(backupSetDir);
      if (backupFiles.length === 0) {
        this.logger.error('Backup directory is empty after copy operations', {
          context: {
            operation: 'createBackup',
            backupSetDir,
          },
        });
        await fs.rm(backupSetDir, { recursive: true, force: true });
        throw createError(
          ErrorCodes.STORAGE_ERROR,
          'Backup creation failed - no files copied',
          'createBackup',
          'Backup directory is empty after copy operations'
        );
      }

      this.logger.info('Backup set created', {
        context: {
          operation: 'createBackup',
          timestamp,
          backupName,
          location: backupSetDir,
        },
      });

      // Rotate old backups
      await this.rotateBackups();
    } catch (error) {
      this.logger.error('Failed to create backup set', {
        error,
        context: {
          operation: 'createBackup',
          timestamp,
          backupName,
        },
      });
      throw createError(
        ErrorCodes.STORAGE_ERROR,
        'Backup creation failed',
        'createBackup',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * List all available backup sets
   */
  async listBackups(): Promise<BackupSet[]> {
    try {
      const backups: BackupSet[] = [];
      const entries = await fs.readdir(this.backupDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('backup-')) {
          const timestamp = parseInt(entry.name.split('-')[1]);
          if (!isNaN(timestamp)) {
            const backupDir = path.join(this.backupDir, entry.name);
            const files = await fs.readdir(backupDir);
            backups.push({
              timestamp,
              files: files.map(f => path.join(backupDir, f)),
            });
          }
        }
      }

      // Sort by timestamp descending (newest first)
      return backups.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Backup directory doesn't exist yet
        return [];
      }
      throw error;
    }
  }

  /**
   * Restore from a specific backup set
   */
  async restoreBackup(timestamp: number): Promise<void> {
    const backupName = `backup-${timestamp}`;
    const backupDir = path.join(this.backupDir, backupName);

    try {
      // Verify backup exists
      await fs.access(backupDir);

      // Get list of backup files
      const files = await fs.readdir(backupDir);

      // Stop database before restore
      this.logger.warn('Database should be stopped before restore', {
        context: {
          operation: 'restoreBackup',
          timestamp,
          backupName,
        },
      });

      // Restore each file
      for (const file of files) {
        const sourcePath = path.join(backupDir, file);
        const destPath = path.join(path.dirname(this.dbPath), file);
        await fs.copyFile(sourcePath, destPath);
      }

      this.logger.info('Backup restored successfully', {
        context: {
          operation: 'restoreBackup',
          timestamp,
          backupName,
          files,
        },
      });
    } catch (error) {
      this.logger.error('Failed to restore backup', {
        error,
        context: {
          operation: 'restoreBackup',
          timestamp,
          backupName,
        },
      });
      throw createError(
        ErrorCodes.STORAGE_ERROR,
        'Backup restore failed',
        'restoreBackup',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Remove old backups keeping only the most recent maxBackups
   */
  private async rotateBackups(): Promise<void> {
    try {
      const backups = await this.listBackups();

      // Remove old backups
      if (backups.length > this.maxBackups) {
        const toRemove = backups.slice(this.maxBackups);
        for (const backup of toRemove) {
          const backupDir = path.join(this.backupDir, `backup-${backup.timestamp}`);
          await fs.rm(backupDir, { recursive: true, force: true });

          this.logger.info('Removed old backup', {
            context: {
              operation: 'rotateBackups',
              timestamp: backup.timestamp,
              location: backupDir,
            },
          });
        }
      }
    } catch (error) {
      this.logger.error('Failed to rotate backups', {
        error,
        context: {
          operation: 'rotateBackups',
        },
      });
      // Don't throw - this is a background operation
    }
  }

  /**
   * Clean up all backups
   */
  async cleanup(): Promise<void> {
    try {
      await fs.rm(this.backupDir, { recursive: true, force: true });
      this.logger.info('All backups cleaned up', {
        context: {
          operation: 'cleanup',
          location: this.backupDir,
        },
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.error('Failed to clean up backups', {
          error,
          context: {
            operation: 'cleanup',
            location: this.backupDir,
          },
        });
      }
    }
  }
}
