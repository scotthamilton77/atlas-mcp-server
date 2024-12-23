import { Task } from './task.js';
import { CreateTaskInput, UpdateTaskInput } from './task.js';

export interface StorageConfig {
  baseDir: string;
  name: string;
  connection?: {
    maxRetries?: number;
    retryDelay?: number;
    busyTimeout?: number;
  };
  performance?: {
    checkpointInterval?: number;
    cacheSize?: number;
    mmapSize?: number;
    pageSize?: number;
    maxMemory?: number;
    maxCacheMemory?: number;
  };
}

export interface TaskStorage {
  // Task Operations
  createTask(input: CreateTaskInput): Promise<Task>;
  updateTask(path: string, updates: UpdateTaskInput): Promise<Task>;
  deleteTask(path: string): Promise<void>;
  getTask(path: string): Promise<Task | null>;
  hasChildren(path: string): Promise<boolean>;
  getDependentTasks(path: string): Promise<Task[]>;
  getTasksByPattern(pattern: string): Promise<Task[]>;
  getTasksByStatus(status: string): Promise<Task[]>;
  getSubtasks(parentPath: string): Promise<Task[]>;
  clearAllTasks(): Promise<void>;
  saveTask(task: Task): Promise<void>;
  saveTasks(tasks: Task[]): Promise<void>;
  getTasks(paths: string[]): Promise<Task[]>;
  deleteTasks(paths: string[]): Promise<void>;

  // Transaction Management
  beginTransaction(): Promise<void>;
  commitTransaction(): Promise<void>;
  rollbackTransaction(): Promise<void>;

  // Database Maintenance
  vacuum(): Promise<void>;
  analyze(): Promise<void>;
  checkpoint(): Promise<void>;
  repairRelationships(dryRun?: boolean): Promise<{
    fixed: number;
    issues: string[];
  }>;

  // Cache Management
  clearCache?(): Promise<void>;

  // Metrics
  getMetrics(): Promise<StorageMetrics>;

  // Lifecycle
  close(): Promise<void>;
}

export interface StorageMetrics {
  tasks: {
    total: number;
    byStatus: Record<string, number>;
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
  cache?: CacheStats;
  memory?: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
  };
  lastVacuum?: number;
  lastAnalyze?: number;
  lastCheckpoint?: number;
}

export enum StorageErrorType {
  CONNECTION = 'connection_error',
  INITIALIZATION = 'initialization_error',
  STORAGE_ERROR = 'storage_error',
  STORAGE_READ = 'storage_read_error',
  STORAGE_WRITE = 'storage_write_error',
  STORAGE_DELETE = 'storage_delete_error',
  STORAGE_INIT = 'storage_init_error',
  TRANSACTION = 'transaction_error'
}

export class StorageError extends Error {
  readonly code: string;
  readonly operation: string;
  readonly path?: string;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    operation: string,
    path?: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'StorageError';
    this.code = code;
    this.operation = operation;
    this.path = path;
    this.details = details;
  }
}

export interface TransactionOptions {
  timeout?: number;
  retries?: number;
  isolation?: 'deferred' | 'immediate' | 'exclusive';
}

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
  memoryUsage: number;
  lastCleanup?: number;
}

export interface StorageEvents {
  onError?: (error: StorageError) => void;
  onWarning?: (warning: string, details?: Record<string, unknown>) => void;
  onMetrics?: (metrics: StorageMetrics) => void;
}
