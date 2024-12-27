import { Task, CreateTaskInput, UpdateTaskInput, TaskStatus } from '../../types/task.js';

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
    getSubtasks(parentPath: string): Promise<Task[]>;
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
    repairRelationships(dryRun?: boolean): Promise<{ fixed: number, issues: string[] }>;
    clearCache(): Promise<void>;
    verifyIntegrity(): Promise<boolean>;

    // Metrics and stats
    getStats(): Promise<{
        size: number;
        walSize: number;
        pageCount: number;
        pageSize: number;
        journalMode: string;
    }>;
    getMetrics(): Promise<{
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
    }>;
}

/**
 * Storage provider interface for dependency injection
 */
export interface StorageProvider {
    getStorage(): Promise<TaskStorage>;
}
