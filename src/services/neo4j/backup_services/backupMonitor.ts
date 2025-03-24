import { logger } from '../../../utils/logger.js';
import { databaseEvents, DatabaseEventType } from '../events.js';
import fs from 'fs';
import path from 'path';
import { config } from '../../../config/index.js';
import { exportService } from './exportService.js';
import { backupManager } from './backupManager.js';
import { importService } from './importService.js';

/**
 * BackupMonitor Service
 * 
 * Responsible for monitoring the health of backups,
 * ensuring regular backups are created, and verifying backup integrity
 */
export class BackupMonitor {
  private static instance: BackupMonitor;
  private isInitialized: boolean = false;
  private backupDir: string;
  private healthCheckIntervalId: NodeJS.Timeout | null = null;
  private testRestoreIntervalId: NodeJS.Timeout | null = null;

  // Metrics tracking
  private metrics: {
    successfulBackups: number;
    failedBackups: number;
    lastSuccessfulBackup: Date | null;
    lastFailedBackup: Date | null;
    averageBackupSize: number;
    totalBackupSize: number;
    backupCount: number;
    backupDurations: number[]; // in ms
  } = {
    successfulBackups: 0,
    failedBackups: 0,
    lastSuccessfulBackup: null,
    lastFailedBackup: null,
    averageBackupSize: 0,
    totalBackupSize: 0,
    backupCount: 0,
    backupDurations: [],
  };

  private constructor() {
    this.backupDir = config.backup.backupPath;
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): BackupMonitor {
    if (!BackupMonitor.instance) {
      BackupMonitor.instance = new BackupMonitor();
    }
    return BackupMonitor.instance;
  }

  /**
   * Initialize the backup monitor service
   */
  public initialize(): void {
    if (this.isInitialized) {
      return;
    }

    // Set up event listeners
    databaseEvents.subscribe(DatabaseEventType.TRANSACTION_COMPLETE, (data: any) => {
      if (data.operation === 'export') {
        this.recordSuccessfulBackup(data.filepath);
      }
    });

    databaseEvents.subscribe(DatabaseEventType.ERROR, (data: any) => {
      if (data.operation === 'export' || data.operation === 'auto-export') {
        this.recordFailedBackup();
      }
    });

    // Start health check (every 12 hours)
    this.startHealthCheck(12 * 60 * 60 * 1000);
    
    // Start test restore (weekly)
    this.startTestRestore(7 * 24 * 60 * 60 * 1000);

    this.isInitialized = true;
    logger.info('Backup monitor initialized');
  }

  /**
   * Start periodic backup health checks
   * @param interval Time between health checks in milliseconds
   */
  private startHealthCheck(interval: number): void {
    // Clear any existing interval
    if (this.healthCheckIntervalId) {
      clearInterval(this.healthCheckIntervalId);
    }

    // Set up new interval
    this.healthCheckIntervalId = setInterval(() => {
      this.performHealthCheck()
        .catch(error => logger.error('Error during backup health check', { error }));
    }, interval);

    // Run a health check immediately
    this.performHealthCheck()
      .catch(error => logger.error('Error during initial backup health check', { error }));
  }

  /**
   * Start periodic test restores
   * @param interval Time between test restores in milliseconds
   */
  private startTestRestore(interval: number): void {
    // Clear any existing interval
    if (this.testRestoreIntervalId) {
      clearInterval(this.testRestoreIntervalId);
    }

    // Set up new interval
    this.testRestoreIntervalId = setInterval(() => {
      this.performTestRestore()
        .catch(error => logger.error('Error during backup test restore', { error }));
    }, interval);
  }

