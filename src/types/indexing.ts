/**
 * Task indexing type definitions
 */

import { Task, TaskStatus } from './task.js';

/**
 * Task index structure
 */
export interface TaskIndex extends Task {
    path: string;
    status: TaskStatus;
    parentPath?: string;
    dependencies: string[];
    subtasks: string[];
}

/**
 * Index manager configuration
 */
export interface IndexConfig {
    batchSize: number;
    parallelOperations: boolean;
}

/**
 * Index operation result
 */
export interface IndexOperationResult {
    success: boolean;
    error?: Error;
}

/**
 * Index manager interface
 */
export interface IndexManager {
    /**
     * Indexes a task and its dependencies
     */
    indexTask(task: Task): Promise<void>;

    /**
     * Removes a task from all indexes
     */
    unindexTask(task: Task): Promise<void>;

    /**
     * Gets a task by its exact path
     */
    getTaskByPath(path: string): Promise<TaskIndex | null>;

    /**
     * Gets tasks by path pattern (supports * and ** wildcards)
     */
    getTasksByPattern(pattern: string): Promise<TaskIndex[]>;

    /**
     * Gets tasks by status with optional pattern filtering
     */
    getTasksByStatus(status: TaskStatus, pattern?: string): Promise<TaskIndex[]>;

    /**
     * Gets tasks by parent path
     */
    getTasksByParent(parentPath: string): Promise<TaskIndex[]>;

    /**
     * Gets tasks that depend on a task
     */
    getDependentTasks(path: string): Promise<TaskIndex[]>;

    /**
     * Gets project tasks by pattern
     */
    getProjectTasks(pattern: string): Promise<TaskIndex[]>;

    /**
     * Clears all indexes
     */
    clear(): void;

    /**
     * Gets index statistics
     */
    getStats(): IndexStats;
}

/**
 * Index statistics
 */
export interface IndexStats {
    totalTasks: number;
    byStatus: Record<TaskStatus, number>;
    byDepth: Record<number, number>;
    averageDepth: number;
}
