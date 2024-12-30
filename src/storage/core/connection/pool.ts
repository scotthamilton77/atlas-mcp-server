/**
 * Database connection pool implementation
 */
import { Database, open } from 'sqlite';
import { Logger } from '../../../logging/index.js';
import { ErrorCodes, createError } from '../../../errors/index.js';
import { StorageConfig } from '../../../types/storage.js';
import { MonitoringConfig } from '../../monitoring/index.js';
import { ConnectionStateManager } from './state.js';
import { WALManager } from '../wal/manager.js';
import { join } from 'path';
import crypto from 'crypto';
import { isDatabaseError, isTransientError } from '../../../utils/error-utils.js';
import { DEFAULT_BUSY_TIMEOUT } from '../../sqlite/config.js';

interface PoolConnection {
  db: Database;
  id: string;
  inUse: boolean;
  lastUsed: number;
  createdAt: number;
  errorCount: number;
  usageCount: number;
  totalUsageTime: number;
  lastError?: Error;
}

interface RetryOptions {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffFactor: number;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 5,
  initialDelay: 100,
  maxDelay: 2000,
  backoffFactor: 2,
};

export class ConnectionPool {
  private readonly logger: Logger;
  private readonly config: StorageConfig;
  private readonly connections: Map<string, PoolConnection>;
  private readonly minConnections: number;
  private readonly maxConnections: number;
  private readonly idleTimeout: number;
  private readonly maxAge: number = 30 * 60 * 1000; // 30 minutes max connection age
  private readonly stateManager: ConnectionStateManager;
  private cleanupInterval: NodeJS.Timeout | null;
  private readonly _dbPath: string;

  /**
   * Get the database file path
   */
  get databasePath(): string {
    return this._dbPath;
  }
  private readonly connectionIds = new WeakMap<Database, string>();
  private readonly verifiedConnections = new Set<string>();
  private isInitialized = false;
  private totalConnectionsCreated: number = 0;
  private totalConnectionErrors: number = 0;

  constructor(
    config: StorageConfig & { monitoring?: MonitoringConfig },
    options: {
      minConnections?: number;
      maxConnections?: number;
      idleTimeout?: number;
    } = {}
  ) {
    // Increase max listeners to prevent warning
    process.setMaxListeners(20);
    this.logger = Logger.getInstance().child({
      component: 'ConnectionPool',
      context: {
        database: config.name || 'default',
        minConnections: options.minConnections || 1,
        maxConnections: Math.min(options.maxConnections || 5, 5),
        idleTimeout: options.idleTimeout || 30000,
      },
    });

    this.config = config;
    this.connections = new Map();
    this.minConnections = options.minConnections || 1;
    this.maxConnections = Math.min(options.maxConnections || 5, 5); // Cap at 5 connections
    this.idleTimeout = options.idleTimeout || 30000; // 30 seconds idle timeout
    this.cleanupInterval = null;
    this._dbPath = join(config.baseDir || './data', `${config.name || 'default'}.db`);

    // Initialize state manager with monitoring config
    this.stateManager = ConnectionStateManager.getInstance({
      errorThreshold: config.monitoring?.healthCheck?.errorThreshold,
      responseTimeThreshold: config.monitoring?.healthCheck?.responseTimeThreshold,
    });

    this.logger.info('Connection pool created', {
      config: {
        dbPath: this._dbPath,
        minConnections: this.minConnections,
        maxConnections: this.maxConnections,
        idleTimeout: this.idleTimeout,
        maxAge: this.maxAge,
      },
      context: {
        operation: 'create',
        timestamp: Date.now(),
      },
    });
  }

  /**
   * Get the unique ID for a database connection
   */
  getConnectionId(db: Database): string {
    let id = this.connectionIds.get(db);
    if (!id) {
      id = crypto.randomUUID();
      this.connectionIds.set(db, id);
    }
    return id;
  }

