/**
 * Storage types and interfaces
 */
import { Task, TaskStatus, CreateTaskInput, UpdateTaskInput } from './task.js';
import { MonitoringConfig } from '../storage/monitoring/index.js';

export interface StorageConfig {
  baseDir: string;
  name: string;
  connection?: {
    maxConnections?: number;
    idleTimeout?: number;
    busyTimeout?: number;
  };
  performance?: {
    cacheSize?: number;
    pageSize?: number;
    mmapSize?: number;
    maxMemory?: number;
  };
  monitoring?: MonitoringConfig;
}

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

export interface TaskStorage {
  initialize(): Promise<void>;
  close(): Promise<void>;

  // Transaction management
  beginTransaction(): Promise<void>;
  commitTransaction(): Promise<void>;
  rollbackTransaction(): Promise<void>;

  // Task operations
  createTask(input: CreateTaskInput): Promise<Task>;
  updateTask(path: string, updates: UpdateTaskInput): Promise<Task>;
  deleteTask(path: string): Promise<void>;
  getTask(path: string): Promise<Task | null>;
  getTasks(paths: string[]): Promise<Task[]>;
  getTasksByPattern(pattern: string): Promise<Task[]>;
  getTasksByStatus(status: string): Promise<Task[]>;
  getSubtasks(parentPath: string): Promise<Task[]>;
  hasChildren(path: string): Promise<boolean>;
  getDependentTasks(path: string): Promise<Task[]>;
  saveTasks(tasks: Task[]): Promise<void>;
  saveTask(task: Task): Promise<void>;
  deleteTasks(paths: string[]): Promise<void>;
  clearAllTasks(): Promise<void>;

  // Maintenance operations
  vacuum(): Promise<void>;
  analyze(): Promise<void>;
  checkpoint(): Promise<void>;
  clearCache(): Promise<void>;
  getMetrics(): Promise<StorageMetrics>;
  repairRelationships(dryRun?: boolean): Promise<{ fixed: number; issues: string[] }>;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
  memoryUsage: number;
}

export interface ConnectionStats {
  total: number;
  active: number;
  idle: number;
  errors: number;
  avgResponseTime: number;
}

export interface QueryStats {
  total: number;
  errors: number;
  avgExecutionTime: number;
  slowQueries: number;
}

export interface MonitoringMetrics {
  cache: CacheStats;
  connections: ConnectionStats;
  queries: QueryStats;
  timestamp: number;
}
