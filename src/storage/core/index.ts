/**
 * Core storage components
 */

// Types
import { StorageConfig } from '../../types/storage.js';

// Connection management
import { ConnectionManager, type ConnectionOptions } from './connection/manager.js';
import { ConnectionPool } from './connection/pool.js';

// Query handling
import { QueryBuilder } from './query/builder.js';
import { QueryExecutor } from './query/executor.js';
import { QueryOptimizer } from './query/optimizer.js';

// Schema management
import { SchemaManager } from './schema/migrations.js';
import { SchemaValidator } from './schema/validator.js';
import { BackupManager } from './schema/backup.js';

// Re-export everything
export { ConnectionManager, type ConnectionOptions } from './connection/manager.js';
export { ConnectionPool } from './connection/pool.js';
export { HealthMonitor, type ConnectionHealth, type HealthMetrics } from './connection/health.js';

// Query handling
export { QueryBuilder } from './query/builder.js';
export { QueryExecutor } from './query/executor.js';
export { QueryOptimizer } from './query/optimizer.js';

// Schema management
export { SchemaManager } from './schema/migrations.js';
export {
  SchemaValidator,
  type TableDefinition,
  type ColumnDefinition,
  type ValidationResult,
} from './schema/validator.js';
export {
  BackupManager,
  type BackupMetadata,
  type BackupOptions,
  type RestoreOptions,
} from './schema/backup.js';

// Utility types
export interface StorageOptions {
  // Connection options
  connection?: ConnectionOptions;
  minConnections?: number;
  maxConnections?: number;
  idleTimeout?: number;
  healthCheckInterval?: number;
  errorThreshold?: number;
  responseTimeThreshold?: number;

  // Query options
  slowQueryThreshold?: number;
  maxQueryCacheSize?: number;
  queryCacheTTL?: number;
  costThreshold?: number;

  // Backup options
  backupDir?: string;
  maxBackups?: number;
}

// Factory function to create storage components
export function createStorageCore(config: StorageConfig, options: StorageOptions = {}) {
  // Create connection pool and manager
  const pool = new ConnectionPool(
    {
      ...config,
      monitoring: {
        enabled: true,
        healthCheck: {
          enabled: true,
          interval: options.healthCheckInterval,
          errorThreshold: options.errorThreshold,
          responseTimeThreshold: options.responseTimeThreshold,
        },
        metrics: {
          enabled: true,
        },
      },
    },
    {
      minConnections: options.minConnections,
      maxConnections: options.maxConnections,
      idleTimeout: options.idleTimeout,
    }
  );

  const connectionManager = new ConnectionManager(config, options.connection);

  // Create query components
  const queryBuilder = new QueryBuilder();
  const queryExecutor = new QueryExecutor(pool, {
    slowQueryThreshold: options.slowQueryThreshold,
    maxCacheSize: options.maxQueryCacheSize,
    defaultCacheTTL: options.queryCacheTTL,
  });
  const queryOptimizer = new QueryOptimizer({
    costThreshold: options.costThreshold,
  });

  // Create schema components
  const migrationManager = new SchemaManager();
  const schemaValidator = new SchemaValidator();
  const backupManager = options.backupDir
    ? new BackupManager({
        backupDir: options.backupDir,
        maxBackups: options.maxBackups,
      })
    : null;

  return {
    // Connection management
    pool,
    connectionManager,

    // Query handling
    queryBuilder,
    queryExecutor,
    queryOptimizer,

    // Schema management
    migrationManager,
    schemaValidator,
    backupManager,

    // Initialization
    async initialize() {
      await pool.initialize();
      if (backupManager) {
        await backupManager.initialize();
      }
    },

    // Cleanup
    async close() {
      await pool.close();
    },
  };
}
