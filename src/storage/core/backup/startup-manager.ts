import { Logger } from '../../../logging/index.js';
import { BackupManager } from './backup-manager.js';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Manages database backups during server startup/shutdown
 */
export class StartupBackupManager {
  private readonly logger: Logger;
  private readonly backupManager: BackupManager;
  private readonly dbPath: string;
  private readonly maxStartupBackups = 5; // Keep last 5 startup states

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.backupManager = new BackupManager(dbPath);
    this.logger = Logger.getInstance().child({ component: 'StartupBackupManager' });
  }

  /**
   * Create startup backup and rotate old startup backups
   */
  async createStartupBackup(): Promise<void> {
    try {
      // Create startup backup directory if it doesn't exist
      const startupBackupDir = path.join(path.dirname(this.dbPath), 'startup-backups');
      await fs.mkdir(startupBackupDir, { recursive: true });

      // Create backup with startup prefix
      const timestamp = Date.now();
      const backupName = `startup-${timestamp}`;
      const backupDir = path.join(startupBackupDir, backupName);
      await fs.mkdir(backupDir);

      // Always try to backup the main database file first
      const mainDbExists = await fs
        .access(this.dbPath)
        .then(() => true)
        .catch(() => false);

      if (!mainDbExists) {
        this.logger.error('Main database file not found during startup backup', {
          context: {
            operation: 'createStartupBackup',
            dbPath: this.dbPath,
          },
        });
        await fs.rm(backupDir, { recursive: true, force: true });
        return;
      }

      // Copy main database file
      const mainDbDest = path.join(backupDir, path.basename(this.dbPath));
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
        await fs.copyFile(walFile, path.join(backupDir, path.basename(walFile)));
      }

      if (shmExists) {
        await fs.copyFile(shmFile, path.join(backupDir, path.basename(shmFile)));
      }

      // Verify backup contains at least the main database file
      const backupFiles = await fs.readdir(backupDir);
      if (backupFiles.length === 0) {
        this.logger.error('Backup directory is empty after copy operations', {
          context: {
            operation: 'createStartupBackup',
            backupDir,
          },
        });
        await fs.rm(backupDir, { recursive: true, force: true });
        return;
      }

      // Rotate old startup backups
      const entries = await fs.readdir(startupBackupDir, { withFileTypes: true });
      const startupBackups = entries
        .filter(entry => entry.isDirectory() && entry.name.startsWith('startup-'))
        .map(entry => ({
          name: entry.name,
          timestamp: parseInt(entry.name.split('-')[1]),
          path: path.join(startupBackupDir, entry.name),
        }))
        .sort((a, b) => b.timestamp - a.timestamp); // Newest first

      // Remove old startup backups beyond maxStartupBackups
      if (startupBackups.length > this.maxStartupBackups) {
        const toRemove = startupBackups.slice(this.maxStartupBackups);
        for (const backup of toRemove) {
          await fs.rm(backup.path, { recursive: true, force: true });
          this.logger.info('Removed old startup backup', {
            context: {
              operation: 'rotateStartupBackups',
              timestamp: backup.timestamp,
              location: backup.path,
            },
          });
        }
      }

      this.logger.info('Created startup backup', {
        context: {
          operation: 'createStartupBackup',
          timestamp,
          location: backupDir,
        },
      });
    } catch (error) {
      this.logger.error('Failed to create startup backup', {
        error,
        context: {
          operation: 'createStartupBackup',
          timestamp: Date.now(),
        },
      });
      // Don't throw - startup backups are optional
    }
  }

  /**
   * Create shutdown backup
   */
  async createShutdownBackup(): Promise<void> {
    try {
      // Create regular backup with shutdown tag
      await this.backupManager.createBackup();
      this.logger.info('Created shutdown backup', {
        context: {
          operation: 'createShutdownBackup',
          timestamp: Date.now(),
        },
      });
    } catch (error) {
      this.logger.error('Failed to create shutdown backup', {
        error,
        context: {
          operation: 'createShutdownBackup',
          timestamp: Date.now(),
        },
      });
      // Don't throw - shutdown backups are optional
    }
  }

  /**
   * Clean up all startup backups
   */
  async cleanup(): Promise<void> {
    try {
      const startupBackupDir = path.join(path.dirname(this.dbPath), 'startup-backups');
      await fs.rm(startupBackupDir, { recursive: true, force: true });
      this.logger.info('Cleaned up startup backups', {
        context: {
          operation: 'cleanup',
          location: startupBackupDir,
        },
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.error('Failed to clean up startup backups', {
          error,
          context: {
            operation: 'cleanup',
            timestamp: Date.now(),
          },
        });
      }
    }
  }
}
