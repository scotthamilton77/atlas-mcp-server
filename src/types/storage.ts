/**
 * Path-based task storage types
 */
import { Task, TaskStatus } from './task.js';

/**
 * Storage configuration
 */
export interface StorageConfig {
    /** Base directory for storage */
    baseDir: string;
    /** Storage name */
    name: string;
    /** Connection settings */
    connection?: {
        /** Maximum retries for operations */
        maxRetries?: number;
        /** Retry delay in milliseconds */
        retryDelay?: number;
        /** Busy timeout in milliseconds */
        busyTimeout?: number;
    };
    /** Performance settings */
    performance?: {
        /** WAL mode checkpoint interval */
        checkpointInterval?: number;
        /** Cache size in pages */
        cacheSize?: number;
        /** Memory map size */
        mmapSize?: number;
        /** Page size */
        pageSize?: number;
        /** Maximum memory usage in bytes */
        maxMemory?: number;
        /** Maximum cache memory usage in bytes */
        maxCacheMemory?: number;
    };
}

/**
 * Storage interface for task operations
 */
/**
 * Cache management interface
 */
export interface CacheManager {
    clearCache(): Promise<void>;
    getCacheStats(): Promise<CacheStats>;
}

/**
 * Cache statistics
 */
export interface CacheStats {
    size: number;
    hitRate: number;
    memoryUsage: number;
}

/**
 * Storage interface for task operations with cache management
 */
export interface TaskStorage extends CacheManager {
    // Lifecycle
    initialize(): Promise<void>;
    close(): Promise<void>;
    
    // Transaction management
    beginTransaction(): Promise<void>;
    commitTransaction(): Promise<void>;
    rollbackTransaction(): Promise<void>;
    
    // Task operations
    saveTask(task: Task): Promise<void>;
    saveTasks(tasks: Task[]): Promise<void>;
    getTask(path: string): Promise<Task | null>;
    getTasks(paths: string[]): Promise<Task[]>;
    getTasksByPattern(pattern: string): Promise<Task[]>;
    getTasksByStatus(status: TaskStatus): Promise<Task[]>;
    getSubtasks(parentPath: string): Promise<Task[]>;
    deleteTask(path: string): Promise<void>;
    deleteTasks(paths: string[]): Promise<void>;
    
    // Maintenance
    vacuum(): Promise<void>;
    analyze(): Promise<void>;
    checkpoint(): Promise<void>;
    getMetrics(): Promise<StorageMetrics & {
        cache?: CacheStats;
        memory?: {
            heapUsed: number;
            heapTotal: number;
            rss: number;
        };
    }>;
    clearAllTasks(): Promise<void>;
    repairRelationships(dryRun?: boolean): Promise<{ fixed: number, issues: string[] }>;
}

/**
 * Storage metrics
 */
/**
 * Storage metrics with memory usage
 */
export interface StorageMetrics {
    /** Task metrics */
    tasks: {
        /** Total number of tasks */
        total: number;
        /** Tasks by status */
        byStatus: Record<string, number>;
        /** Number of task notes */
        noteCount: number;
        /** Number of task dependencies */
        dependencyCount: number;
        /** Path depth metrics */
        pathMetrics?: {
            /** Average path depth */
            averageDepth: number;
            /** Maximum path depth */
            maxDepth: number;
            /** Tasks by depth level */
            byDepth: Record<number, number>;
        };
    };
    /** Storage metrics */
    storage: {
        /** Total storage size in bytes */
        totalSize: number;
        /** WAL file size in bytes */
        walSize: number;
        /** Database page size */
        pageSize: number;
        /** Number of database pages */
        pageCount: number;
        /** Cache metrics */
        cache?: {
            /** Cache hit rate */
            hitRate: number;
            /** Cache memory usage */
            memoryUsage: number;
            /** Cache entry count */
            entryCount: number;
        };
    };
}

/**
 * Storage error types
 */
export enum StorageErrorType {
    INITIALIZATION = 'STORAGE_INIT',
    CONNECTION = 'CONNECTION',
    QUERY = 'QUERY',
    TRANSACTION = 'TRANSACTION',
    CONSTRAINT = 'CONSTRAINT',
    MAINTENANCE = 'MAINTENANCE',
    IO = 'IO'
}

/**
 * Storage error class
 */
export class StorageError extends Error {
    constructor(
        public readonly type: StorageErrorType,
        message: string,
        public readonly cause?: unknown
    ) {
        super(message);
        this.name = 'StorageError';
    }

    /**
     * Creates a storage error with appropriate type based on the error
     */
    static from(error: unknown, operation: string): StorageError {
        if (error instanceof StorageError) {
            return error;
        }

        const message = error instanceof Error ? error.message : String(error);

        // Determine error type from message/operation
        if (message.includes('SQLITE_BUSY') || message.includes('SQLITE_LOCKED')) {
            return new StorageError(
                StorageErrorType.CONNECTION,
                `Database busy during ${operation}: ${message}`,
                error
            );
        }

        if (message.includes('SQLITE_CONSTRAINT')) {
            return new StorageError(
                StorageErrorType.CONSTRAINT,
                `Constraint violation during ${operation}: ${message}`,
                error
            );
        }

        if (message.includes('SQLITE_IOERR')) {
            return new StorageError(
                StorageErrorType.IO,
                `I/O error during ${operation}: ${message}`,
                error
            );
        }

        return new StorageError(
            StorageErrorType.QUERY,
            `Error during ${operation}: ${message}`,
            error
        );
    }
}

/**
 * Storage transaction interface
 */
export interface Transaction {
    execute<T>(operation: () => Promise<T>): Promise<T>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
}

/**
 * Storage transaction options
 */
export interface TransactionOptions {
    /** Maximum retries for the transaction */
    maxRetries?: number;
    /** Delay between retries in milliseconds */
    retryDelay?: number;
    /** Transaction timeout in milliseconds */
    timeout?: number;
}
