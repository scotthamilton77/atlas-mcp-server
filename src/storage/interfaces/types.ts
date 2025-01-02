import { Task, CreateTaskInput, UpdateTaskInput, TaskStatus } from '../../types/task.js';
import { Resource, ResourceTemplate } from '@modelcontextprotocol/sdk/types.js';
import { PlatformCapabilities, PlatformPaths } from '../../utils/platform-utils.js';

// Get platform-specific SQLite configuration
const platformSqliteConfig = PlatformCapabilities.getSqliteConfig();
const platformMaxMemory = PlatformCapabilities.getMaxMemory();

/**
 * Core storage configuration interface
 */
export interface StorageConfig {
  baseDir: string;
  name: string;
  path?: string;
  connection?: ConnectionConfig;
  performance?: PerformanceConfig;
  sqlite?: SqliteConfig;
}

/**
 * Connection configuration
 */
export interface ConnectionConfig {
  maxConnections?: number;
  maxRetries?: number;
  retryDelay?: number;
  busyTimeout?: number;
  idleTimeout?: number;
  acquireTimeout?: number;
}

/**
 * Performance tuning configuration
 */
export interface PerformanceConfig {
  checkpointInterval?: number;
  cacheSize?: number;
  mmapSize?: number;
  pageSize?: number;
  maxMemory?: number;
  sharedMemory?: boolean;
  statementCacheSize?: number;
  vacuumInterval?: number;
}

/**
 * SQLite-specific configuration
 */
export interface SqliteConfig {
  journalMode?: 'DELETE' | 'TRUNCATE' | 'PERSIST' | 'MEMORY' | 'WAL' | 'OFF';
  synchronous?: 'OFF' | 'NORMAL' | 'FULL' | 'EXTRA';
  tempStore?: 'DEFAULT' | 'FILE' | 'MEMORY';
  lockingMode?: 'NORMAL' | 'EXCLUSIVE';
  autoVacuum?: 'NONE' | 'FULL' | 'INCREMENTAL';
}

/**
 * Storage statistics
 */
export interface StorageStats {
  size: number;
  walSize: number;
  pageCount: number;
  pageSize: number;
  journalMode: string;
}

/**
 * Storage metrics
 */
export interface StorageMetrics {
  tasks: {
    total: number;
    byStatus: Record<TaskStatus, number>;
    noteCount: number;
    dependencyCount: number;
  };
  storage: {
    totalSize: number;
    pageSize: number;
    pageCount: number;
    walSize: number;
    cache: {
      hitRate: number;
      memoryUsage: number;
      entryCount: number;
    };
  };
}

/**
 * Connection statistics
 */
export interface ConnectionStats {
  total: number;
  active: number;
  idle: number;
  errors: number;
  avgResponseTime: number;
}

/**
 * Monitoring metrics
 */
export interface MonitoringMetrics {
  storage?: StorageStats;
  connections: ConnectionStats;
  performance?: {
    queryTime: number;
    transactionTime: number;
    walCheckpointTime: number;
    cacheHitRate: number;
    indexHitRate: number;
  };
  errors?: {
    count: number;
    lastError?: string;
    lastErrorTime?: number;
  };
  queries: {
    total: number;
    errors: number;
    slowQueries: number;
    avgExecutionTime: number;
  };
  cache: {
    hits: number;
    misses: number;
    size: number;
    maxSize: number;
    hitRate: number;
    evictions: number;
    memoryUsage: number;
  };
  timestamp: number;
}

/**
 * Core storage interface for task persistence
 */
export interface TaskStorage {
  // Lifecycle methods
  initialize(): Promise<void>;
  close(): Promise<void>;

  // Transaction methods
  beginTransaction(): Promise<void>;
  commitTransaction(): Promise<void>;
  rollbackTransaction(): Promise<void>;
  executeInTransaction<T>(work: () => Promise<T>, retries?: number): Promise<T>;

  // Task operations
  createTask(input: CreateTaskInput): Promise<Task>;
  updateTask(path: string, updates: UpdateTaskInput): Promise<Task>;
  getTask(path: string): Promise<Task | null>;
  getTasks(paths: string[]): Promise<Task[]>;
  getTasksByPattern(pattern: string): Promise<Task[]>;
  getTasksByStatus(status: TaskStatus): Promise<Task[]>;
  getChildren(parentPath: string): Promise<Task[]>;
  deleteTask(path: string): Promise<void>;
  deleteTasks(paths: string[]): Promise<void>;
  hasChildren(path: string): Promise<boolean>;
  getDependentTasks(path: string): Promise<Task[]>;
  saveTask(task: Task): Promise<void>;
  saveTasks(tasks: Task[]): Promise<void>;
  clearAllTasks(): Promise<void>;

  // Maintenance operations
  vacuum(): Promise<void>;
  analyze(): Promise<void>;
  checkpoint(): Promise<void>;
  repairRelationships(dryRun?: boolean): Promise<{ fixed: number; issues: string[] }>;
  clearCache(): Promise<void>;
  verifyIntegrity(): Promise<boolean>;

  // Resource operations
  getTaskResource(uri: string): Promise<Resource>;
  listTaskResources(): Promise<Resource[]>;
  getTemplateResource(uri: string): Promise<Resource>;
  listTemplateResources(): Promise<Resource[]>;
  getHierarchyResource(rootPath: string): Promise<Resource>;
  getStatusResource(taskPath: string): Promise<Resource>;
  getResourceTemplates(): Promise<ResourceTemplate[]>;
  resolveResourceTemplate(template: string, vars: Record<string, string>): Promise<Resource>;
  notifyResourceUpdate(uri: string): Promise<void>;

  // Metrics and stats
  getStats(): Promise<StorageStats>;
  getMetrics(): Promise<StorageMetrics>;
}

/**
 * Storage provider interface for dependency injection
 */
export interface StorageProvider {
  getStorage(): Promise<TaskStorage>;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Required<StorageConfig> = {
  baseDir: PlatformPaths.getAppDataDir('atlas'),
  name: 'storage',
  path: '',
  connection: {
    maxConnections: 10,
    maxRetries: 3,
    retryDelay: 1000,
    busyTimeout: 5000,
    idleTimeout: 60000,
    acquireTimeout: 30000,
  },
  performance: {
    pageSize: platformSqliteConfig.pageSize,
    cacheSize: 2000,
    mmapSize: 64 * 1024 * 1024, // 64MB
    maxMemory: platformMaxMemory,
    checkpointInterval: 300000, // 5 minutes
    vacuumInterval: 3600000, // 1 hour
    statementCacheSize: 100,
    sharedMemory: platformSqliteConfig.sharedMemory,
  },
  sqlite: {
    journalMode: 'WAL',
    synchronous: 'NORMAL',
    tempStore: 'FILE',
    lockingMode: 'NORMAL',
    autoVacuum: 'NONE',
  },
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
    sqlite: {
      ...defaults.sqlite,
      ...config.sqlite,
    },
  } as Required<T>;
}
