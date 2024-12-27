export enum TaskType {
    TASK = 'TASK',
    /** @deprecated Use TASK or MILESTONE instead. GROUP type is maintained only for backward compatibility */
    GROUP = 'GROUP',
    MILESTONE = 'MILESTONE'
}

export enum TaskStatus {
    PENDING = 'PENDING',
    IN_PROGRESS = 'IN_PROGRESS',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
    BLOCKED = 'BLOCKED'
}

export interface Task {
    path: string;
    name: string;
    type: TaskType;
    status: TaskStatus;
    projectPath: string;
    created: number;
    updated: number;
    version: number;
    metadata: Record<string, unknown>;
    dependencies: string[];
    subtasks: string[];
    description?: string;
    parentPath?: string;
    notes?: string[];
    reasoning?: string;
}

export interface CreateTaskInput {
    name: string;
    type?: TaskType;
    path: string;
    parentPath?: string;
    dependencies?: string[];
    metadata?: Record<string, unknown>;
    description?: string;
    notes?: string[];
    reasoning?: string;
}

export interface UpdateTaskInput {
    name?: string;
    status?: TaskStatus;
    dependencies?: string[];
    metadata?: Record<string, unknown>;
    description?: string;
    notes?: string[];
    reasoning?: string;
    type?: TaskType;
}

export const CONSTRAINTS = {
    NAME_MAX_LENGTH: 255,
    DESCRIPTION_MAX_LENGTH: 1000,
    PATH_MAX_LENGTH: 255,
    MAX_DEPENDENCIES: 100,
    MAX_NOTES: 1000,
    MAX_REASONING_LENGTH: 1000,
    NOTE_MAX_LENGTH: 1000,
    REASONING_MAX_LENGTH: 1000,
    MAX_PATH_DEPTH: 10,
    MAX_SUBTASKS: 100,
    MAX_ARRAY_ITEMS: 100,
    METADATA_STRING_MAX_LENGTH: 1000
};

export interface ValidationResult {
    success: boolean;
    errors: string[];
}

export interface TaskResponseMetadata {
    timestamp: number;
    requestId: string;
    projectPath: string;
    affectedPaths: string[];
    operationCount?: number;
    successCount?: number;
}

export interface TaskResponse<T> {
    success: boolean;
    data: T;
    metadata: TaskResponseMetadata;
}

/**
 * Gets the parent path from a task path
 * @param path Task path (e.g., "project/feature/task")
 * @returns Parent path or undefined if no parent exists
 */
export function getParentPath(path: string): string | undefined {
    const parts = path.split('/');
    return parts.length > 1 ? parts.slice(0, -1).join('/') : undefined;
}
