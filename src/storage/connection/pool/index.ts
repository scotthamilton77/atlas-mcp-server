import { StorageConfig, ConnectionStats } from '../../../types/storage.js';
import {
  Connection,
  ConnectionState,
  ConnectionMetrics,
  ConnectionSettings,
  getDefaultConnectionSettings,
  validateConnectionSettings,
} from './types.js';
import { ConnectionPool } from './connection-pool.js';
import { StorageErrorHandler } from '../../utils/index.js';

/**
 * Factory for creating database connections
 */
export class ConnectionFactory {
  private readonly errorHandler: StorageErrorHandler;
  private readonly _config: StorageConfig;

  constructor(config: StorageConfig) {
    this._config = config;
    this.errorHandler = new StorageErrorHandler('ConnectionFactory');
  }

  /**
   * Get storage configuration
   */
  get config(): StorageConfig {
    return this._config;
  }

  /**
   * Create a new connection pool
   */
  async createPool(
    options: {
      maxSize?: number;
      minSize?: number;
      acquireTimeout?: number;
      idleTimeout?: number;
    } = {}
  ): Promise<ConnectionPool> {
    // Convert storage config to connection settings
    const settings = validateConnectionSettings({
      pageSize: this._config.performance?.pageSize,
      sharedCache: this._config.performance?.sharedMemory,
      memoryLimit: this._config.performance?.maxMemory,
      journalMode: this._config.journalMode?.toUpperCase() as ConnectionSettings['journalMode'],
      synchronous: this._config.synchronous?.toUpperCase() as ConnectionSettings['synchronous'],
      tempStore: this._config.tempStore?.toUpperCase() as ConnectionSettings['tempStore'],
    });

    // Create pool configuration
    const poolConfig = {
      maxSize: options.maxSize ?? this._config.connection?.maxConnections,
      minSize: options.minSize ?? 1,
      acquireTimeout: options.acquireTimeout ?? this._config.connection?.busyTimeout,
      idleTimeout: options.idleTimeout ?? this._config.connection?.idleTimeout,
      maxWaitingClients: (options.maxSize ?? this._config.connection?.maxConnections ?? 10) * 2,
      busyTimeout: this._config.connection?.busyTimeout,
      sharedCache: settings.sharedCache,
      pageSize: settings.pageSize,
    };

    // Create connection factory function
    const createConnection = async (): Promise<Connection> => {
      try {
        // Implementation will be provided by specific database driver
        throw new Error('Connection factory not implemented');
      } catch (error) {
        this.errorHandler.handleConnectionError(error, {
          operation: 'createConnection',
          settings,
        });
      }
    };

    return new ConnectionPool(poolConfig, createConnection);
  }

  /**
   * Convert connection metrics to stats format
   */
  static toConnectionStats(metrics: ConnectionMetrics[]): ConnectionStats {
    const total = metrics.length;
    const errors = metrics.reduce((sum, m) => sum + m.errors, 0);
    const totalTime = metrics.reduce((sum, m) => sum + m.totalTime, 0);
    const queries = metrics.reduce((sum, m) => sum + m.queries, 0);

    return {
      total,
      active: metrics.filter(m => m.queries > 0).length,
      idle: metrics.filter(m => m.queries === 0).length,
      errors,
      avgResponseTime: queries > 0 ? totalTime / queries : 0,
    };
  }
}

// Re-export types
export {
  Connection,
  ConnectionState,
  ConnectionMetrics,
  ConnectionSettings,
  getDefaultConnectionSettings,
  validateConnectionSettings,
  ConnectionPool,
};

/**
 * Validate storage configuration for connections
 */
export function validateConfig(config: StorageConfig): void {
  if (!config.baseDir) {
    throw new Error('Storage baseDir is required');
  }
  if (!config.name) {
    throw new Error('Storage name is required');
  }

  // Validate connection settings
  if (config.connection) {
    if (config.connection.maxConnections && config.connection.maxConnections < 1) {
      throw new Error('maxConnections must be at least 1');
    }
    if (config.connection.maxRetries && config.connection.maxRetries < 0) {
      throw new Error('maxRetries cannot be negative');
    }
    if (config.connection.retryDelay && config.connection.retryDelay < 0) {
      throw new Error('retryDelay cannot be negative');
    }
    if (config.connection.busyTimeout && config.connection.busyTimeout < 0) {
      throw new Error('busyTimeout cannot be negative');
    }
    if (config.connection.idleTimeout && config.connection.idleTimeout < 0) {
      throw new Error('idleTimeout cannot be negative');
    }
  }

  // Validate performance settings
  if (config.performance) {
    if (config.performance.pageSize && config.performance.pageSize < 512) {
      throw new Error('pageSize must be at least 512 bytes');
    }
    if (config.performance.cacheSize && config.performance.cacheSize < 0) {
      throw new Error('cacheSize cannot be negative');
    }
    if (config.performance.maxMemory && config.performance.maxMemory < 0) {
      throw new Error('maxMemory cannot be negative');
    }
  }
}
