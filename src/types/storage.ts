/**
 * Unified storage configuration and metrics types
 */

export interface UnifiedStorageConfig {
    /** Base directory for storage */
    baseDir: string;
    /** Session ID */
    sessionId: string;
    /** Maximum number of sessions */
    maxSessions?: number;
    /** Maximum number of task lists per session */
    maxTaskLists?: number;
    /** Maximum number of backups to keep */
    maxBackups?: number;
    /** Maximum retries for operations */
    maxRetries?: number;
    /** Retry delay in milliseconds */
    retryDelay?: number;
    /** Backup configuration */
    backup?: {
        /** Whether automatic backups are enabled */
        enabled: boolean;
        /** Backup interval in milliseconds */
        interval: number;
        /** Custom backup directory (defaults to baseDir/backups) */
        directory?: string;
    };
}

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
    };
    /** Session metrics */
    sessions: {
        /** Total number of sessions */
        total: number;
        /** Number of active sessions */
        active: number;
        /** Number of task lists */
        taskListCount: number;
    };
    /** Storage metrics */
    storage: {
        /** Total storage size in bytes */
        totalSize: number;
        /** WAL file size in bytes */
        walSize: number;
        /** Number of backups */
        backupCount: number;
        /** Last backup timestamp */
        lastBackup?: string;
        /** Database page size */
        pageSize: number;
        /** Number of database pages */
        pageCount: number;
    };
}

export interface StorageStatus {
    /** Whether storage is initialized */
    initialized: boolean;
    /** Whether storage is healthy */
    healthy: boolean;
    /** Current storage metrics */
    metrics: StorageMetrics;
    /** Connection status */
    connection: {
        /** Whether connection is active */
        active: boolean;
        /** Connection mode (e.g., 'wal') */
        mode: string;
        /** Number of active transactions */
        transactions: number;
    };
    /** Any error information */
    error?: {
        code: string;
        message: string;
        details?: unknown;
        timestamp: string;
    };
}

/**
 * @deprecated Use UnifiedStorageConfig instead
 */
export type StorageConfig = UnifiedStorageConfig;

/**
 * @deprecated Use UnifiedStorageConfig instead
 */
export type StorageManagerConfig = UnifiedStorageConfig;