  /**
   * Initialize the connection pool
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    const initStart = Date.now();
    let initDb: Database | undefined;
    let walManager: WALManager | undefined;

    try {
      this.logger.info('Initializing connection pool', {
        context: {
          operation: 'initialize',
          timestamp: initStart,
        },
      });

      // First-time initialization
      const sqlite3 = await import('sqlite3');

      // Create initial database connection with retries
      initDb = await this.retryOperation(
        async () => {
          const db = await open({
            filename: this._dbPath,
            driver: sqlite3.default.Database,
            mode: sqlite3.default.OPEN_READWRITE | sqlite3.default.OPEN_CREATE,
          });

          // Get the underlying driver
          const driver = (db as any).driver;
          if (driver) {
            // Configure low-level driver settings
            driver.configure && driver.configure('busyTimeout', 5000);
          }

          return db;
        },
        'initialize',
        {
          maxAttempts: 10, // More attempts for initialization
          initialDelay: 200,
          maxDelay: 3000,
          backoffFactor: 1.5,
        }
      );

      try {
        // Enable WAL mode and configure database
        walManager = WALManager.getInstance(this._dbPath);
        await walManager.enableWAL(initDb);
        await walManager.checkpoint(initDb); // Force checkpoint before proceeding

        // Basic verification
        await initDb.get('SELECT 1');

        // Create single initial connection
        const conn = await this.createConnection();
        this.connections.set(conn.id, conn);

        // Close initial connection now that we have our pool connection
        await initDb.close();
        initDb = undefined;

        this.isInitialized = true;

        // Start monitoring with reduced intervals
        this.stateManager.startMonitoring();
        this.cleanupInterval = setInterval(() => this.cleanupIdleConnections(), this.idleTimeout);

        const duration = Date.now() - initStart;
        this.logger.info('Connection pool initialized', {
          duration,
          connections: this.connections.size,
          context: {
            operation: 'initialize',
            timestamp: Date.now(),
          },
        });
      } catch (error) {
        // Clean up initial connection if something failed
        if (initDb) {
          await initDb.close().catch(() => {});
          initDb = undefined;
        }
        throw error;
      }
    } catch (error) {
      const duration = Date.now() - initStart;

      this.logger.error('Failed to initialize connection pool', error, {
        duration,
        isTransient: isTransientError(error),
        isDatabaseError: isDatabaseError(error),
        context: {
          operation: 'initialize',
          timestamp: Date.now(),
        },
      });

      throw createError(
        ErrorCodes.STORAGE_INIT,
        'Failed to initialize connection pool',
        'initialize',
        error instanceof Error ? error.message : String(error),
        {
          duration,
          isTransient: isTransientError(error),
          isDatabaseError: isDatabaseError(error),
        }
      );
    }
  }

  /**
   * Retry an operation with exponential backoff
   */
  private async retryOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    options: RetryOptions = DEFAULT_RETRY_OPTIONS
  ): Promise<T> {
    let lastError: Error | undefined;
    let delay = options.initialDelay;

    for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Only retry on transient errors
        if (!isTransientError(error)) {
          throw error;
        }

        if (attempt < options.maxAttempts) {
          this.logger.debug(`Retrying ${operationName} after error`, {
            attempt,
            delay,
            error: lastError,
            context: {
              operation: operationName,
              timestamp: Date.now(),
            },
          });

          await new Promise(resolve => setTimeout(resolve, delay));
          delay = Math.min(delay * options.backoffFactor, options.maxDelay);
        }
      }
    }

    throw createError(
      ErrorCodes.STORAGE_ERROR,
      `${operationName} failed after ${options.maxAttempts} attempts`,
      operationName,
      lastError?.message || 'Operation failed',
      {
        attempts: options.maxAttempts,
        lastError: lastError
          ? {
              name: lastError.name,
              message: lastError.message,
              stack: lastError.stack,
            }
          : undefined,
        isTransient: true,
      }
    );
  }

  /**
   * Get a connection from the pool
   */
  async getConnection(): Promise<Database> {
    const getStart = Date.now();
    let acquiredConnection: string | undefined;

    try {
      // First try to find a healthy available connection
      for (const [id, conn] of this.connections.entries()) {
        if (!conn.inUse) {
          if (this.stateManager.isHealthy(id) && !this.stateManager.hasActiveTransaction(id)) {
            conn.inUse = true;
            conn.lastUsed = Date.now();
            conn.usageCount++;
            this.stateManager.markInUse(id);
            acquiredConnection = id;

            this.logger.debug('Reusing healthy connection', {
              id,
              usageCount: conn.usageCount,
              age: Date.now() - conn.createdAt,
              context: {
                operation: 'getConnection',
                timestamp: Date.now(),
              },
            });

            return conn.db;
          }
        }
      }

      // If we haven't reached max connections, create a new one
      if (this.connections.size < this.maxConnections) {
        const conn = await this.createConnection();
        conn.inUse = true;
        this.stateManager.markInUse(conn.id);
        acquiredConnection = conn.id;
        return conn.db;
      }

      // Otherwise wait for a connection to become available
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.logger.warn('Connection acquisition timeout', {
            waitTime: Date.now() - getStart,
            activeConnections: Array.from(this.connections.entries()).map(([id, conn]) => ({
              id,
              inUse: conn.inUse,
              age: Date.now() - conn.createdAt,
              lastUsed: Date.now() - conn.lastUsed,
              hasTransaction: this.stateManager.hasActiveTransaction(id),
            })),
            context: {
              operation: 'getConnection',
              timestamp: Date.now(),
            },
          });

          const timeoutError = new Error('Timed out waiting for available connection');
          this.logger.error('Connection acquisition timeout', timeoutError, {
            waitTime: Date.now() - getStart,
            activeConnections: this.connections.size,
            context: {
              operation: 'getConnection',
              timestamp: Date.now(),
            },
          });

          reject(
            createError(
              ErrorCodes.STORAGE_ERROR,
              'Connection timeout',
              'getConnection',
              'Timed out waiting for available connection',
              {
                waitTime: Date.now() - getStart,
                activeConnections: this.connections.size,
                isTransient: true,
              }
            )
          );
        }, this.config.connection?.busyTimeout || DEFAULT_BUSY_TIMEOUT);

        const checkConnection = async () => {
          for (const [id] of this.connections.entries()) {
            const conn = this.connections.get(id);
            if (conn && !conn.inUse) {
              if (this.stateManager.isHealthy(id) && !this.stateManager.hasActiveTransaction(id)) {
                clearTimeout(timeout);
                conn.inUse = true;
                conn.lastUsed = Date.now();
                conn.usageCount++;
                this.stateManager.markInUse(id);
                acquiredConnection = id;

                this.logger.debug('Connection became available', {
                  id,
                  waitTime: Date.now() - getStart,
                  usageCount: conn.usageCount,
                  context: {
                    operation: 'getConnection',
                    timestamp: Date.now(),
                  },
                });

                resolve(conn.db);
                return;
              }
            }
          }
          setTimeout(checkConnection, 100);
        };

        checkConnection();
      });
    } catch (error) {
      this.logger.error('Failed to acquire connection', error, {
        duration: Date.now() - getStart,
        acquiredConnection,
        activeConnections: this.connections.size,
        isTransient: isTransientError(error),
        isDatabaseError: isDatabaseError(error),
        context: {
          operation: 'getConnection',
          timestamp: Date.now(),
        },
      });

      throw createError(
        ErrorCodes.STORAGE_ERROR,
        'Failed to acquire database connection',
        'getConnection',
        error instanceof Error ? error.message : String(error),
        {
          duration: Date.now() - getStart,
          acquiredConnection,
          activeConnections: this.connections.size,
          isTransient: isTransientError(error),
          isDatabaseError: isDatabaseError(error),
        }
      );
    }
  }

  /**
   * Release a connection back to the pool
   */
  releaseConnection(db: Database): void {
    const id = this.getConnectionId(db);
    const conn = Array.from(this.connections.values()).find(c => c.id === id);

    if (conn) {
      const usageDuration = Date.now() - conn.lastUsed;
      conn.inUse = false;
      conn.lastUsed = Date.now();
      conn.totalUsageTime += usageDuration;
      this.stateManager.markAvailable(id);

      this.logger.debug('Connection released', {
        id,
        usageDuration,
        totalUsageTime: conn.totalUsageTime,
        usageCount: conn.usageCount,
        context: {
          operation: 'releaseConnection',
          timestamp: Date.now(),
        },
      });
    }
  }

  /**
   * Create a new connection
   */
  private async createConnection(): Promise<PoolConnection> {
    const createStart = Date.now();
    const sqlite3 = await import('sqlite3');
    const id = crypto.randomUUID();

    try {
      this.logger.debug('Creating new connection', {
        id,
        existingConnections: this.connections.size,
        context: {
          operation: 'createConnection',
          timestamp: createStart,
        },
      });

      const db = await this.retryOperation(async () => {
        const db = await open({
          filename: this._dbPath,
          driver: sqlite3.default.Database,
          mode: sqlite3.default.OPEN_READWRITE | sqlite3.default.OPEN_CREATE,
        });

        // Get the underlying driver
        const driver = (db as any).driver;
        if (driver) {
          // Configure low-level driver settings
          driver.configure && driver.configure('busyTimeout', 5000);
        }

        // Configure connection with optimized memory settings
        await db.exec('PRAGMA foreign_keys=ON');
        await db.exec('PRAGMA journal_mode=WAL');
        await db.exec('PRAGMA synchronous=NORMAL');
        await db.exec('PRAGMA cache_size=-8000'); // 8MB per connection
        await db.exec('PRAGMA page_size=4096');
        await db.exec('PRAGMA mmap_size=67108864'); // 64MB memory mapping
        await db.exec('PRAGMA temp_store=MEMORY');
        await db.exec('PRAGMA busy_timeout=5000');
        await db.exec('PRAGMA threads=2'); // Allow two threads per connection
        await db.exec('PRAGMA read_uncommitted=0'); // Strict isolation

        return db;
      }, 'createConnection');

      // Store connection ID
      this.connectionIds.set(db, id);

      // Skip verification if already verified
      if (!this.verifiedConnections.has(id)) {
        try {
          await db.get('SELECT 1');
          this.verifiedConnections.add(id);
          this.logger.debug('Connection verified', {
            id,
            duration: Date.now() - createStart,
            context: {
              operation: 'verifyConnection',
              timestamp: Date.now(),
            },
          });
        } catch (error) {
          this.logger.error('Failed to verify connection', error, {
            id,
            duration: Date.now() - createStart,
            isTransient: isTransientError(error),
            isDatabaseError: isDatabaseError(error),
            context: {
              operation: 'verifyConnection',
              timestamp: Date.now(),
            },
          });

          await db.close().catch(() => {}); // Attempt to close on error
          throw createError(
            ErrorCodes.STORAGE_ERROR,
            'Failed to verify database connection',
            'verifyConnection',
            error instanceof Error ? error.message : String(error),
            {
              connectionId: id,
              duration: Date.now() - createStart,
              isTransient: isTransientError(error),
              isDatabaseError: isDatabaseError(error),
            }
          );
        }
      }

      const conn: PoolConnection = {
        db,
        id,
        inUse: false,
        lastUsed: Date.now(),
        createdAt: Date.now(),
        errorCount: 0,
        usageCount: 0,
        totalUsageTime: 0,
      };

      this.connections.set(id, conn);
      this.stateManager.registerConnection(id);
      this.totalConnectionsCreated++;

      this.logger.info('Created new connection', {
        id,
        duration: Date.now() - createStart,
        totalCreated: this.totalConnectionsCreated,
        activeConnections: this.connections.size,
        context: {
          operation: 'createConnection',
          timestamp: Date.now(),
        },
      });

      return conn;
    } catch (error) {
      this.totalConnectionErrors++;

      this.logger.error('Failed to create connection', error, {
        id,
        duration: Date.now() - createStart,
        totalErrors: this.totalConnectionErrors,
        isTransient: isTransientError(error),
        isDatabaseError: isDatabaseError(error),
        context: {
          operation: 'createConnection',
          timestamp: Date.now(),
        },
      });

      throw createError(
        ErrorCodes.STORAGE_ERROR,
        'Failed to create database connection',
        'createConnection',
        error instanceof Error ? error.message : String(error),
        {
          connectionId: id,
          duration: Date.now() - createStart,
          isTransient: isTransientError(error),
          isDatabaseError: isDatabaseError(error),
        }
      );
    }
  }

  /**
   * Clean up idle connections but maintain minimum
   */
  private async cleanupIdleConnections(): Promise<void> {
    const cleanupStart = Date.now();
    const now = Date.now();
    const idsToRemove: string[] = [];

    // Find connections to remove
    for (const [id, conn] of this.connections.entries()) {
      // Remove if:
      // 1. Connection is idle and timed out
      // 2. Connection has exceeded max age
      // 3. Connection has errors and isn't in use
      if (
        (!conn.inUse && now - conn.lastUsed > this.idleTimeout) ||
        now - conn.createdAt > this.maxAge ||
        (conn.errorCount > 0 && !conn.inUse)
      ) {
        // Keep minimum connections unless they're errored
        if (this.connections.size > this.minConnections || conn.errorCount > 0) {
          idsToRemove.push(id);
        }
      }
    }

    if (idsToRemove.length > 0) {
      this.logger.info('Starting connection cleanup', {
        connectionsToRemove: idsToRemove.length,
        totalConnections: this.connections.size,
        context: {
          operation: 'cleanup',
          timestamp: cleanupStart,
        },
      });
    }

    // Remove connections
    for (const id of idsToRemove) {
      const conn = this.connections.get(id);
      if (conn) {
        try {
          await conn.db.close();
          this.connections.delete(id);
          this.stateManager.unregisterConnection(id);
          this.connectionIds.delete(conn.db);

          this.logger.debug('Removed connection', {
            id,
            age: now - conn.createdAt,
            idleTime: now - conn.lastUsed,
            errorCount: conn.errorCount,
            usageCount: conn.usageCount,
            totalUsageTime: conn.totalUsageTime,
            context: {
              operation: 'cleanup',
              timestamp: Date.now(),
            },
          });
        } catch (error) {
          this.logger.error('Failed to close connection', error, {
            id,
            isTransient: isTransientError(error),
            isDatabaseError: isDatabaseError(error),
            context: {
              operation: 'cleanup',
              timestamp: Date.now(),
            },
          });
        }
      }
    }

    if (idsToRemove.length > 0) {
      this.logger.info('Connection cleanup completed', {
        removedCount: idsToRemove.length,
        remainingConnections: this.connections.size,
        duration: Date.now() - cleanupStart,
        context: {
          operation: 'cleanup',
          timestamp: Date.now(),
        },
      });
    }
  }

  /**
   * Get current pool metrics
   */
  getMetrics() {
    const metrics = {
      ...this.stateManager.getMetrics(),
      connections: {
        total: this.connections.size,
        inUse: Array.from(this.connections.values()).filter(c => c.inUse).length,
        idle: Array.from(this.connections.values()).filter(c => !c.inUse).length,
        totalCreated: this.totalConnectionsCreated,
        totalErrors: this.totalConnectionErrors,
      },
      usage: Array.from(this.connections.values()).map(conn => ({
        id: conn.id,
        age: Date.now() - conn.createdAt,
        usageCount: conn.usageCount,
        totalUsageTime: conn.totalUsageTime,
        errorCount: conn.errorCount,
        lastUsed: Date.now() - conn.lastUsed,
      })),
    };

    this.logger.debug('Pool metrics retrieved', {
      metrics,
      context: {
        operation: 'getMetrics',
        timestamp: Date.now(),
      },
    });

    return metrics;
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    const closeStart = Date.now();
    this.stateManager.stopMonitoring();

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.logger.info('Closing connection pool', {
      activeConnections: this.connections.size,
      context: {
        operation: 'close',
        timestamp: closeStart,
      },
    });

    // Force close all connections, even those with transactions
    const closePromises = Array.from(this.connections.entries()).map(async ([id, conn]) => {
      try {
        // Rollback any active transactions
        if (this.stateManager.hasActiveTransaction(id)) {
          try {
            await conn.db.exec('ROLLBACK');
            this.logger.debug('Rolled back transaction on close', {
              id,
              context: {
                operation: 'close',
                timestamp: Date.now(),
              },
            });
          } catch (e) {
            // Ignore rollback errors on close
          }
        }

        await conn.db.close();
        this.stateManager.unregisterConnection(id);
        this.connectionIds.delete(conn.db);

        this.logger.debug('Closed connection', {
          id,
          usageCount: conn.usageCount,
          totalUsageTime: conn.totalUsageTime,
          context: {
            operation: 'close',
            timestamp: Date.now(),
          },
        });
      } catch (error) {
        this.logger.error('Failed to close connection', error, {
          id,
          isTransient: isTransientError(error),
          isDatabaseError: isDatabaseError(error),
          context: {
            operation: 'close',
            timestamp: Date.now(),
          },
        });
      }
    });

    await Promise.all(closePromises);
    this.connections.clear();
    this.verifiedConnections.clear();

    this.logger.info('Connection pool closed', {
      duration: Date.now() - closeStart,
      totalConnectionsCreated: this.totalConnectionsCreated,
      totalConnectionErrors: this.totalConnectionErrors,
      context: {
        operation: 'close',
        timestamp: Date.now(),
      },
    });
  }
}
