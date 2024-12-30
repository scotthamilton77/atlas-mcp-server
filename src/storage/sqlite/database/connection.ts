import { Database } from 'sqlite';
import { Logger } from '../../../logging/index.js';
import { ConnectionManager, ConnectionOptions } from '../../core/connection/manager.js';
import { SqliteErrorHandler } from '../error-handler.js';
import {
  SqliteConfig,
  SQLITE_DEFAULTS,
  DEFAULT_CONFIG,
  mergeWithDefaults,
  PerformanceConfig,
  ConnectionConfig,
} from '../../interfaces/config.js';

// Constants with non-null assertions since we know DEFAULT_CONFIG is fully populated
export const DEFAULT_PAGE_SIZE = DEFAULT_CONFIG.performance!.pageSize;
export const DEFAULT_CACHE_SIZE = DEFAULT_CONFIG.performance!.cacheSize;
export const DEFAULT_BUSY_TIMEOUT = DEFAULT_CONFIG.connection!.busyTimeout;
export const MAX_RETRY_ATTEMPTS = DEFAULT_CONFIG.connection!.maxRetries;
export const RETRY_DELAY = DEFAULT_CONFIG.connection!.retryDelay;
export const CONNECTION_TIMEOUT = DEFAULT_CONFIG.connection!.acquireTimeout;

interface FullSqliteConfig extends SqliteConfig {
  performance: Required<PerformanceConfig>;
  connection: Required<ConnectionConfig>;
}

export class SqliteConnection {
  private connectionManager: ConnectionManager;
  private isInitialized = false;
  private _isClosed = false;
  private readonly mergedConfig: FullSqliteConfig;
  private _dbPath: string;
  private readonly logger: Logger;
  private readonly errorHandler: SqliteErrorHandler;

  get isClosed(): boolean {
    return this._isClosed;
  }

  get dbPath(): string {
    return this._dbPath;
  }

  constructor(config: SqliteConfig) {
    // Initialize logger and error handler
    this.logger = Logger.getInstance().child({ component: 'SqliteConnection' });
    this.errorHandler = new SqliteErrorHandler('SqliteConnection');

    // Merge with defaults to ensure all properties are present
    const merged = mergeWithDefaults(config);
    this.mergedConfig = {
      ...merged,
      performance: {
        pageSize: merged.performance?.pageSize ?? DEFAULT_CONFIG.performance!.pageSize,
        cacheSize: merged.performance?.cacheSize ?? DEFAULT_CONFIG.performance!.cacheSize,
        mmapSize: merged.performance?.mmapSize ?? DEFAULT_CONFIG.performance!.mmapSize,
        maxMemory: merged.performance?.maxMemory ?? DEFAULT_CONFIG.performance!.maxMemory,
        checkpointInterval:
          merged.performance?.checkpointInterval ?? DEFAULT_CONFIG.performance!.checkpointInterval,
        vacuumInterval:
          merged.performance?.vacuumInterval ?? DEFAULT_CONFIG.performance!.vacuumInterval,
        statementCacheSize:
          merged.performance?.statementCacheSize ?? DEFAULT_CONFIG.performance!.statementCacheSize,
      },
      connection: {
        maxRetries: merged.connection?.maxRetries ?? DEFAULT_CONFIG.connection!.maxRetries,
        retryDelay: merged.connection?.retryDelay ?? DEFAULT_CONFIG.connection!.retryDelay,
        busyTimeout: merged.connection?.busyTimeout ?? DEFAULT_CONFIG.connection!.busyTimeout,
        maxPoolSize: merged.connection?.maxPoolSize ?? DEFAULT_CONFIG.connection!.maxPoolSize,
        idleTimeout: merged.connection?.idleTimeout ?? DEFAULT_CONFIG.connection!.idleTimeout,
        acquireTimeout:
          merged.connection?.acquireTimeout ?? DEFAULT_CONFIG.connection!.acquireTimeout,
      },
    } as FullSqliteConfig;

    // Initialize with basic path, will be properly resolved in initialize()
    this._dbPath = '';

    // Map our config to ConnectionOptions
    const options: ConnectionOptions = {
      maxRetries: this.mergedConfig.connection.maxRetries,
      retryDelay: this.mergedConfig.connection.retryDelay,
      busyTimeout: this.mergedConfig.connection.busyTimeout,
      maxConnections: this.mergedConfig.connection.maxPoolSize,
      minConnections: 1, // Default to single connection
      idleTimeout: this.mergedConfig.connection.idleTimeout,
    };

    this.connectionManager = new ConnectionManager(this.mergedConfig, options);
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Resolve proper database path
      const path = await import('path');
      const resolvedPath = path.join(this.mergedConfig.baseDir, `${this.mergedConfig.name}.db`);
      this._dbPath = resolvedPath;

      this.logger.info('Initializing SQLite connection', {
        operation: 'initialize',
        path: this._dbPath,
      });

      // Log database path and permissions
      this.logger.info('Opening SQLite database', {
        operation: 'initialize',
        path: this._dbPath,
        config: {
          journalMode: this.mergedConfig.sqlite?.journalMode || 'WAL',
          synchronous: this.mergedConfig.sqlite?.synchronous || 'NORMAL',
          busyTimeout: this.mergedConfig.connection.busyTimeout,
          maxPoolSize: this.mergedConfig.connection.maxPoolSize,
        },
      });

      try {
        // Initialize connection manager with retries
        await this.connectionManager.initialize();
      } catch (error) {
        this.logger.error('Failed to initialize connection manager', {
          error:
            error instanceof Error
              ? {
                  name: error.name,
                  message: error.message,
                  code: (error as any).code,
                  errno: (error as any).errno,
                }
              : error,
          dbPath: this._dbPath,
        });
        throw error;
      }

      try {
        // Configure SQLite pragmas with retries
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount < maxRetries) {
          try {
            await this.configurePragmas();
            break;
          } catch (error) {
            retryCount++;
            if (retryCount === maxRetries) {
              // If all retries failed, cleanup and throw
              await this.connectionManager.close().catch(closeError => {
                this.logger.error(
                  'Failed to close connection manager after pragma error',
                  closeError
                );
              });
              throw error;
            }
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
          }
        }
      } catch (error) {
        // If pragma configuration fails, ensure connection manager is closed
        await this.connectionManager.close().catch(closeError => {
          this.logger.error('Failed to close connection manager after pragma error', closeError);
        });
        throw error;
      }

