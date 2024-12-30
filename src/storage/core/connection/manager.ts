/**
 * Enhanced database connection manager with connection pooling
 */
import { Database } from 'sqlite';
import { Logger } from '../../../logging/index.js';
import { ErrorCodes, createError } from '../../../errors/index.js';
import { StorageConfig } from '../../../types/storage.js';
import { ConnectionPool } from './pool.js';

export interface ConnectionOptions {
  maxRetries?: number;
  retryDelay?: number;
  busyTimeout?: number;
  minConnections?: number;
  maxConnections?: number;
  idleTimeout?: number;
}

export class ConnectionManager {
  private readonly logger: Logger;
  private readonly maxRetries: number;
  private readonly retryDelay: number;
  private readonly busyTimeout: number;
  private readonly pool: ConnectionPool;
  private operationCount: number = 0;

  constructor(config: StorageConfig, options: ConnectionOptions = {}) {
    this.logger = Logger.getInstance().child({
      component: 'ConnectionManager',
      context: {
        maxRetries: options.maxRetries || 3,
        retryDelay: options.retryDelay || 1000,
        busyTimeout: options.busyTimeout || 5000,
        minConnections: options.minConnections,
        maxConnections: options.maxConnections,
      },
    });

    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.busyTimeout = options.busyTimeout || 5000;

    this.pool = new ConnectionPool(config, {
      minConnections: options.minConnections,
      maxConnections: options.maxConnections,
      idleTimeout: options.idleTimeout,
    });

    this.logger.info('Connection manager initialized', {
      config: {
        database: config.name,
        maxRetries: this.maxRetries,
        retryDelay: this.retryDelay,
        busyTimeout: this.busyTimeout,
      },
      context: {
        operation: 'initialize',
        timestamp: Date.now(),
      },
    });
  }

  /**
   * Initialize the connection manager and pool
   */
  async initialize(): Promise<void> {
    const initStart = Date.now();
    try {
      // Ensure database directory exists with proper permissions
      const path = await import('path');
      const fs = await import('fs/promises');
      const dbDir = path.dirname(this.pool.databasePath);

      try {
        await fs.mkdir(dbDir, { recursive: true, mode: 0o755 });
        await fs.access(dbDir, fs.constants.R_OK | fs.constants.W_OK);

        this.logger.info('Database directory ready', {
          dbDir,
          mode: (await fs.stat(dbDir)).mode,
          context: {
            operation: 'initialize',
            timestamp: Date.now(),
          },
        });
      } catch (error) {
        throw createError(
          ErrorCodes.STORAGE_INIT,
          'Failed to prepare database directory',
          error instanceof Error ? error.message : String(error)
        );
      }

      // Initialize pool with reduced timeout during startup
      const initTimeout = Math.min(this.busyTimeout, 2000);
      const initRetries = Math.min(this.maxRetries, 2);

      let lastError: Error | undefined;
      for (let i = 0; i < initRetries; i++) {
        try {
          this.logger.debug('Attempting pool initialization', {
            attempt: i + 1,
            timeout: initTimeout,
            context: {
              operation: 'poolInit',
              timestamp: Date.now(),
            },
          });

          await Promise.race([
            this.pool.initialize(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Initialization timeout')), initTimeout)
            ),
          ]);

          this.logger.info('Pool initialization successful', {
            duration: Date.now() - initStart,
            attempts: i + 1,
            context: {
              operation: 'poolInit',
              timestamp: Date.now(),
            },
          });
          return;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          this.logger.warn(`Pool initialization attempt ${i + 1} failed`, {
            error: lastError,
            duration: Date.now() - initStart,
            context: {
              operation: 'poolInit',
              timestamp: Date.now(),
            },
          });

          if (i < initRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
          }
        }
      }

      throw lastError || new Error('Failed to initialize connection pool');
    } catch (error) {
      this.logger.error('Connection manager initialization failed', {
        error,
        duration: Date.now() - initStart,
        context: {
          operation: 'initialize',
          timestamp: Date.now(),
        },
      });
      // Ensure pool is closed on initialization failure
      await this.pool.close().catch(() => {});
      throw error;
    }
  }

