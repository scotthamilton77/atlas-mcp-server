/**
 * Task indexing types
 */

import { Task, TaskStatus } from '../../../types/task.js';

/**
 * Task index structure
 */
export interface TaskIndex {
    byPath: Map<string, Task>;              // Primary index by task path
    byStatus: Map<TaskStatus, Set<string>>; // Tasks grouped by status
    byParent: Map<string, Set<string>>;     // Child tasks by parent path
    byProject: Map<string, Set<string>>;    // Tasks by project path
    byDependency: Map<string, Set<string>>; // Tasks by dependency paths
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
    indexTask(task: Task): Promise<void>;
    unindexTask(task: Task): Promise<void>;
    indexDependencies(task: Task): Promise<void>;
    unindexDependencies(task: Task): Promise<void>;
    getTaskByPath(path: string): Promise<Task | null>;
    getTasksByStatus(status: TaskStatus, projectPath: string): Promise<Task[]>;
    getTasksByParent(parentPath: string): Promise<Task[]>;
    getProjectTasks(projectPath: string): Promise<Task[]>;
    getProjectRootTasks(projectPath: string): Promise<Task[]>;
    getDependentTasks(taskPath: string): Promise<Task[]>;
    getAllTasks(): Promise<Task[]>;
    clear(): Promise<void>;
    getStats(): Promise<{
        totalTasks: number;
        statusCounts: Record<TaskStatus, number>;
        dependencyCount: number;
    }>;
}
