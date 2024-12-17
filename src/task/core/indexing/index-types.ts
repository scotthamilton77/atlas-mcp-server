import { Task, TaskStatus } from '../../../types/task.js';

export interface TaskIndex {
    byId: Map<string, Task>;
    byStatus: Map<TaskStatus, Set<string>>;
    byParent: Map<string, Set<string>>;
    bySession: Map<string, Set<string>>;
    byDependency: Map<string, Set<string>>;
}

export interface IndexOperationResult {
    success: boolean;
    error?: Error;
    affectedIndexes: string[];
}

export interface IndexManager {
    indexTask(task: Task): void;
    unindexTask(task: Task): void;
    indexDependencies(task: Task): Promise<void>;
    unindexDependencies(task: Task): Promise<void>;
    getTaskById(taskId: string): Task | null;
    getTasksByStatus(status: TaskStatus): Task[];
    getTasksByParent(parentId: string): Task[];
    getTasksBySession(sessionId: string): Task[];
    getDependentTasks(taskId: string): Task[];
    getRootTasks(): Task[];
    getAllTasks(): Task[];
    clear(): void;
}

export interface IndexConfig {
    batchSize: number;
    parallelOperations: boolean;
}
