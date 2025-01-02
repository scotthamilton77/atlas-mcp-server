import { Database } from 'sqlite3';
import { StorageConfig } from '../../../types/storage.js';
import { StorageErrorHandler, PlatformCapabilities } from '../../utils/index.js';
import { Logger } from '../../../logging/index.js';
import { ConnectionFactory, ConnectionSettings, validateConnectionSettings } from './types.js';
import { ConnectionPool } from './connection-pool.js';
import { SqliteConnection } from './sqlite-connection.js';

/**
 * Factory for creating SQLite database connections
 */
export class SqliteConnectionFactory implements ConnectionFactory {
  private readonly logger: Logger;
  private readonly errorHandler: StorageErrorHandler;
  private readonly _config: StorageConfig;
  private readonly settings: ConnectionSettings;

  constructor(config: StorageConfig) {
    this._config = config;
    this.logger = Logger.getInstance().child({ component: 'SqliteConnectionFactory' });
    this.errorHandler = new StorageErrorHandler('SqliteConnectionFactory');

    // Initialize platform-specific settings
    this.settings = validateConnectionSettings({
      pageSize: config.performance?.pageSize,
      sharedCache: config.performance?.sharedMemory,
      memoryLimit: config.performance?.maxMemory,
      journalMode: config.journalMode?.toUpperCase() as ConnectionSettings['journalMode'],
      synchronous: config.synchronous?.toUpperCase() as ConnectionSettings['synchronous'],
      tempStore: config.tempStore?.toUpperCase() as ConnectionSettings['tempStore'],
    });
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
    const platformConfig = PlatformCapabilities.getSqliteConfig();

    // Create pool configuration
    const poolConfig = {
      maxSize: options.maxSize ?? this._config.connection?.maxConnections,
      minSize: options.minSize ?? 1,
      acquireTimeout: options.acquireTimeout ?? this._config.connection?.busyTimeout,
      idleTimeout: options.idleTimeout ?? this._config.connection?.idleTimeout,
      maxWaitingClients: (options.maxSize ?? this._config.connection?.maxConnections ?? 10) * 2,
      busyTimeout: this._config.connection?.busyTimeout,
      sharedCache: platformConfig.sharedMemory,
      pageSize: platformConfig.pageSize,
    };

    // Create connection factory function
    const createConnection = async (): Promise<SqliteConnection> => {
      try {
        // Create database connection
        const db = await this.createDatabase();

        // Create and initialize connection
        const connection = new SqliteConnection(db, this.settings);
        await this.initializeConnection(connection);

        return connection;
      } catch (error) {
        this.errorHandler.handleConnectionError(error, {
          operation: 'createConnection',
          settings: this.settings,
        });
      }
    };

    // Create and return pool
    return new ConnectionPool(poolConfig, createConnection);
  }

  /**
   * Create SQLite database connection
   */
  private createDatabase(): Promise<Database> {
    return new Promise((resolve, reject) => {
      const db = new Database(this._config.path || ':memory:', err => {
        if (err) reject(err);
        else resolve(db);
      });
    });
  }

  /**
   * Initialize connection with platform-specific settings
   */
  private async initializeConnection(connection: SqliteConnection): Promise<void> {
    try {
      // Set connection mode
      await connection.setPragma('journal_mode', this.settings.journalMode);
      await connection.setPragma('synchronous', this.settings.synchronous);
      await connection.setPragma('temp_store', this.settings.tempStore);

      // Configure memory settings
      await connection.setPragma('page_size', this.settings.pageSize);
      await connection.setPragma(
        'cache_size',
        -Math.floor(this.settings.memoryLimit / this.settings.pageSize)
      );

      if (this.settings.sharedCache) {
        await connection.setPragma('cache_shared', 1);
      }

      // Enable foreign keys
      await connection.setPragma('foreign_keys', 1);

      // Set busy timeout
      if (this._config.connection?.busyTimeout) {
        await connection.setPragma('busy_timeout', this._config.connection.busyTimeout);
      }

      this.logger.debug('Connection initialized with settings', {
        connectionId: connection.id,
        settings: this.settings,
      });
    } catch (error) {
      this.logger.error('Failed to initialize connection', {
        connectionId: connection.id,
        error,
      });
      throw error;
    }
  }
}
