import { Task, CreateTaskInput, UpdateTaskInput, TaskStatus } from './task.js';

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
 * Storage configuration interface
 */
export interface StorageConfig {
  baseDir: string;
  name: string;
  path?: string;
  connection?: {
    maxConnections?: number;
    maxRetries?: number;
    retryDelay?: number;
    busyTimeout?: number;
    idleTimeout?: number;
  };
  performance?: {
    checkpointInterval?: number;
    cacheSize?: number;
    mmapSize?: number;
    pageSize?: number;
    maxMemory?: number;
  };
  journalMode?: 'delete' | 'truncate' | 'persist' | 'memory' | 'wal' | 'off';
  synchronous?: 'off' | 'normal' | 'full' | 'extra';
  tempStore?: 'default' | 'file' | 'memory';
  readonly?: boolean;
}

/**
 * Storage statistics interface
 */
export interface StorageStats {
  size: number;
  walSize: number;
  pageCount: number;
  pageSize: number;
  journalMode: string;
}

/**
 * Storage metrics interface
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
 * Connection statistics interface
 */
export interface ConnectionStats {
  total: number;
  active: number;
  idle: number;
  errors: number;
  avgResponseTime: number;
}

/**
 * Monitoring metrics interface
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
