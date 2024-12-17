/**
 * Error handling module
 * Provides centralized error handling and error types with detailed guidance
 */

/**
 * Error codes enumeration with categories
 */
export const ErrorCodes = {
    // Task errors (1000-1999)
    TASK_NOT_FOUND: 'TASK_1001',
    TASK_VALIDATION: 'TASK_1002',
    TASK_DEPENDENCY: 'TASK_1003',
    TASK_STATUS: 'TASK_1004',
    TASK_DUPLICATE: 'TASK_1005',
    TASK_INVALID_TYPE: 'TASK_1006',
    TASK_INVALID_STATUS: 'TASK_1007',
    TASK_INVALID_PARENT: 'TASK_1008',
    TASK_LOCKED: 'TASK_1009',
    TASK_CYCLE: 'TASK_1010',

    // Storage errors (2000-2999)
    STORAGE_READ: 'STORAGE_2001',
    STORAGE_WRITE: 'STORAGE_2002',
    STORAGE_DELETE: 'STORAGE_2003',
    STORAGE_ERROR: 'STORAGE_2004',
    STORAGE_INIT: 'STORAGE_2005',
    STORAGE_INIT_ERROR: 'STORAGE_2006',

    // Configuration errors (3000-3999)
    CONFIG_INVALID: 'CONFIG_3001',
    CONFIG_MISSING: 'CONFIG_3002',
    CONFIG_TYPE_ERROR: 'CONFIG_3003',

    // Validation errors (4000-4999)
    VALIDATION_ERROR: 'VALIDATION_4001',
    INVALID_INPUT: 'VALIDATION_4002',
    INVALID_STATE: 'VALIDATION_4003',

    // Operation errors (5000-5999)
    OPERATION_FAILED: 'OPERATION_5001',
    NOT_IMPLEMENTED: 'OPERATION_5002',
    INTERNAL_ERROR: 'OPERATION_5003',
    CONCURRENT_MODIFICATION: 'OPERATION_5004',
    TIMEOUT: 'OPERATION_5005'
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

/**
 * Error messages with detailed explanations and recovery suggestions
 */
export const ErrorMessages: Record<ErrorCode, { message: string; suggestion: string }> = {
    // Task errors
    [ErrorCodes.TASK_NOT_FOUND]: {
        message: 'Task not found',
        suggestion: 'Verify the task ID and ensure it exists in the system'
    },
    [ErrorCodes.TASK_VALIDATION]: {
        message: 'Task validation failed',
        suggestion: 'Check task properties against schema requirements'
    },
    [ErrorCodes.TASK_DEPENDENCY]: {
        message: 'Invalid task dependency',
        suggestion: 'Ensure all dependent tasks exist and form no circular dependencies'
    },
    [ErrorCodes.TASK_STATUS]: {
        message: 'Invalid task status transition',
        suggestion: 'Follow the allowed status transition flow: pending → in_progress → completed'
    },
    [ErrorCodes.TASK_DUPLICATE]: {
        message: 'Task already exists',
        suggestion: 'Use a unique task identifier or update the existing task'
    },
    [ErrorCodes.TASK_INVALID_TYPE]: {
        message: 'Invalid task type',
        suggestion: 'Use one of: task, milestone, or group'
    },
    [ErrorCodes.TASK_INVALID_STATUS]: {
        message: 'Invalid task status value',
        suggestion: 'Use one of: pending, in_progress, completed, failed, or blocked'
    },
    [ErrorCodes.TASK_INVALID_PARENT]: {
        message: 'Invalid parent task',
        suggestion: 'Ensure parent task exists and is of type "group"'
    },
    [ErrorCodes.TASK_LOCKED]: {
        message: 'Task is locked by another operation',
        suggestion: 'Wait a few seconds and retry the operation'
    },
    [ErrorCodes.TASK_CYCLE]: {
        message: 'Circular dependency detected',
        suggestion: 'Review and restructure task dependencies to eliminate cycles'
    },

    // Storage errors
    [ErrorCodes.STORAGE_READ]: {
        message: 'Failed to read from storage',
        suggestion: 'Check storage permissions and connectivity'
    },
    [ErrorCodes.STORAGE_WRITE]: {
        message: 'Failed to write to storage',
        suggestion: 'Verify storage capacity and permissions'
    },
    [ErrorCodes.STORAGE_DELETE]: {
        message: 'Failed to delete from storage',
        suggestion: 'Check if item exists and you have delete permissions'
    },
    [ErrorCodes.STORAGE_ERROR]: {
        message: 'Storage operation failed',
        suggestion: 'Verify storage system health and connectivity'
    },
    [ErrorCodes.STORAGE_INIT]: {
        message: 'Failed to initialize storage',
        suggestion: 'Check storage configuration and permissions'
    },
    [ErrorCodes.STORAGE_INIT_ERROR]: {
        message: 'Storage initialization error',
        suggestion: 'Verify storage prerequisites and configuration'
    },

    // Configuration errors
    [ErrorCodes.CONFIG_INVALID]: {
        message: 'Invalid configuration',
        suggestion: 'Review configuration against schema requirements'
    },
    [ErrorCodes.CONFIG_MISSING]: {
        message: 'Required configuration missing',
        suggestion: 'Provide all required configuration parameters'
    },
    [ErrorCodes.CONFIG_TYPE_ERROR]: {
        message: 'Configuration type error',
        suggestion: 'Ensure configuration values match expected types'
    },

    // Validation errors
    [ErrorCodes.VALIDATION_ERROR]: {
        message: 'Validation failed',
        suggestion: 'Check input against validation requirements'
    },
    [ErrorCodes.INVALID_INPUT]: {
        message: 'Invalid input provided',
        suggestion: 'Review input format and requirements'
    },
    [ErrorCodes.INVALID_STATE]: {
        message: 'Invalid state',
        suggestion: 'Ensure operation is valid for current state'
    },

    // Operation errors
    [ErrorCodes.OPERATION_FAILED]: {
        message: 'Operation failed',
        suggestion: 'Check error details and retry operation'
    },
    [ErrorCodes.NOT_IMPLEMENTED]: {
        message: 'Feature not implemented',
        suggestion: 'This feature is planned but not yet available'
    },
    [ErrorCodes.INTERNAL_ERROR]: {
        message: 'Internal error occurred',
        suggestion: 'Contact system administrator if problem persists'
    },
    [ErrorCodes.CONCURRENT_MODIFICATION]: {
        message: 'Concurrent modification detected',
        suggestion: 'Refresh data and retry operation'
    },
    [ErrorCodes.TIMEOUT]: {
        message: 'Operation timed out',
        suggestion: 'Check system load and retry operation'
    }
};

/**
 * Base error class for all application errors
 */
export class BaseError extends Error {
    constructor(
        public readonly code: ErrorCode,
        message: string,
        public readonly details?: unknown,
        public readonly suggestion?: string
    ) {
        super(message);
        this.name = this.constructor.name;
        this.suggestion = suggestion || ErrorMessages[code]?.suggestion;
    }

    /**
     * Gets a user-friendly error message with guidance
     */
    public getUserMessage(): string {
        const baseMessage = this.message || ErrorMessages[this.code]?.message;
        const suggestion = this.suggestion || ErrorMessages[this.code]?.suggestion;
        return `${baseMessage}${suggestion ? `\nSuggestion: ${suggestion}` : ''}`;
    }
}

/**
 * Task-related errors
 */
export class TaskError extends BaseError {
    constructor(code: ErrorCode, message: string, details?: unknown, suggestion?: string) {
        super(code, message, details, suggestion);
    }
}

/**
 * Configuration-related errors
 */
export class ConfigError extends BaseError {
    constructor(code: ErrorCode, message: string, details?: unknown, suggestion?: string) {
        super(code, message, details, suggestion);
    }
}

/**
 * Storage-related errors
 */
export class StorageError extends BaseError {
    constructor(code: ErrorCode, message: string, details?: unknown, suggestion?: string) {
        super(code, message, details, suggestion);
    }
}

/**
 * Validation-related errors
 */
export class ValidationError extends BaseError {
    constructor(code: ErrorCode, message: string, details?: unknown, suggestion?: string) {
        super(code, message, details, suggestion);
    }
}

/**
 * Creates an error with a standard message and suggestion
 */
export function createError(
    code: ErrorCode,
    details?: unknown,
    customMessage?: string,
    customSuggestion?: string
): BaseError {
    const message = customMessage || ErrorMessages[code]?.message;
    const suggestion = customSuggestion || ErrorMessages[code]?.suggestion;

    switch (code) {
        case ErrorCodes.TASK_NOT_FOUND:
        case ErrorCodes.TASK_VALIDATION:
        case ErrorCodes.TASK_DEPENDENCY:
        case ErrorCodes.TASK_STATUS:
        case ErrorCodes.TASK_DUPLICATE:
        case ErrorCodes.TASK_INVALID_TYPE:
        case ErrorCodes.TASK_INVALID_STATUS:
        case ErrorCodes.TASK_INVALID_PARENT:
        case ErrorCodes.TASK_LOCKED:
        case ErrorCodes.TASK_CYCLE:
            return new TaskError(code, message, details, suggestion);

        case ErrorCodes.CONFIG_INVALID:
        case ErrorCodes.CONFIG_MISSING:
        case ErrorCodes.CONFIG_TYPE_ERROR:
            return new ConfigError(code, message, details, suggestion);

        case ErrorCodes.STORAGE_READ:
        case ErrorCodes.STORAGE_WRITE:
        case ErrorCodes.STORAGE_DELETE:
        case ErrorCodes.STORAGE_ERROR:
        case ErrorCodes.STORAGE_INIT:
        case ErrorCodes.STORAGE_INIT_ERROR:
            return new StorageError(code, message, details, suggestion);

        case ErrorCodes.VALIDATION_ERROR:
        case ErrorCodes.INVALID_INPUT:
        case ErrorCodes.INVALID_STATE:
            return new ValidationError(code, message, details, suggestion);

        default:
            return new BaseError(code, message, details, suggestion);
    }
}

/**
 * Wraps an error with additional context
 */
export function wrapError(error: unknown, context: string): BaseError {
    if (error instanceof BaseError) {
        return new BaseError(
            error.code,
            `${context}: ${error.message}`,
            error.details,
            error.suggestion
        );
    }
    return new BaseError(
        ErrorCodes.INTERNAL_ERROR,
        `${context}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error,
        ErrorMessages[ErrorCodes.INTERNAL_ERROR].suggestion
    );
}

/**
 * Type guard for BaseError
 */
export function isBaseError(error: unknown): error is BaseError {
    return error instanceof BaseError;
}

/**
 * Gets a user-friendly error message with guidance
 */
export function getUserErrorMessage(error: unknown): string {
    if (error instanceof BaseError) {
        return error.getUserMessage();
    }
    const defaultError = ErrorMessages[ErrorCodes.INTERNAL_ERROR];
    return `${defaultError.message}\nSuggestion: ${defaultError.suggestion}`;
}

/**
 * Error handler type
 */
export type ErrorHandler = (error: unknown) => void;

/**
 * Creates a default error handler with context
 */
export function createErrorHandler(context: string): ErrorHandler {
    return (error: unknown) => {
        const message = error instanceof BaseError ? error.getUserMessage() : String(error);
        console.error(`[${context}] ${message}`);
    };
}
