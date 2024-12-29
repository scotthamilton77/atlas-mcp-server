/**
 * Base storage configuration interface
 */
export interface StorageConfig {
  baseDir: string;
  name: string;
  connection?: ConnectionConfig;
  performance?: PerformanceConfig;
}

/**
 * Connection configuration
 */
export interface ConnectionConfig {
  maxRetries?: number;
  retryDelay?: number;
  busyTimeout?: number;
  maxPoolSize?: number;
  idleTimeout?: number;
  acquireTimeout?: number;
}

/**
 * Performance tuning configuration
 */
export interface PerformanceConfig {
  pageSize?: number;
  cacheSize?: number;
  mmapSize?: number;
  maxMemory?: number;
  checkpointInterval?: number;
  vacuumInterval?: number;
  statementCacheSize?: number;
}

/**
 * SQLite-specific configuration
 */
export interface SqliteConfig extends StorageConfig {
  sqlite?: {
    journalMode?: 'DELETE' | 'TRUNCATE' | 'PERSIST' | 'MEMORY' | 'WAL' | 'OFF';
    synchronous?: 'OFF' | 'NORMAL' | 'FULL' | 'EXTRA';
    tempStore?: 'DEFAULT' | 'FILE' | 'MEMORY';
    lockingMode?: 'NORMAL' | 'EXCLUSIVE';
    autoVacuum?: 'NONE' | 'FULL' | 'INCREMENTAL';
  };
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Required<StorageConfig> = {
  baseDir: '.',
  name: 'storage',
  connection: {
    maxRetries: 3,
    retryDelay: 1000,
    busyTimeout: 5000,
    maxPoolSize: 10,
    idleTimeout: 60000,
    acquireTimeout: 30000,
  },
  performance: {
    pageSize: 4096,
    cacheSize: 2000,
    mmapSize: 64 * 1024 * 1024, // 64MB
    maxMemory: 256 * 1024 * 1024, // 256MB
    checkpointInterval: 300000, // 5 minutes
    vacuumInterval: 3600000, // 1 hour
    statementCacheSize: 100,
  },
};

/**
 * SQLite-specific defaults
 */
export const SQLITE_DEFAULTS = {
  journalMode: 'WAL' as const,
  synchronous: 'NORMAL' as const,
  tempStore: 'FILE' as const,
  lockingMode: 'NORMAL' as const,
  autoVacuum: 'NONE' as const,
};

/**
 * Validate and merge configuration with defaults
 */
export function mergeWithDefaults<T extends StorageConfig>(
  config: Partial<T>,
  defaults: Required<StorageConfig> = DEFAULT_CONFIG
): Required<T> {
  return {
    ...defaults,
    ...config,
    connection: {
      ...defaults.connection,
      ...config.connection,
    },
    performance: {
      ...defaults.performance,
      ...config.performance,
    },
  } as Required<T>;
}