      this.isInitialized = true;
      this.logger.info('SQLite connection initialized successfully', { path: this._dbPath });
    } catch (error) {
      this.logger.error('Failed to initialize SQLite connection', error);

      // Ensure we're marked as closed
      this._isClosed = true;

      // Try to clean up any partial initialization
      try {
        await this.connectionManager.close();
      } catch (cleanupError) {
        this.logger.error('Failed to cleanup after initialization error', cleanupError);
      }

      return this.errorHandler.handleInitError(error, {
        operation: 'initialize',
        path: this._dbPath,
        config: this.mergedConfig,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  private async configurePragmas(): Promise<void> {
    const config = this.mergedConfig;
    const pragmas = [
      `PRAGMA journal_mode=${config.sqlite?.journalMode || SQLITE_DEFAULTS.journalMode}`,
      'PRAGMA foreign_keys=ON',
      `PRAGMA synchronous=${config.sqlite?.synchronous || SQLITE_DEFAULTS.synchronous}`,
      `PRAGMA temp_store=${config.sqlite?.tempStore || SQLITE_DEFAULTS.tempStore}`,
      `PRAGMA page_size=${config.performance.pageSize}`,
      // Configure memory settings
      'PRAGMA cache_size=-8000', // 8MB per connection
      'PRAGMA mmap_size=67108864', // 64MB memory mapping
      'PRAGMA page_size=4096', // Standard page size
      'PRAGMA soft_heap_limit=134217728', // 128MB soft heap limit
      'PRAGMA journal_mode=WAL', // Enable WAL mode
      `PRAGMA locking_mode=${config.sqlite?.lockingMode || SQLITE_DEFAULTS.lockingMode}`,
      `PRAGMA busy_timeout=${config.connection.busyTimeout}`,
      `PRAGMA auto_vacuum=${config.sqlite?.autoVacuum || SQLITE_DEFAULTS.autoVacuum}`,
      'PRAGMA optimize',
    ];

    await this.connectionManager.executeWithRetry(async () => {
      await this.connectionManager.execute(async db => {
        for (const pragma of pragmas) {
          try {
            await db.exec(pragma);
          } catch (error) {
            this.logger.error('Failed to set pragma', error, { pragma });
            return this.errorHandler.handleError(error, 'configurePragmas', {
              pragma,
              error: error instanceof Error ? error : new Error(String(error)),
            });
          }
        }

        // Verify foreign keys are enabled
        const fkResult = await db.get('PRAGMA foreign_keys');
        if (!fkResult || !fkResult['foreign_keys']) {
          return this.errorHandler.handleError(
            new Error('Failed to enable foreign key constraints'),
            'configurePragmas',
            { operation: 'verifyForeignKeys' }
          );
        }
      }, 'configurePragmas');
    }, 'configurePragmas');
  }

  async close(): Promise<void> {
    if (this._isClosed) {
      return;
    }

    try {
      this.logger.info('Closing SQLite connection');
      await this.connectionManager.close();
      this._isClosed = true;
      this.logger.info('SQLite connection closed successfully');
    } catch (error) {
      this.logger.error('Error closing SQLite connection', error);
      return this.errorHandler.handleError(error, 'close', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  /**
   * Execute a database operation with retries and connection management
   */
  async execute<T>(operation: (db: Database) => Promise<T>, context: string): Promise<T> {
    return this.connectionManager.execute(operation, context);
  }

  /**
   * Execute a database operation with retries
   */
  async executeWithRetry<T>(operation: () => Promise<T>, context: string): Promise<T> {
    return this.connectionManager.executeWithRetry(operation, context);
  }

  /**
   * Verifies database integrity
   */
  async verifyIntegrity(): Promise<boolean> {
    try {
      this.logger.info('Running SQLite integrity check');

      await this.executeWithRetry(async () => {
        await this.execute(async db => {
          const result = await db.get('PRAGMA integrity_check');
          if (!result || result['integrity_check'] !== 'ok') {
            throw new Error('Integrity check failed');
          }
        }, 'verifyIntegrity');
      }, 'verifyIntegrity');

      this.logger.info('SQLite integrity check passed');
      return true;
    } catch (error) {
      this.logger.error('SQLite integrity check failed', error);
      return false;
    }
  }
}
