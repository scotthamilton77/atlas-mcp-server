import { Task, TaskStatus } from '../../../types/task.js';

export interface TaskIndex {
    byId: Map<string, Task>;
    byStatus: Map<TaskStatus, Set<string>>;
    byParent: Map<string | null, Set<string>>;
    bySession: Map<string, Set<string>>;
    byTaskList: Map<string, Set<string>>;
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
    getTasksByStatus(status: TaskStatus, sessionId?: string, taskListId?: string): Task[];
    getTasksByParent(parentId: string, sessionId?: string, taskListId?: string): Task[];
    getTasksBySession(sessionId: string, taskListId?: string): Task[];
    getTasksByTaskList(taskListId: string): Task[];
    getDependentTasks(taskId: string): Task[];
    getRootTasks(sessionId?: string, taskListId?: string): Task[];
    getAllTasks(sessionId?: string, taskListId?: string): Task[];
    clear(): void;
}

export interface IndexConfig {
    batchSize: number;
    parallelOperations: boolean;
}