  /**
   * Perform a health check on the backup system
   */
  private async performHealthCheck(): Promise<void> {
    logger.info('Performing backup health check');

    try {
      // Check if backup directory exists
      if (!fs.existsSync(this.backupDir)) {
        this.reportIssue('Backup directory does not exist');
        return;
      }

      // Check if there are any backup files
      const files = await fs.promises.readdir(this.backupDir);
      const backupFiles = files.filter(file => file.startsWith('atlas-backup-') && file.endsWith('.json'));
      
      if (backupFiles.length === 0) {
        this.reportIssue('No backup files found');
        return;
      }

      // Check if the most recent backup is recent enough (within 24 hours for daily backups)
      const mostRecentBackup = await this.getMostRecentBackupDate();
      if (!mostRecentBackup) {
        this.reportIssue('Could not determine most recent backup date');
        return;
      }

      const now = new Date();
      const timeSinceLastBackup = now.getTime() - mostRecentBackup.getTime();
      const dayInMs = 24 * 60 * 60 * 1000;
      
      if (timeSinceLastBackup > dayInMs) {
        this.reportIssue(`Most recent backup is too old (${Math.floor(timeSinceLastBackup / dayInMs)} days old)`);
        
        // Trigger a new backup if the most recent one is too old
        logger.info('Triggering new backup due to missing recent backup');
        await exportService.autoExport();
      } else {
        logger.info('Backup health check passed', {
          backupCount: backupFiles.length,
          mostRecentBackup: mostRecentBackup.toISOString(),
          hoursAgo: Math.floor(timeSinceLastBackup / (60 * 60 * 1000))
        });
      }
    } catch (error) {
      logger.error('Error during backup health check', { error });
      this.reportIssue(`Health check error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get the date of the most recent backup
   */
  private async getMostRecentBackupDate(): Promise<Date | null> {
    try {
      const backups = await exportService.listBackups();
      if (backups.length === 0) {
        return null;
      }
      
      // Backups are already sorted by created date (newest first)
      return backups[0].created;
    } catch (error) {
      logger.error('Error getting most recent backup date', { error });
      return null;
    }
  }

  /**
   * Perform a test restore to verify backup integrity
   */
  private async performTestRestore(): Promise<void> {
    logger.info('Performing backup test restore');

    try {
      // Get the latest backup file
      const latestBackupFile = await importService.getLatestBackupFile();
      
      if (!latestBackupFile) {
        logger.warn('No backup files found for test restore');
        return;
      }

      // Verify the backup
      const verificationResult = await exportService.verifyBackup(latestBackupFile);
      
      if (!verificationResult.isValid) {
        this.reportIssue(`Backup verification failed: ${verificationResult.message}`);
        return;
      }

      logger.info('Backup test restore verification successful', {
        backupFile: latestBackupFile,
        stats: verificationResult.stats
      });

      // We don't actually restore to the real database during testing,
      // but we could implement a restore to a test database in the future
    } catch (error) {
      logger.error('Error during backup test restore', { error });
      this.reportIssue(`Test restore error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Record metrics for a successful backup
   * @param filepath Path to the backup file
   */
  private async recordSuccessfulBackup(filepath: string): Promise<void> {
    try {
      this.metrics.successfulBackups++;
      this.metrics.lastSuccessfulBackup = new Date();

      // Get file size
      const stats = await fs.promises.stat(filepath);
      const sizeInMB = stats.size / (1024 * 1024);
      
      // Update size metrics
      this.metrics.totalBackupSize += sizeInMB;
      this.metrics.backupCount++;
      this.metrics.averageBackupSize = this.metrics.totalBackupSize / this.metrics.backupCount;
      
      logger.info('Backup metrics updated', {
        successRate: this.getSuccessRate(),
        avgSizeMB: this.metrics.averageBackupSize.toFixed(2),
        totalBackups: this.metrics.backupCount
      });
    } catch (error) {
      logger.error('Error recording successful backup metrics', { error });
    }
  }

  /**
   * Record metrics for a failed backup
   */
  private recordFailedBackup(): void {
    this.metrics.failedBackups++;
    this.metrics.lastFailedBackup = new Date();
    
    logger.warn('Failed backup recorded', {
      successRate: this.getSuccessRate(),
      totalFailures: this.metrics.failedBackups
    });
  }

  /**
   * Calculate backup success rate
   */
  private getSuccessRate(): string {
    const total = this.metrics.successfulBackups + this.metrics.failedBackups;
    if (total === 0) return '100%';
    
    const rate = (this.metrics.successfulBackups / total) * 100;
    return `${rate.toFixed(1)}%`;
  }

  /**
   * Report a backup system issue
   * @param message Issue description
   */
  private reportIssue(message: string): void {
    logger.error(`BACKUP SYSTEM ISSUE: ${message}`);
    
    // Publish error event
    databaseEvents.publish(DatabaseEventType.ERROR, {
      operation: 'backup-monitor',
      timestamp: new Date().toISOString(),
      error: message
    });
    
    // In a production system, you might want to:
    // 1. Send an email alert
    // 2. Create a monitoring system ticket
    // 3. Send a Slack/Teams notification
    // 4. Trigger an incident response
  }

  /**
   * Get backup metrics
   * @returns Current backup metrics
   */
  public getMetrics(): any {
    return {
      ...this.metrics,
      successRate: this.getSuccessRate()
    };
  }

  /**
   * Stop all monitoring activities
   */
  public stop(): void {
    if (this.healthCheckIntervalId) {
      clearInterval(this.healthCheckIntervalId);
      this.healthCheckIntervalId = null;
    }
    
    if (this.testRestoreIntervalId) {
      clearInterval(this.testRestoreIntervalId);
      this.testRestoreIntervalId = null;
    }
    
    this.isInitialized = false;
    logger.info('Backup monitor stopped');
  }
}

// Export singleton instance
export const backupMonitor = BackupMonitor.getInstance();
// Do not auto-initialize - will be initialized by initializeNeo4jServices() in the correct order
