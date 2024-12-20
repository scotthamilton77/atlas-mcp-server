/**
 * Session and Task List Types
 */

/**
 * Session metadata
 */
export interface SessionMetadata {
    /** Creation timestamp */
    created: number;
    /** Last update timestamp */
    updated: number;
    /** Session tags */
    tags?: string[];
    /** Additional context */
    context?: string;
    /** Whether the session is archived */
    archived?: boolean;
}

/**
 * Session storage interface
 */
export interface SessionStorage {
    /** Initialize storage */
    initialize(): Promise<void>;
    /** Save session */
    saveSession(session: Session): Promise<void>;
    /** Load session by ID */
    loadSession(sessionId: string): Promise<Session>;
    /** Load all sessions */
    loadAllSessions(): Promise<Session[]>;
    /** Delete session */
    deleteSession(sessionId: string): Promise<void>;
    /** Save task list */
    saveTaskList(taskList: TaskList): Promise<void>;
    /** Load task list by ID */
    loadTaskList(taskListId: string): Promise<TaskList>;
    /** Load all task lists */
    loadAllTaskLists(): Promise<TaskList[]>;
    /** Delete task list */
    deleteTaskList(taskListId: string): Promise<void>;
    /** Save active state */
    saveActiveState(state: {
        activeSessionId?: string;
        activeTaskListId?: string;
    }): Promise<void>;
    /** Load active state */
    loadActiveState(): Promise<{
        activeSessionId?: string;
        activeTaskListId?: string;
    }>;
    /** Close storage */
    close(): Promise<void>;
}

/**
 * Session manager interface
 */
export interface SessionManager {
    /** Initialize manager */
    initialize(): Promise<void>;
    /** Create new session */
    createSession(input: CreateSessionInput): Promise<Session>;
    /** Get session by ID */
    getSession(sessionId: string): Promise<Session>;
    /** List all sessions */
    listSessions(includeArchived?: boolean): Promise<Session[]>;
    /** Archive session */
    archiveSession(sessionId: string): Promise<void>;
    /** Create task list */
    createTaskList(input: CreateTaskListInput): Promise<TaskList>;
    /** Get task list by ID */
    getTaskList(taskListId: string): Promise<TaskList>;
    /** List all task lists */
    listTaskLists(includeArchived?: boolean): Promise<TaskList[]>;
    /** Archive task list */
    archiveTaskList(taskListId: string): Promise<void>;
    /** Switch active session */
    switchSession(sessionId: string): Promise<void>;
    /** Switch active task list */
    switchTaskList(taskListId: string): Promise<void>;
    /** Get active session */
    getActiveSession(): Promise<Session | null>;
    /** Get active task list */
    getActiveTaskList(): Promise<TaskList | null>;
}

/**
 * Session entity
 */
export interface Session {
    /** Unique session ID */
    id: string;
    /** Session name */
    name: string;
    /** Session metadata */
    metadata: SessionMetadata;
    /** Active task list ID */
    activeTaskListId?: string;
    /** Task list IDs in this session */
    taskListIds: string[];
}

/**
 * Task list metadata
 */
export interface TaskListMetadata {
    /** Creation timestamp */
    created: number;
    /** Last update timestamp */
    updated: number;
    /** Task list tags */
    tags?: string[];
    /** Additional context */
    context?: string;
    /** Whether the task list is archived */
    archived?: boolean;
    /** Whether the task list persists across sessions */
    persistent?: boolean;
}

/**
 * Task list entity
 */
export interface TaskList {
    /** Unique task list ID */
    id: string;
    /** Task list name */
    name: string;
    /** Task list description */
    description?: string;
    /** Task list metadata */
    metadata: TaskListMetadata;
    /** Root task IDs */
    rootTaskIds: string[];
}

/**
 * Session creation input
 */
export interface CreateSessionInput {
    /** Session name */
    name: string;
    /** Session metadata */
    metadata?: {
        /** Session tags */
        tags?: string[];
        /** Additional context */
        context?: string;
    };
}

/**
 * Task list creation input
 */
export interface CreateTaskListInput {
    /** Task list name */
    name: string;
    /** Task list description */
    description?: string;
    /** Task list metadata */
    metadata?: {
        /** Task list tags */
        tags?: string[];
        /** Additional context */
        context?: string;
    };
    /** Whether the task list should persist across sessions */
    persistent?: boolean;
}

/**
 * Session response wrapper
 */
export interface SessionResponse {
    /** Response data */
    data: Session;
    /** Response metadata */
    metadata: {
        /** Operation timestamp */
        timestamp: number;
        /** Operation type */
        operation: 'create' | 'update' | 'delete';
    };
}

/**
 * Task list response wrapper
 */
export interface TaskListResponse {
    /** Response data */
    data: TaskList;
    /** Response metadata */
    metadata: {
        /** Operation timestamp */
        timestamp: number;
        /** Operation type */
        operation: 'create' | 'update' | 'delete';
    };
}

/**
 * Session error codes
 */
export enum SessionErrorCode {
    /** Session not found */
    SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
    /** Session validation failed */
    SESSION_VALIDATION = 'SESSION_VALIDATION',
    /** Session already exists */
    SESSION_EXISTS = 'SESSION_EXISTS',
    /** Session limit exceeded */
    SESSION_LIMIT = 'SESSION_LIMIT',
    /** Invalid session operation */
    SESSION_INVALID_OP = 'SESSION_INVALID_OP'
}

/**
 * Task list error codes
 */
export enum TaskListErrorCode {
    /** Task list not found */
    TASK_LIST_NOT_FOUND = 'TASK_LIST_NOT_FOUND',
    /** Task list validation failed */
    TASK_LIST_VALIDATION = 'TASK_LIST_VALIDATION',
    /** Task list already exists */
    TASK_LIST_EXISTS = 'TASK_LIST_EXISTS',
    /** Task list limit exceeded */
    TASK_LIST_LIMIT = 'TASK_LIST_LIMIT',
    /** Invalid task list operation */
    TASK_LIST_INVALID_OP = 'TASK_LIST_INVALID_OP'
}
