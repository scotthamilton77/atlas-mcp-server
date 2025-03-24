import { logger } from '../../../utils/logger.js';
import { databaseEvents, DatabaseEventType } from '../events.js';

/**
 * Auto Export Manager
 * 
 * Responsible for coordinating database exports based on changes
 * Uses the event system to trigger exports without creating circular dependencies
 */
export class AutoExportManager {
  private static instance: AutoExportManager;
  private lastExportTime: number = 0;
  private exportDebounceMs: number = 5000; // Increased debounce time
  private changeCounter: number = 0;
  private changeThreshold: number = 50; // Number of operations before triggering export
  private isExportInProgress: boolean = false;
  private isInitialized: boolean = false;
  
  // Store exportService dynamically to avoid circular imports
  private exportService: any = null;

  private constructor() {
    // Subscribe to database write events to trigger exports
    databaseEvents.subscribe(DatabaseEventType.WRITE_OPERATION, () => {
      // Only handle database changes if properly initialized
      if (this.isInitialized && this.exportService) {
        this.handleDatabaseChange();
      }
    });
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): AutoExportManager {
    if (!AutoExportManager.instance) {
      AutoExportManager.instance = new AutoExportManager();
    }
    return AutoExportManager.instance;
  }

  /**
   * Initialize with the export service
   * Called after all services are initialized to prevent circular dependencies
   * @param exportService The export service to use
   */
  public initializeWithExportService(exportService: any): void {
    this.exportService = exportService;
    this.isInitialized = true;
    logger.info('AutoExportManager initialized with export service');
  }

  /**
   * Handle a database change event
   * Implements debouncing to avoid excessive exports
   * @private
   */
  private handleDatabaseChange(): void {
    this.changeCounter++;
    
    const now = Date.now();
    const timeSinceLastExport = now - this.lastExportTime;
    
    // Check if we should trigger an export based on time or change volume
    const shouldExportBasedOnTime = timeSinceLastExport >= this.exportDebounceMs;
    const shouldExportBasedOnChanges = this.changeCounter >= this.changeThreshold;
    
    if ((shouldExportBasedOnTime || shouldExportBasedOnChanges) && !this.isExportInProgress) {
      this.triggerExport();
    }
  }

  /**
   * Trigger a database export
   * @private
   */
  private triggerExport(): void {
    if (!this.exportService) {
      logger.warn('Cannot perform auto-export: export service not initialized');
      return;
    }
    
    this.isExportInProgress = true;
    this.lastExportTime = Date.now();
    this.changeCounter = 0;
    
    // Run export in background using Promise to avoid blocking
    Promise.resolve().then(async () => {
      const maxRetries = 3;
      let retries = 0;
      let success = false;
      
      while (retries < maxRetries && !success) {
        try {
          if (retries > 0) {
            logger.info(`Auto-export retry attempt ${retries} of ${maxRetries}`);
            // Exponential backoff - wait longer between each retry
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retries)));
          }
          
          const exportPath = await this.exportService.autoExport();
          if (exportPath) {
            logger.info(`Database auto-exported to ${exportPath}`);
            success = true;
            
            // Publish success event
            databaseEvents.publish(DatabaseEventType.TRANSACTION_COMPLETE, {
              operation: 'auto-export',
              timestamp: new Date().toISOString(),
              filepath: exportPath
            });
          }
        } catch (error) {
          retries++;
          logger.error(`Auto-export attempt ${retries} failed`, { error });
          
          if (retries >= maxRetries) {
            // Publish error event for monitoring
            databaseEvents.publish(DatabaseEventType.ERROR, {
              operation: 'auto-export',
              timestamp: new Date().toISOString(),
              error: error instanceof Error ? error.message : String(error),
              retries
            });
          }
        }
      }
      
      this.isExportInProgress = false;
    });
  }

  /**
   * Force an immediate export
   * Useful for critical operations that should be persisted immediately
   * @returns Promise that resolves when the export is complete
   */
  public async forceExport(): Promise<string | null> {
    if (!this.exportService) {
      logger.warn('Cannot perform forced export: export service not initialized');
      return null;
    }
    
    if (this.isExportInProgress) {
      logger.info('Export already in progress, waiting for completion');
      // Wait a bit for the current export to finish
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (this.isExportInProgress) {
        logger.info('Previous export still in progress, proceeding with new export');
      }
    }
    
    this.isExportInProgress = true;
    this.lastExportTime = Date.now();
    this.changeCounter = 0;
    
    try {
      const maxRetries = 3;
      let retries = 0;
      
      while (retries <= maxRetries) {
        try {
          if (retries > 0) {
            logger.info(`Force export retry attempt ${retries} of ${maxRetries}`);
            // Exponential backoff - wait longer between each retry
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retries)));
          }
          
          const exportPath = await this.exportService.exportAllData();
          logger.info(`Database force-exported to ${exportPath}`);
          
          // Publish success event
          databaseEvents.publish(DatabaseEventType.TRANSACTION_COMPLETE, {
            operation: 'forced-export',
            timestamp: new Date().toISOString(),
            filepath: exportPath
          });
          
          return exportPath;
        } catch (error) {
          retries++;
          logger.error(`Force export attempt ${retries} failed`, { error });
          
          // If we've exceeded max retries, give up and publish error
          if (retries > maxRetries) {
            databaseEvents.publish(DatabaseEventType.ERROR, {
              operation: 'forced-export',
              timestamp: new Date().toISOString(),
              error: error instanceof Error ? error.message : String(error),
              retries
            });
            return null;
          }
        }
      }
      
      return null; // Should never reach here, but TypeScript wants a return
    } finally {
      this.isExportInProgress = false;
    }
  }

  /**
   * Update export configuration
   * @param config Export configuration options
   */
  public updateConfig(config: {
    debounceMs?: number;
    changeThreshold?: number;
  }): void {
    if (config.debounceMs !== undefined && config.debounceMs >= 0) {
      this.exportDebounceMs = config.debounceMs;
    }
    
    if (config.changeThreshold !== undefined && config.changeThreshold > 0) {
      this.changeThreshold = config.changeThreshold;
    }
    
    logger.info('AutoExportManager configuration updated', {
      debounceMs: this.exportDebounceMs,
      changeThreshold: this.changeThreshold
    });
  }
}

// Export singleton instance
export const autoExportManager = AutoExportManager.getInstance();
