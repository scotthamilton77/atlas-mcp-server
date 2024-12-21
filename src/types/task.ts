/**
 * Task type definitions
 */

export enum TaskType {
    TASK = 'task',
    MILESTONE = 'milestone',
    GROUP = 'group'
}

export enum TaskStatus {
    PENDING = 'pending',
    IN_PROGRESS = 'in_progress',
    COMPLETED = 'completed',
    FAILED = 'failed',
    BLOCKED = 'blocked'
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

export interface CreateTaskInput {
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

export interface UpdateTaskInput {
    name?: string;
    description?: string;
    type?: TaskType;
    status?: TaskStatus;
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

/**
 * Validates a task path format and depth
 */
export function validateTaskPath(path: string): boolean {
    // Path must be non-empty and contain only allowed characters
    if (!path.match(/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/)) {
        return false;
    }
    
    // Check path depth (max 8 levels)
    if (path.split('/').length > 8) {
        return false;
    }

    return true;
}

/**
 * Validates parent-child task type relationships
 */
export function isValidTaskHierarchy(parentType: TaskType, childType: TaskType): boolean {
    switch (parentType) {
        case TaskType.MILESTONE:
            // Milestones can contain tasks and groups
            return childType === TaskType.TASK || childType === TaskType.GROUP;
        case TaskType.GROUP:
            // Groups can contain tasks
            return childType === TaskType.TASK;
        case TaskType.TASK:
            // Tasks cannot contain other tasks
            return false;
        default:
            return false;
    }
}

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
