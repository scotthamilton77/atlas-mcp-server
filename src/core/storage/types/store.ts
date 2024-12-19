import { Task } from '../../../shared/types/task.js';
import { StorageResult } from './results.js';

/**
 * Storage engine interface
 */
export interface StorageEngine {
    /**
     * Create task
     */
    create(task: Task): Promise<StorageResult<Task>>;

    /**
     * Update task
     */
    update(task: Task): Promise<StorageResult<Task>>;

    /**
     * Delete task
     */
    delete(task: Task): Promise<StorageResult<void>>;

    /**
     * Get task by ID
     */
    get(id: string): Promise<StorageResult<Task>>;

    /**
     * Get all tasks
     */
    getAll(): Promise<StorageResult<Task[]>>;

    /**
     * Get tasks by parent ID
     */
    getByParentId(parentId: string): Promise<StorageResult<Task[]>>;

    /**
     * Get tasks by status
     */
    getByStatus(status: string): Promise<StorageResult<Task[]>>;

    /**
     * Clear all tasks
     */
    clear(): Promise<StorageResult<void>>;
}
