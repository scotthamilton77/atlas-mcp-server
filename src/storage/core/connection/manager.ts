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

  constructor(config: StorageConfig, options: ConnectionOptions = {}) {
    this.logger = Logger.getInstance().child({ component: 'ConnectionManager' });
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.busyTimeout = options.busyTimeout || 5000;

    this.pool = new ConnectionPool(config, {
      minConnections: options.minConnections,
      maxConnections: options.maxConnections,
      idleTimeout: options.idleTimeout,
    });
  }

  /**
   * Initialize the connection manager and pool
   */
  async initialize(): Promise<void> {
    await this.pool.initialize();
  }

  /**
   * Execute a database operation with retries and connection management
   */
  async execute<T>(operation: (db: Database) => Promise<T>, context: string): Promise<T> {
    let lastError: Error | undefined;
    let retryCount = 0;
    let db: Database | null = null;

    while (retryCount < this.maxRetries) {
      try {
        // Get connection from pool
        db = await this.pool.getConnection();

        // Execute operation
        const result = await operation(db);

        // Operation succeeded
        if (retryCount > 0) {
          this.logger.info(`Operation succeeded after ${retryCount} retries`, {
            context,
          });
        }

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        retryCount++;

        // Log detailed error info
        const errorDetails =
          lastError instanceof Error
            ? {
                name: lastError.name,
                message: lastError.message,
                code: (lastError as any).code,
                errno: (lastError as any).errno,
              }
            : lastError;

        this.logger.warn(`Operation failed${retryCount < this.maxRetries ? ', retrying' : ''}`, {
          attempt: retryCount,
          maxRetries: this.maxRetries,
          error: errorDetails,
          context,
        });

        // Check if error is WAL-related
        const isWalError =
          lastError instanceof Error &&
          (lastError.message.includes('WAL') ||
            lastError.message.includes('journal_mode') ||
            lastError.message.includes('Safety level'));

        if (retryCount < this.maxRetries) {
          // Longer delay for WAL-related errors
          const baseDelay = isWalError ? 1000 : this.retryDelay;
          const delay = Math.min(
            baseDelay * Math.pow(2, retryCount - 1) * (0.5 + Math.random()),
            isWalError ? 10000 : 5000 // Higher cap for WAL errors
          );
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } finally {
        // Always release connection back to pool
        if (db) {
          this.pool.releaseConnection(db);
        }
      }
    }

    // All retries failed
    throw createError(
      ErrorCodes.STORAGE_ERROR,
      'Operation failed',
      `Failed after ${this.maxRetries} retries: ${lastError?.message}`,
      lastError?.message
    );
  }

  /**
   * Execute a database operation with busy handling
   */
  async handleBusy(operation: () => Promise<void>, context: string): Promise<void> {
    const startTime = Date.now();

    while (true) {
      try {
        await operation();
        return;
      } catch (error) {
        const elapsed = Date.now() - startTime;
        if (elapsed >= this.busyTimeout) {
          throw createError(
            ErrorCodes.STORAGE_ERROR,
            'Operation timed out',
            `Timed out after ${elapsed}ms: ${error instanceof Error ? error.message : String(error)}`
          );
        }

        this.logger.warn('Database busy, waiting...', {
          elapsed,
          timeout: this.busyTimeout,
          context,
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
    await this.pool.close();
  }
}
