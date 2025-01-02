import { Database } from 'sqlite3';
import { randomUUID } from 'crypto';
import { Logger } from '../../../logging/index.js';
import { StorageErrorHandler } from '../../utils/index.js';
import {
  Connection,
  ConnectionState,
  ConnectionMetrics,
  ConnectionSettings,
  getDefaultConnectionSettings,
} from './types.js';

/**
 * SQLite-specific connection implementation
 */
export class SqliteConnection implements Connection {
  readonly id: string = randomUUID();
  state: ConnectionState = ConnectionState.IDLE;
  lastUsed: Date = new Date();

  private readonly logger: Logger;
  private readonly errorHandler: StorageErrorHandler;
  private queryStartTime: number = 0;

  private _metrics: ConnectionMetrics = {
    queries: 0,
    errors: 0,
    totalTime: 0,
    avgQueryTime: 0,
    memoryUsage: 0,
    pageSize: 0,
    cacheSize: 0,
    bytesTransferred: 0,
    queryLatency: 0,
  };

  constructor(
    private readonly db: Database,
    private readonly _settings: ConnectionSettings = getDefaultConnectionSettings()
  ) {
    this.logger = Logger.getInstance().child({
      component: 'SqliteConnection',
      connectionId: this.id,
    });
    this.errorHandler = new StorageErrorHandler('SqliteConnection');

    // Initialize metrics
    this.updateMetrics();
  }

  get metrics(): ConnectionMetrics {
    return { ...this._metrics };
  }

  get settings(): ConnectionSettings {
    return { ...this._settings };
  }

  /**
   * Execute SQL query with parameters
   */
  async execute<T = any>(sql: string, params: any[] = []): Promise<T> {
    try {
      this.queryStartTime = Date.now();
      this._metrics.lastQuery = sql;
      this._metrics.lastQueryTime = new Date();

      const result = await new Promise<T>((resolve, reject) => {
        if (sql.toLowerCase().startsWith('select')) {
          this.db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows as T);
          });
        } else {
          this.db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes } as T);
          });
        }
      });

      // Update metrics
      this._metrics.queries++;
      this._metrics.queryLatency += Date.now() - this.queryStartTime;
      this._metrics.avgQueryTime = this._metrics.queryLatency / this._metrics.queries;
      this._metrics.bytesTransferred += Buffer.byteLength(JSON.stringify(result));

      return result;
    } catch (error) {
      this._metrics.errors++;
      this._metrics.lastError = error as Error;
      throw this.errorHandler.handleQueryError(error, sql, params);
    }
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close(err => {
        if (err) {
          this.state = ConnectionState.ERROR;
          reject(err);
        } else {
          this.state = ConnectionState.CLOSED;
          resolve();
        }
      });
    });
  }

  /**
   * Check if connection is healthy
   */
  isHealthy(): boolean {
    if (this.state === ConnectionState.ERROR || this.state === ConnectionState.CLOSED) {
      return false;
    }

    // Check if too many errors
    if (this._metrics.errors > 10) {
      return false;
    }

    // Check if queries are too slow
    if (this._metrics.avgQueryTime > 1000) {
      return false;
    }

    return true;
  }

  /**
   * Ping database to check connection
   */
  async ping(): Promise<boolean> {
    try {
      await this.execute('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Set SQLite PRAGMA value
   */
  async setPragma(name: string, value: string | number): Promise<void> {
    await this.execute(`PRAGMA ${name} = ${value}`);
  }

  /**
   * Get SQLite PRAGMA value
   */
  async getPragma(name: string): Promise<string> {
    const result = await this.execute<[{ value: string }]>(`PRAGMA ${name}`);
    return result[0].value;
  }

  /**
   * Shrink memory usage
   */
  async shrinkMemory(): Promise<void> {
    // Release as much memory as possible
    await this.execute('PRAGMA shrink_memory');

    // Clear internal caches
    await this.execute('PRAGMA cache_spill = 1');

    // Update metrics
    await this.updateMetrics();
  }

  /**
   * Get current memory usage
   */
  async getMemoryUsage(): Promise<number> {
    const result = await this.execute<[{ mem: number }]>('PRAGMA memory_used');
    const memoryUsed = result[0].mem * 1024; // Convert to bytes
    this._metrics.memoryUsage = memoryUsed;
    return memoryUsed;
  }

  /**
   * Update connection metrics
   */
  private async updateMetrics(): Promise<void> {
    try {
      // Get page size
      const pageSizeResult = await this.execute<[{ page_size: number }]>('PRAGMA page_size');
      this._metrics.pageSize = pageSizeResult[0].page_size;

      // Get cache size
      const cacheSizeResult = await this.execute<[{ cache_size: number }]>('PRAGMA cache_size');
      this._metrics.cacheSize = Math.abs(cacheSizeResult[0].cache_size) * this._metrics.pageSize;

      // Get memory usage
      await this.getMemoryUsage();
    } catch (error) {
      this.logger.error('Failed to update metrics', { error });
    }
  }
}