  /**
   * Execute a database operation with retries and connection management
   */
  async execute<T>(operation: (db: Database) => Promise<T>, context: string): Promise<T> {
    const operationId = ++this.operationCount;
    const startTime = Date.now();
    let lastError: Error | undefined;
    let retryCount = 0;
    let db: Database | null = null;

    const cleanup = async () => {
      if (db) {
        try {
          await this.pool.releaseConnection(db);
          this.logger.debug('Connection released', {
            operationId,
            context,
            duration: Date.now() - startTime,
          });
        } catch (error) {
          this.logger.warn('Failed to release connection', {
            error,
            operationId,
            context,
            duration: Date.now() - startTime,
          });
        }
        db = null;
      }
    };

    try {
      while (retryCount < this.maxRetries) {
        try {
          this.logger.debug('Executing database operation', {
            operationId,
            attempt: retryCount + 1,
            context,
            timestamp: Date.now(),
          });

          // Get connection from pool
          db = await this.pool.getConnection();

          // Execute operation
          const result = await operation(db);

          // Operation succeeded
          const duration = Date.now() - startTime;
          if (retryCount > 0) {
            this.logger.info(`Operation succeeded after retries`, {
              operationId,
              context,
              retries: retryCount,
              duration,
              timestamp: Date.now(),
            });
          } else {
            this.logger.debug('Operation completed successfully', {
              operationId,
              context,
              duration,
              timestamp: Date.now(),
            });
          }

          await cleanup();
          return result;
        } catch (error) {
          await cleanup();

          lastError = error instanceof Error ? error : new Error(String(error));
          retryCount++;

          if (retryCount === this.maxRetries) {
            throw lastError;
          }

          // Calculate delay based on error type
          const isWalError =
            lastError instanceof Error &&
            (lastError.message.includes('WAL') ||
              lastError.message.includes('journal_mode') ||
              lastError.message.includes('Safety level'));

          const baseDelay = isWalError ? 1000 : this.retryDelay;
          const delay = Math.min(
            baseDelay * Math.pow(2, retryCount - 1) * (0.5 + Math.random()),
            isWalError ? 10000 : 5000
          );

          this.logger.warn(`Operation failed, retrying`, {
            operationId,
            attempt: retryCount,
            error: lastError,
            context,
            nextRetryDelay: delay,
            isWalError,
            duration: Date.now() - startTime,
            timestamp: Date.now(),
          });

          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      throw lastError;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Operation failed permanently', {
        operationId,
        context,
        retries: retryCount,
        duration,
        error,
        timestamp: Date.now(),
      });

      throw createError(
        ErrorCodes.STORAGE_ERROR,
        'Operation failed',
        `Failed after ${retryCount} retries: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Execute a database operation with busy handling
   */
  async handleBusy(operation: () => Promise<void>, context: string): Promise<void> {
    const startTime = Date.now();
    let attempts = 0;

    while (true) {
      try {
        attempts++;
        await operation();

        if (attempts > 1) {
          this.logger.info('Operation succeeded after busy waits', {
            context,
            attempts,
            duration: Date.now() - startTime,
            timestamp: Date.now(),
          });
        }
        return;
      } catch (error) {
        const elapsed = Date.now() - startTime;
        if (elapsed >= this.busyTimeout) {
          this.logger.error('Operation timed out due to busy state', {
            context,
            attempts,
            elapsed,
            timeout: this.busyTimeout,
            error,
            timestamp: Date.now(),
          });

          throw createError(
            ErrorCodes.STORAGE_ERROR,
            'Operation timed out',
            `Timed out after ${elapsed}ms: ${error instanceof Error ? error.message : String(error)}`
          );
        }

        this.logger.warn('Database busy, waiting...', {
          context,
          attempts,
          elapsed,
          timeout: this.busyTimeout,
          timestamp: Date.now(),
        });

        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  /**
   * Execute a database operation with retries
   */
  async executeWithRetry<T>(operation: () => Promise<T>, context: string): Promise<T> {
    return this.execute(async () => operation(), context);
  }

  /**
   * Close the connection manager and pool
   */
  async close(): Promise<void> {
    const closeStart = Date.now();
    try {
      await this.pool.close();
      this.logger.info('Connection manager closed', {
        duration: Date.now() - closeStart,
        context: {
          operation: 'close',
          timestamp: Date.now(),
        },
      });
    } catch (error) {
      this.logger.error('Error closing connection manager', {
        error,
        duration: Date.now() - closeStart,
        context: {
          operation: 'close',
          timestamp: Date.now(),
        },
      });
      throw error;
    }
  }
}
