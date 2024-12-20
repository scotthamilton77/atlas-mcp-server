/**
 * Unified storage interface combining task and session storage
 */
import { Task } from '../types/task.js';
import { Session, TaskList } from '../types/session.js';
import { StorageMetrics } from '../types/storage.js';
import { SessionStorage } from '../types/session.js';

export interface UnifiedStorageManager extends SessionStorage {
    // Task storage methods
    saveTasks(tasks: Task[]): Promise<void>;
    loadTasks(): Promise<Task[]>;
    getTasksByStatus(status: string): Promise<Task[]>;
    getSubtasks(parentId: string): Promise<Task[]>;

    // Common operations
    initialize(): Promise<void>;
    close(): Promise<void>;
    maintenance(): Promise<void>;
    estimate(): Promise<StorageMetrics>;
    getDirectory?(): Promise<string>;
    persist?(): Promise<boolean>;
    persisted?(): Promise<boolean>;
}

export interface UnifiedStorageConfig {
    baseDir: string;
    sessionId: string;
    maxRetries?: number;
    retryDelay?: number;
    maxBackups?: number;
    useSqlite?: boolean;
}

/**
 * Abstract base class for unified storage implementations
 */
export abstract class BaseUnifiedStorage implements UnifiedStorageManager {
    // Task storage methods
    abstract saveTasks(tasks: Task[]): Promise<void>;
    abstract loadTasks(): Promise<Task[]>;
    abstract getTasksByStatus(status: string): Promise<Task[]>;
    abstract getSubtasks(parentId: string): Promise<Task[]>;

    // Session storage methods
    abstract saveSession(session: Session): Promise<void>;
    abstract loadSession(sessionId: string): Promise<Session>;
    abstract loadAllSessions(): Promise<Session[]>;
    abstract deleteSession(sessionId: string): Promise<void>;
    abstract saveTaskList(taskList: TaskList): Promise<void>;
    abstract loadTaskList(taskListId: string): Promise<TaskList>;
    abstract loadAllTaskLists(): Promise<TaskList[]>;
    abstract deleteTaskList(taskListId: string): Promise<void>;
    abstract saveActiveState(state: { activeSessionId?: string; activeTaskListId?: string }): Promise<void>;
    abstract loadActiveState(): Promise<{ activeSessionId?: string; activeTaskListId?: string }>;

    // Common operations
    abstract initialize(): Promise<void>;
    abstract close(): Promise<void>;
    abstract maintenance(): Promise<void>;
    abstract estimate(): Promise<StorageMetrics>;
    abstract getDirectory?(): Promise<string>;
    abstract persist?(): Promise<boolean>;
    abstract persisted?(): Promise<boolean>;
}

/**
 * Error class for unified storage operations
 */
export class UnifiedStorageError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly details?: unknown
    ) {
        super(message);
        this.name = 'UnifiedStorageError';
    }
}
