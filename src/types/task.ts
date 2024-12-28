/**
 * Task type definitions
 */
export enum TaskType {
    TASK = 'TASK',
    MILESTONE = 'MILESTONE'
}

export enum TaskStatus {
    PENDING = 'PENDING',
    IN_PROGRESS = 'IN_PROGRESS',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
    BLOCKED = 'BLOCKED'
}

/**
 * Task metadata type with required properties
 */
export type TaskMetadata = Record<string, any> & {
    [key: string]: any;
};

export interface Task {
    // Core fields
    path: string;
    name: string;
    type: TaskType;
    status: TaskStatus;
    // Timestamps stored as formatted strings (e.g. "10:00:00 AM 1/28/2024")
    created: string;
    updated: string;
    version: number;
    projectPath: string;

    // Optional fields
    description?: string;
    parentPath?: string;
    notes: string[];  // Required array, can be empty but not undefined
    reasoning?: string;
    dependencies: string[];  // Required array, can be empty but not undefined
    
    // Required fields with explicit initialization
    subtasks: string[];  // Required array, can be empty but not undefined
    metadata: TaskMetadata;
}

export interface CreateTaskInput {
    path: string;
    name: string;
    type: TaskType;
    description?: string;
    parentPath?: string;
    notes?: string[];  // Optional, will be initialized to empty array if undefined
    reasoning?: string;
    dependencies?: string[];  // Optional, will be initialized to empty array if undefined
    metadata?: TaskMetadata;
}

export interface UpdateTaskInput {
    name?: string;
    description?: string;
    type?: TaskType;
    status?: TaskStatus;
    parentPath?: string | null;  // Can be null to clear the parent
    notes?: string[];  // Optional, will keep existing if undefined
    reasoning?: string;
    dependencies?: string[];  // Optional, will keep existing if undefined
    subtasks?: string[];  // Optional, will keep existing if undefined
    metadata?: TaskMetadata;
}

export interface TaskMetrics {
    total: number;
    byStatus: Record<TaskStatus, number>;
    noteCount: number;
    dependencyCount: number;
}

export interface TaskValidationError {
    code: string;
    message: string;
    field?: string;
    details?: any;
}

export interface TaskOperationResult {
    success: boolean;
    task?: Task;
    errors?: TaskValidationError[];
}

export interface BulkOperationResult {
    success: boolean;
    results: TaskOperationResult[];
    errors?: TaskValidationError[];
}

export interface TaskResponseMetadata {
    timestamp: number;
    requestId: string;
    projectPath: string;
    affectedPaths: string[];
    pagination?: {
        limit: number;
        offset: number;
    };
    operationCount?: number;
    successCount?: number;
}

export interface TaskResponse<T = Task> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
    };
    metadata: TaskResponseMetadata;
}

export const CONSTRAINTS = {
    // Path constraints
    PATH_MAX_LENGTH: 255,
    MAX_PATH_DEPTH: 10,
    
    // Field length constraints
    NAME_MAX_LENGTH: 100,
    DESCRIPTION_MAX_LENGTH: 1000,
    REASONING_MAX_LENGTH: 1000,
    NOTE_MAX_LENGTH: 2000,
    METADATA_STRING_MAX_LENGTH: 1000,
    
    // Array size constraints
    MAX_DEPENDENCIES: 50,
    MAX_SUBTASKS: 100,
    MAX_NOTES: 100,
    MAX_ARRAY_ITEMS: 100,
    
    // Size constraints
    MAX_METADATA_SIZE: 32768 // 32KB
} as const;
