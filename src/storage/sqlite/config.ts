import { StorageConfig } from '../../types/storage.js';
import { PlatformCapabilities } from '../../utils/platform-utils.js';
import { ConfigManager } from '../../config/index.js';

// Default configuration values
export const DEFAULT_PAGE_SIZE = 8192;
export const DEFAULT_CACHE_SIZE = 4000;
export const DEFAULT_BUSY_TIMEOUT = 5000; // Increased to handle WAL initialization lock contention

/**
 * SQLite specific configuration extending base storage config
 */
export interface SqliteConfig extends Omit<StorageConfig, 'connection' | 'performance'> {
  // SQLite-specific settings
  path: string;
  timeout: number;
  maxPageCount: number;
  tempStore: 'default' | 'file' | 'memory';
  mmap: boolean;
  readonly: boolean;

  // SQLite performance settings
  cacheSize: number;
  pageSize: number;
  busyTimeout: number;

  // Make base settings required
  connection: Required<NonNullable<StorageConfig['connection']>>;
  performance: Required<NonNullable<StorageConfig['performance']>>;
  journalMode: NonNullable<StorageConfig['journalMode']>;
  synchronous: NonNullable<StorageConfig['synchronous']>;
}

/**
 * Default SQLite configuration
 */
export const DEFAULT_CONFIG: Partial<SqliteConfig> = {
  connection: {
    maxConnections: 1,
    maxRetries: 3,
    retryDelay: 1000,
    busyTimeout: DEFAULT_BUSY_TIMEOUT,
    idleTimeout: 15000,
  },
  performance: {
    checkpointInterval: 30000,
    cacheSize: DEFAULT_CACHE_SIZE,
    mmapSize: 67108864, // 64MB
    pageSize: DEFAULT_PAGE_SIZE,
    maxMemory: 134217728, // 128MB
    sharedMemory: false,
  },
  journalMode: 'wal',
  synchronous: 'normal',
  tempStore: 'memory',
  readonly: false,
};

/**
 * Create SQLite configuration with defaults from ConfigManager
 */
export function createConfig(config: Partial<SqliteConfig> = {}): Required<SqliteConfig> {
  const configManager = ConfigManager.getInstance();
  const baseConfig = configManager.getConfig().storage;
  const platformSqlite = PlatformCapabilities.getSqliteConfig();

  const defaultConfig: Required<SqliteConfig> = {
    // Base storage config from ConfigManager
    baseDir: baseConfig.baseDir,
    name: baseConfig.name,
    path: config.path || ':memory:',

    // Connection settings
    connection: {
      maxConnections: config.connection?.maxConnections || 1,
      maxRetries: config.connection?.maxRetries || baseConfig.connection?.maxRetries || 3,
      retryDelay: config.connection?.retryDelay || baseConfig.connection?.retryDelay || 1000,
      busyTimeout:
        config.connection?.busyTimeout ||
        baseConfig.connection?.busyTimeout ||
        DEFAULT_BUSY_TIMEOUT,
      idleTimeout: config.connection?.idleTimeout || 15000,
    },

    // Performance settings
    performance: {
      checkpointInterval:
        config.performance?.checkpointInterval ||
        baseConfig.performance?.checkpointInterval ||
        30000,
      cacheSize:
        config.performance?.cacheSize || baseConfig.performance?.cacheSize || DEFAULT_CACHE_SIZE,
      mmapSize: config.performance?.mmapSize || baseConfig.performance?.mmapSize || 67108864,
      pageSize: config.performance?.pageSize || platformSqlite.pageSize,
      maxMemory: config.performance?.maxMemory || baseConfig.performance?.maxMemory || 134217728,
      sharedMemory: platformSqlite.sharedMemory,
    },
    cacheSize: config.performance?.cacheSize || DEFAULT_CACHE_SIZE,
    pageSize: config.performance?.pageSize || platformSqlite.pageSize,
    busyTimeout: config.connection?.busyTimeout || DEFAULT_BUSY_TIMEOUT,

    // SQLite-specific settings
    timeout: DEFAULT_BUSY_TIMEOUT,
    maxPageCount: 1000000,
    tempStore: 'memory',
    mmap: true,
    readonly: false,

    // Journal settings
    journalMode: 'wal',
    synchronous: 'normal',
  };

  return {
    ...defaultConfig,
    ...config,
  };
}
