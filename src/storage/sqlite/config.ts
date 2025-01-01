import { StorageConfig } from '../../types/storage.js';
import { PlatformCapabilities } from '../../utils/platform-utils.js';

// Default configuration values
export const DEFAULT_PAGE_SIZE = 4096;
export const DEFAULT_CACHE_SIZE = 2000;
export const DEFAULT_BUSY_TIMEOUT = 2000;

/**
 * SQLite specific configuration
 */
export interface SqliteConfig extends StorageConfig {
  // File path
  path: string;

  // Connection settings
  maxConnections: number;
  timeout: number;
  busyTimeout: number;

  // Journal settings
  journalMode: 'delete' | 'truncate' | 'persist' | 'memory' | 'wal' | 'off';
  synchronous: 'off' | 'normal' | 'full' | 'extra';

  // Cache settings
  cacheSize: number;
  pageSize: number;
  maxPageCount: number;
  tempStore: 'default' | 'file' | 'memory';
  mmap: boolean;
  sharedMemory: boolean;

  // Access mode
  readonly: boolean;
}

/**
 * Default SQLite configuration
 */
export const DEFAULT_CONFIG: Required<SqliteConfig> = {
  // StorageConfig required properties
  baseDir: process.env.SQLITE_BASE_DIR || './data',
  name: process.env.SQLITE_DB_NAME || 'sqlite-db',
  connection: {
    maxConnections: 1,
    maxRetries: 3,
    retryDelay: 1000,
    busyTimeout: 2000,
    idleTimeout: 60000,
  },
  performance: {
    checkpointInterval: 30000,
    cacheSize: 2000,
    mmapSize: 67108864, // 64MB
    pageSize: 4096,
    maxMemory: 134217728, // 128MB
  },

  // File path
  path: ':memory:', // In-memory database by default

  // Connection settings
  maxConnections: 1,
  timeout: 5000,
  busyTimeout: 2000,

  // Journal settings
  journalMode: 'wal',
  synchronous: 'normal',

  // Cache settings
  cacheSize: 2000,
  pageSize: 4096, // Will be overridden by platform-specific settings
  maxPageCount: 1000000,
  tempStore: 'memory',
  mmap: true,
  sharedMemory: false, // Will be overridden by platform-specific settings

  // Access mode
  readonly: false,
};

/**
 * Create SQLite configuration with defaults
 */
export function createConfig(config: Partial<SqliteConfig> = {}): Required<SqliteConfig> {
  // Get platform-specific SQLite settings for dynamic defaults
  const platformSqlite = PlatformCapabilities.getSqliteConfig();

  const defaultConfig = {
    ...DEFAULT_CONFIG,
    pageSize: platformSqlite.pageSize,
    sharedMemory: platformSqlite.sharedMemory,
  };

  return {
    ...defaultConfig,
    ...config,
  };
}
