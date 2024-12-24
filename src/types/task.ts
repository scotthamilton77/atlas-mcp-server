/**
 * Task type definitions
 */

export enum TaskType {
    TASK = 'TASK',
    MILESTONE = 'MILESTONE',
    GROUP = 'GROUP'
}

export enum TaskStatus {
    PENDING = 'PENDING',
    IN_PROGRESS = 'IN_PROGRESS',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
    BLOCKED = 'BLOCKED'
}

export interface TaskMetadata {
    priority?: 'low' | 'medium' | 'high';
    tags?: string[];
    reasoning?: string;  // LLM's reasoning about task decisions
    toolsUsed?: string[];  // Tools used by LLM to accomplish task
    resourcesAccessed?: string[];  // Resources accessed by LLM
    contextUsed?: string[];  // Key context pieces used in decision making
    created: number;
    updated: number;
    projectPath: string;
    version: number;
    [key: string]: unknown;
}

export interface Task {
    path: string;  // Max depth of 8 levels
    name: string;  // Max 200 chars
    description?: string;  // Max 2000 chars
    type: TaskType;
    status: TaskStatus;
    parentPath?: string;
    notes?: string[];  // Each note max 1000 chars
    reasoning?: string;  // Max 2000 chars - LLM's reasoning about the task
    dependencies: string[];  // Max 50 dependencies
    subtasks: string[];  // Max 100 subtasks
    metadata: TaskMetadata;  // Each string field max 1000 chars, arrays max 100 items
}

export interface CreateTaskInput extends Record<string, unknown> {
    path?: string;
    name: string;
    parentPath?: string;
    description?: string;
    type?: TaskType;
    notes?: string[];
    reasoning?: string;
    dependencies?: string[];
    metadata?: Partial<TaskMetadata>;
}

export interface UpdateTaskInput extends Record<string, unknown> {
    name?: string;
    description?: string;
    type?: TaskType;
    status?: TaskStatus;
    parentPath?: string;
    notes?: string[];
    reasoning?: string;
    dependencies?: string[];
    metadata?: Partial<TaskMetadata>;
}

export interface TaskResponse<T> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
    };
    metadata: {
        timestamp: number;
        requestId: string;
        projectPath: string;
        affectedPaths: string[];
    };
}

// Field length constraints
export const CONSTRAINTS = {
    NAME_MAX_LENGTH: 200,
    DESCRIPTION_MAX_LENGTH: 2000,
    NOTE_MAX_LENGTH: 1000,
    REASONING_MAX_LENGTH: 2000,
    METADATA_STRING_MAX_LENGTH: 1000,
    MAX_DEPENDENCIES: 50,
    MAX_SUBTASKS: 100,
    MAX_NOTES: 100,
    MAX_ARRAY_ITEMS: 100,
    MAX_PATH_DEPTH: 8
} as const;

/**
 * Gets the task name from a path
 */
export function getTaskName(path: string): string {
    const segments = path.split('/');
    return segments[segments.length - 1];
}

/**
 * Gets the parent path from a task path
 */
export function getParentPath(path: string): string | undefined {
    const segments = path.split('/');
    return segments.length > 1 ? segments.slice(0, -1).join('/') : undefined;
}
