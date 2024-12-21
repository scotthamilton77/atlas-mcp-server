/**
 * Task type definitions
 */

export enum TaskType {
    TASK = 'TASK',
    MILESTONE = 'MILESTONE',
    GROUP = 'GROUP'
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
 * Validates a task path format and depth
 */
export function validateTaskPath(path: string): { valid: boolean; error?: string } {
    // Path must be non-empty
    if (!path) {
        return { valid: false, error: 'Path cannot be empty' };
    }

    // Path must contain only allowed characters
    if (!path.match(/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/)) {
        return { 
            valid: false, 
            error: 'Path can only contain alphanumeric characters, underscores, dots, and hyphens' 
        };
    }
    
    // Check path depth
    if (path.split('/').length > CONSTRAINTS.MAX_PATH_DEPTH) {
        return { 
            valid: false, 
            error: `Path depth cannot exceed ${CONSTRAINTS.MAX_PATH_DEPTH} levels` 
        };
    }

    return { valid: true };
}

/**
 * Validates field length constraints
 */
export function validateFieldLength(
    field: string | undefined,
    maxLength: number,
    fieldName: string
): { valid: boolean; error?: string } {
    if (!field) return { valid: true };
    
    if (field.length > maxLength) {
        return {
            valid: false,
            error: `${fieldName} length cannot exceed ${maxLength} characters`
        };
    }
    
    return { valid: true };
}

/**
 * Validates array size constraints
 */
export function validateArraySize<T>(
    array: T[] | undefined,
    maxSize: number,
    arrayName: string
): { valid: boolean; error?: string } {
    if (!array) return { valid: true };
    
    if (array.length > maxSize) {
        return {
            valid: false,
            error: `${arrayName} cannot contain more than ${maxSize} items`
        };
    }
    
    return { valid: true };
}

/**
 * Validates a complete task
 */
export function validateTask(task: Task): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate path
    const pathValidation = validateTaskPath(task.path);
    if (!pathValidation.valid && pathValidation.error) {
        errors.push(pathValidation.error);
    }

    // Validate field lengths
    const fieldValidations = [
        validateFieldLength(task.name, CONSTRAINTS.NAME_MAX_LENGTH, 'Name'),
        validateFieldLength(task.description, CONSTRAINTS.DESCRIPTION_MAX_LENGTH, 'Description'),
        validateFieldLength(task.reasoning, CONSTRAINTS.REASONING_MAX_LENGTH, 'Reasoning')
    ];

    fieldValidations.forEach(validation => {
        if (!validation.valid && validation.error) {
            errors.push(validation.error);
        }
    });

    // Validate array sizes
    const arrayValidations = [
        validateArraySize(task.dependencies, CONSTRAINTS.MAX_DEPENDENCIES, 'Dependencies'),
        validateArraySize(task.subtasks, CONSTRAINTS.MAX_SUBTASKS, 'Subtasks'),
        validateArraySize(task.notes, CONSTRAINTS.MAX_NOTES, 'Notes')
    ];

    arrayValidations.forEach(validation => {
        if (!validation.valid && validation.error) {
            errors.push(validation.error);
        }
    });

    // Validate notes length
    task.notes?.forEach((note, index) => {
        const noteValidation = validateFieldLength(note, CONSTRAINTS.NOTE_MAX_LENGTH, `Note ${index + 1}`);
        if (!noteValidation.valid && noteValidation.error) {
            errors.push(noteValidation.error);
        }
    });

    // Validate metadata
    if (task.metadata) {
        Object.entries(task.metadata).forEach(([key, value]) => {
            if (typeof value === 'string' && value.length > CONSTRAINTS.METADATA_STRING_MAX_LENGTH) {
                errors.push(`Metadata field '${key}' exceeds maximum length of ${CONSTRAINTS.METADATA_STRING_MAX_LENGTH} characters`);
            }
            if (Array.isArray(value) && value.length > CONSTRAINTS.MAX_ARRAY_ITEMS) {
                errors.push(`Metadata array '${key}' exceeds maximum size of ${CONSTRAINTS.MAX_ARRAY_ITEMS} items`);
            }
        });
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Validates parent-child task type relationships
 */
export function isValidTaskHierarchy(parentType: TaskType, childType: TaskType): { valid: boolean; reason?: string } {
    switch (parentType) {
        case TaskType.MILESTONE:
            // Milestones can contain tasks and groups
            return {
                valid: childType === TaskType.TASK || childType === TaskType.GROUP,
                reason: childType !== TaskType.TASK && childType !== TaskType.GROUP ?
                    `MILESTONE can only contain TASK or GROUP types, not ${childType}` : undefined
            };
        case TaskType.GROUP:
            // Groups can contain tasks
            return {
                valid: childType === TaskType.TASK,
                reason: childType !== TaskType.TASK ?
                    `GROUP can only contain TASK type, not ${childType}` : undefined
            };
        case TaskType.TASK:
            // Tasks cannot contain other tasks
            return {
                valid: false,
                reason: `TASK type cannot contain any subtasks (attempted to add ${childType})`
            };
        default:
            return {
                valid: false,
                reason: `Unknown task type: ${parentType}`
            };
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
