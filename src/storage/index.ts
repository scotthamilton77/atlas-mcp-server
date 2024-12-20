/**
 * Storage module for Atlas MCP Server
 * Handles unified task and session persistence
 */
import { Task } from '../types/task.js';
import { StorageMetrics } from '../types/storage.js';
import { UnifiedStorageError } from './unified-storage.js';

// Re-export unified storage types and implementations
export { UnifiedStorageManager, UnifiedStorageConfig, BaseUnifiedStorage } from './unified-storage.js';
export { UnifiedSqliteStorage } from './unified-sqlite-storage.js';
export { ConnectionManager } from './connection-manager.js';

// Export factory functions
export { createStorageManager, createDefaultStorageManager } from './factory.js';

/**
 * @deprecated Use UnifiedStorageError instead
 */
export class StorageError extends UnifiedStorageError {
    constructor(
        message: string,
        code: string,
        details?: unknown
    ) {
        super(message, code, details);
        console.warn('StorageError is deprecated. Use UnifiedStorageError instead.');
    }
}

/**
 * @deprecated Use UnifiedStorageManager instead
 */
export interface StorageManager {
    initialize(): Promise<void>;
    saveTasks(tasks: Task[]): Promise<void>;
    loadTasks(): Promise<Task[]>;
    getTasksByStatus(status: string): Promise<Task[]>;
    getSubtasks(parentId: string): Promise<Task[]>;
    close(): Promise<void>;
    maintenance(): Promise<void>;
    estimate?(): Promise<StorageMetrics>;
    getDirectory?(): Promise<string>;
    persist?(): Promise<boolean>;
    persisted?(): Promise<boolean>;
}

/**
 * @deprecated Use UnifiedStorageConfig instead
 */
export type StorageConfig = import('./unified-storage.js').UnifiedStorageConfig;

/**
 * @deprecated Use UnifiedSqliteStorage instead
 */
export { UnifiedSqliteStorage as SqliteStorageManager } from './unified-sqlite-storage.js';

/**
 * @deprecated Use UnifiedSqliteStorage instead
 */
export { UnifiedSqliteStorage as BaseStorageManager } from './unified-sqlite-storage.js';
