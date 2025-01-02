import { Database, open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { Logger } from '../../../logging/index.js';
import { SqliteConfig } from '../config.js';
import { ConnectionStats } from '../../../types/storage.js';

/**
 * SQLite connection manager
 */
export class SqliteConnection {
  private readonly logger: Logger;
  private db: Database | null = null;
  private isOpen = false;
  private inTransaction = false;
  private readonly _dbPath: string;

  /**
   * Get database file path
   */
  get dbPath(): string {
    return this._dbPath;
  }
  private stats: ConnectionStats = {
    total: 0,
    active: 0,
    idle: 0,
    errors: 0,
    avgResponseTime: 0,
  };

  constructor(private readonly config: Required<SqliteConfig>) {
    this.logger = Logger.getInstance().child({ component: 'SqliteConnection' });
    this._dbPath = config.path;
  }

  /**
   * Execute operation with retry
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries = 3
  ): Promise<T> {
    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(`Operation ${operationName} failed (attempt ${attempt}/${maxRetries})`, {
          error: lastError,
        });
        if (attempt === maxRetries) {
          throw lastError;
        }
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
      }
    }
    throw lastError;
  }

  /**
   * Open database connection
   */
  async open(): Promise<void> {
    if (this.isOpen) {
      throw new Error('Connection already open');
    }

    try {
      this.db = await open({
        filename: this.config.path,
        driver: sqlite3.Database,
      });

      // Configure connection
      await this.db.run('PRAGMA foreign_keys = ON');
      await this.db.run(`PRAGMA journal_mode = ${this.config.journalMode}`);
      await this.db.run(`PRAGMA synchronous = ${this.config.synchronous}`);
      await this.db.run(`PRAGMA cache_size = ${this.config.cacheSize}`);
      await this.db.run(`PRAGMA page_size = ${this.config.pageSize}`);
      await this.db.run(`PRAGMA max_page_count = ${this.config.maxPageCount}`);
      await this.db.run(`PRAGMA temp_store = ${this.config.tempStore}`);
      await this.db.run(`PRAGMA mmap_size = ${this.config.mmap ? -1 : 0}`);
      await this.db.run(`PRAGMA busy_timeout = ${this.config.busyTimeout}`);

      this.isOpen = true;
      this.stats.total++;
      this.stats.active++;
      this.logger.info('Database connection opened');
    } catch (error) {
      this.stats.errors++;
      this.logger.error('Failed to open database connection', { error });
      throw error;
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (!this.isOpen || !this.db) {
      throw new Error('Connection not open');
    }

    try {
      await this.db.close();
      this.db = null;
      this.isOpen = false;
      this.stats.active--;
      this.stats.idle++;
      this.logger.info('Database connection closed');
    } catch (error) {
      this.stats.errors++;
      this.logger.error('Failed to close database connection', { error });
      throw error;
    }
  }

  /**
   * Begin transaction
   */
  async beginTransaction(): Promise<void> {
    if (!this.isOpen || !this.db) {
      throw new Error('Connection not open');
    }

    if (this.inTransaction) {
      throw new Error('Transaction already in progress');
    }

    try {
      await this.db.run('BEGIN TRANSACTION');
      this.inTransaction = true;
      this.logger.debug('Transaction started');
    } catch (error) {
      this.stats.errors++;
      this.logger.error('Failed to begin transaction', { error });
      throw error;
    }
  }

  /**
   * Commit transaction
   */
  async commitTransaction(): Promise<void> {
    if (!this.isOpen || !this.db) {
      throw new Error('Connection not open');
    }

    if (!this.inTransaction) {
      throw new Error('No transaction in progress');
    }

    try {
      await this.db.run('COMMIT');
      this.inTransaction = false;
      this.logger.debug('Transaction committed');
    } catch (error) {
      this.stats.errors++;
      this.logger.error('Failed to commit transaction', { error });
      throw error;
    }
  }

  /**
   * Rollback transaction
   */
  async rollbackTransaction(): Promise<void> {
    if (!this.isOpen || !this.db) {
      throw new Error('Connection not open');
    }

    if (!this.inTransaction) {
      throw new Error('No transaction in progress');
    }

    try {
      await this.db.run('ROLLBACK');
      this.inTransaction = false;
      this.logger.debug('Transaction rolled back');
    } catch (error) {
      this.stats.errors++;
      this.logger.error('Failed to rollback transaction', { error });
      throw error;
    }
  }

  /**
   * Execute work in transaction
   */
  async executeInTransaction<T>(work: () => Promise<T>, retries = 3): Promise<T> {
    let attempt = 0;
    while (attempt < retries) {
      try {
        if (!this.isOpen) {
          await this.open();
        }
        await this.beginTransaction();
        const result = await work();
        await this.commitTransaction();
        return result;
      } catch (error) {
        this.stats.errors++;
        this.logger.error(`Transaction failed (attempt ${attempt + 1}/${retries})`, {
          error,
        });
        if (this.inTransaction) {
          await this.rollbackTransaction();
        }
        attempt++;
        if (attempt === retries) {
          throw error;
        }
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
      }
    }
    throw new Error('Transaction failed after max retries');
  }

  /**
   * Execute database operation
   */
  async execute<T>(operation: (db: Database) => Promise<T>, name: string): Promise<T> {
    if (!this.isOpen) {
      await this.open();
    }

    if (!this.db) {
      throw new Error('Database connection not available');
    }

    const start = Date.now();
    try {
      const result = await operation(this.db);
      const duration = Date.now() - start;
      this.logger.debug(`Operation ${name} completed`, { duration });
      return result;
    } catch (error) {
      this.stats.errors++;
      const duration = Date.now() - start;
      this.logger.error(`Operation ${name} failed`, {
        error,
        duration,
      });
      throw error;
    }
  }

  /**
   * Clear connection cache
   */
  async clearCache(): Promise<void> {
    if (!this.isOpen || !this.db) {
      throw new Error('Connection not open');
    }

    try {
      await this.db.run('PRAGMA shrink_memory');
      this.logger.debug('Connection cache cleared');
    } catch (error) {
      this.stats.errors++;
      this.logger.error('Failed to clear connection cache', { error });
      throw error;
    }
  }

  /**
   * Get connection metrics
   */
  getCacheMetrics(): {
    hitRate: number;
    memoryUsage: number;
    entryCount: number;
  } {
    return {
      hitRate: 0, // SQLite doesn't expose cache hit rate
      memoryUsage: 0, // SQLite doesn't expose memory usage
      entryCount: 0, // SQLite doesn't expose entry count
    };
  }

  /**
   * Get connection statistics
   */
  getStats(): ConnectionStats {
    return { ...this.stats };
  }
}
