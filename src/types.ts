export type TaskType = 'task' | 'milestone' | 'group';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked';

export interface TaskNote {
    type: 'text' | 'code' | 'json' | 'markdown';
    content: string;
    language?: string; // For code content
    metadata?: Record<string, unknown>;
}

export interface TaskMetadata {
    created: string;
    updated: string;
    sessionId: string;
    context?: string;
    tags?: string[];
    [key: string]: unknown;
}

export interface Task {
    id: string;
    name: string;
    description?: string;
    notes?: TaskNote[];
    type: TaskType;
    status: TaskStatus;
    dependencies: string[];
    subtasks: Task[];
    metadata: TaskMetadata;
    parentId: string;
    error?: {
        code: string;
        message: string;
        details?: unknown;
    };
}

export interface CreateTaskInput {
    name: string;
    description?: string;
    notes?: TaskNote[];
    type?: TaskType;
    dependencies?: string[];
    metadata?: {
        context?: string;
        tags?: string[];
        [key: string]: unknown;
    };
    subtasks?: CreateTaskInput[];
}

export interface BatchCreateTaskInput {
    parentId: string | null;
    tasks: CreateTaskInput[];
}

export interface UpdateTaskInput {
    name?: string;
    description?: string;
    notes?: TaskNote[];
    type?: TaskType;
    status?: TaskStatus;
    dependencies?: string[];
    metadata?: {
        context?: string;
        tags?: string[];
        [key: string]: unknown;
    };
}

export class TaskValidationError extends Error {
    constructor(message: string, public code: string, public details?: unknown) {
        super(message);
        this.name = 'TaskValidationError';
    }
}

export class TaskNotFoundError extends Error {
    constructor(taskId: string) {
        super(`Task not found: ${taskId}`);
        this.name = 'TaskNotFoundError';
    }
}

export class DependencyError extends Error {
    constructor(message: string, public dependencies: string[]) {
        super(message);
        this.name = 'DependencyError';
    }
}

export interface TaskResponse<T> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
        details?: unknown;
    };
    metadata?: {
        timestamp: string;
        requestId: string;
        sessionId: string;
        affectedTasks?: string[];
    };
}

export function validateTaskNotes(notes: TaskNote[]): void {
    for (const note of notes) {
        if (!['text', 'code', 'json', 'markdown'].includes(note.type)) {
            throw new TaskValidationError(
                `Invalid note type: ${note.type}`,
                'INVALID_NOTE_TYPE'
            );
        }
        if (note.type === 'code' && !note.language) {
            throw new TaskValidationError(
                'Language must be specified for code notes',
                'MISSING_LANGUAGE'
            );
        }
        if (note.type === 'json') {
            try {
                JSON.parse(note.content);
            } catch {
                throw new TaskValidationError(
                    'Invalid JSON content in note',
                    'INVALID_JSON'
                );
            }
        }
    }
}

export function validateTaskMetadata(metadata: Record<string, unknown>): void {
    if (metadata.tags && !Array.isArray(metadata.tags)) {
        throw new TaskValidationError(
            'Tags must be an array of strings',
            'INVALID_TAGS'
        );
    }
}

export function sanitizeTaskInput(input: CreateTaskInput | UpdateTaskInput): void {
    // Sanitize name
    if ('name' in input && input.name) {
        input.name = input.name.trim();
        if (input.name.length === 0) {
            throw new TaskValidationError(
                'Task name cannot be empty',
                'INVALID_NAME'
            );
        }
        if (input.name.length > 200) {
            throw new TaskValidationError(
                'Task name too long (max 200 characters)',
                'NAME_TOO_LONG'
            );
        }
    }

    // Sanitize description
    if (input.description) {
        input.description = input.description.trim();
        if (input.description.length > 2000) {
            throw new TaskValidationError(
                'Description too long (max 2000 characters)',
                'DESCRIPTION_TOO_LONG'
            );
        }
    }

    // Validate notes if present
    if (input.notes) {
        validateTaskNotes(input.notes);
    }

    // Validate metadata if present
    if (input.metadata) {
        validateTaskMetadata(input.metadata);
    }

    // Validate dependencies
    if (input.dependencies) {
        if (!Array.isArray(input.dependencies)) {
            throw new TaskValidationError(
                'Dependencies must be an array',
                'INVALID_DEPENDENCIES'
            );
        }
        if (new Set(input.dependencies).size !== input.dependencies.length) {
            throw new TaskValidationError(
                'Duplicate dependencies are not allowed',
                'DUPLICATE_DEPENDENCIES'
            );
        }
    }

    // Validate subtasks if present
    if ('subtasks' in input && input.subtasks) {
        if (!Array.isArray(input.subtasks)) {
            throw new TaskValidationError(
                'Subtasks must be an array',
                'INVALID_SUBTASKS'
            );
        }
        input.subtasks.forEach(subtask => sanitizeTaskInput(subtask));
    }
}

export function getRootId(sessionId: string): string {
    return `ROOT-${sessionId}`;
}

export function isRootTask(taskId: string): boolean {
    return taskId.startsWith('ROOT-');
}
