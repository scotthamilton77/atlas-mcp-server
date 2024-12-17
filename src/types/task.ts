/**
 * Task-related type definitions
 */

/**
 * Task type enumeration
 * @description Defines the different types of tasks that can be created
 */
export const TaskTypes = {
    TASK: 'task',
    MILESTONE: 'milestone',
    GROUP: 'group'
} as const;

export type TaskType = typeof TaskTypes[keyof typeof TaskTypes];

/**
 * Task status enumeration
 * @description Defines the possible states a task can be in
 */
export const TaskStatuses = {
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    FAILED: 'failed',
    BLOCKED: 'blocked'
} as const;

export type TaskStatus = typeof TaskStatuses[keyof typeof TaskStatuses];

/**
 * Note type enumeration
 * @description Defines the types of notes that can be attached to a task
 */
export const NoteTypes = {
    TEXT: 'text',
    CODE: 'code',
    JSON: 'json',
    MARKDOWN: 'markdown'
} as const;

export type NoteType = typeof NoteTypes[keyof typeof NoteTypes];

/**
 * Task note interface
 * @description Represents a note attached to a task
 */
export interface TaskNote {
    /** Type of the note content */
    type: NoteType;
    /** The actual note content */
    content: string;
    /** Programming language (required for code notes) */
    language?: string;
    /** Additional metadata for the note */
    metadata?: Record<string, unknown>;
}

/**
 * Task reasoning interface
 * @description Documents the decision-making process for a task
 */
export interface TaskReasoning {
    /** High-level approach and strategy */
    approach?: string;
    /** Key assumptions made when planning */
    assumptions?: string[];
    /** Alternative approaches considered */
    alternatives?: string[];
    /** Potential risks and challenges */
    risks?: string[];
    /** Key tradeoffs and decisions made */
    tradeoffs?: string[];
    /** Technical or business constraints */
    constraints?: string[];
    /** Reasoning behind task dependencies */
    dependencies_rationale?: string[];
    /** Analysis of task impact on system/project */
    impact_analysis?: string[];
    /** Additional reasoning fields */
    [key: string]: unknown;
}

/**
 * Task metadata interface
 * @description Contains metadata about a task
 */
export interface TaskMetadata {
    /** Creation timestamp */
    created: string;
    /** Last update timestamp */
    updated: string;
    /** Session identifier */
    sessionId: string;
    /** Additional context about the task */
    context?: string;
    /** Categorization tags */
    tags?: string[];
    /** Additional metadata fields */
    [key: string]: unknown;
}

/**
 * Task interface
 * @description Represents a task in the system
 */
export interface Task {
    /** Unique identifier */
    id: string;
    /** Task name */
    name: string;
    /** Detailed description */
    description?: string;
    /** Associated notes */
    notes?: TaskNote[];
    /** Decision-making documentation */
    reasoning?: TaskReasoning;
    /** Task type */
    type: TaskType;
    /** Current status */
    status: TaskStatus;
    /** Task dependencies (IDs of tasks this task depends on) */
    dependencies: string[];
    /** Child task IDs */
    subtasks: string[];
    /** Task metadata */
    metadata: TaskMetadata;
    /** Parent task ID */
    parentId: string;
    /** Error information if applicable */
    error?: {
        code: string;
        message: string;
        details?: unknown;
    };
}

/**
 * Task creation input interface
 * @description Input for creating a new task
 */
export interface CreateTaskInput {
    /** Task name */
    name: string;
    /** Parent task ID */
    parentId?: string | null;
    /** Detailed description */
    description?: string;
    /** Associated notes */
    notes?: TaskNote[];
    /** Decision-making documentation */
    reasoning?: TaskReasoning;
    /** Task type */
    type?: TaskType;
    /** Task dependencies */
    dependencies?: string[];
    /** Task metadata */
    metadata?: {
        /** Additional context */
        context?: string;
        /** Categorization tags */
        tags?: string[];
        /** Additional metadata fields */
        [key: string]: unknown;
    };
    /** Child tasks */
    subtasks?: CreateTaskInput[];
}

/**
 * Bulk task creation input interface
 * @description Input for creating multiple tasks at once
 */
export interface BulkCreateTaskInput {
    /** Parent task ID */
    parentId: string | null;
    /** Tasks to create */
    tasks: CreateTaskInput[];
}

/**
 * Task update input interface
 * @description Input for updating an existing task
 */
export interface UpdateTaskInput {
    /** New task name */
    name?: string;
    /** New description */
    description?: string;
    /** Updated notes */
    notes?: TaskNote[];
    /** Updated reasoning */
    reasoning?: TaskReasoning;
    /** New task type */
    type?: TaskType;
    /** New status */
    status?: TaskStatus;
    /** Updated dependencies */
    dependencies?: string[];
    /** Updated metadata */
    metadata?: {
        /** Additional context */
        context?: string;
        /** Categorization tags */
        tags?: string[];
        /** Additional metadata fields */
        [key: string]: unknown;
    };
}

/**
 * Bulk task update input interface
 * @description Input for updating multiple tasks at once
 */
export interface BulkUpdateTasksInput {
    /** Updates to apply */
    updates: {
        /** Task ID to update */
        taskId: string;
        /** Updates to apply */
        updates: UpdateTaskInput;
    }[];
}

/**
 * Task response interface
 * @description Generic response type for task operations
 */
export interface TaskResponse<T> {
    /** Operation success status */
    success: boolean;
    /** Response data */
    data?: T;
    /** Error information if applicable */
    error?: {
        /** Error code */
        code: string;
        /** Error message */
        message: string;
        /** Additional error details */
        details?: unknown;
    };
    /** Response metadata */
    metadata?: {
        /** Operation timestamp */
        timestamp: string;
        /** Request identifier */
        requestId: string;
        /** Session identifier */
        sessionId: string;
        /** Tasks affected by the operation */
        affectedTasks?: string[];
    };
}
