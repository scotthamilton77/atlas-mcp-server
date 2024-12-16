/**
 * Error handling module
 * Provides centralized error handling and error types
 */

/**
 * Error codes enumeration
 */
export const ErrorCodes = {
    // Task errors
    TASK_NOT_FOUND: 'TASK_NOT_FOUND',
    TASK_VALIDATION: 'TASK_VALIDATION',
    TASK_DEPENDENCY: 'TASK_DEPENDENCY',
    TASK_STATUS: 'TASK_STATUS',
    TASK_DUPLICATE: 'TASK_DUPLICATE',
    TASK_INVALID_TYPE: 'TASK_INVALID_TYPE',
    TASK_INVALID_STATUS: 'TASK_INVALID_STATUS',
    TASK_INVALID_PARENT: 'TASK_INVALID_PARENT',

    // Storage errors
    STORAGE_READ: 'STORAGE_READ',
    STORAGE_WRITE: 'STORAGE_WRITE',
    STORAGE_DELETE: 'STORAGE_DELETE',
    STORAGE_ERROR: 'STORAGE_ERROR',
    STORAGE_INIT: 'STORAGE_INIT',
    STORAGE_INIT_ERROR: 'STORAGE_INIT_ERROR',

    // Configuration errors
    CONFIG_INVALID: 'CONFIG_INVALID',
    CONFIG_MISSING: 'CONFIG_MISSING',
    CONFIG_TYPE_ERROR: 'CONFIG_TYPE_ERROR',

    // Validation errors
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    INVALID_INPUT: 'INVALID_INPUT',
    INVALID_STATE: 'INVALID_STATE',

    // Operation errors
    OPERATION_FAILED: 'OPERATION_FAILED',
    NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
    INTERNAL_ERROR: 'INTERNAL_ERROR'
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

/**
 * Base error class for all application errors
 */
export class BaseError extends Error {
    constructor(
        public readonly code: ErrorCode,
        message: string,
        public readonly details?: unknown
    ) {
        super(message);
        this.name = this.constructor.name;
    }
}

/**
 * Task-related errors
 */
export class TaskError extends BaseError {
    constructor(code: ErrorCode, message: string, details?: unknown) {
        super(code, message, details);
    }
}

/**
 * Configuration-related errors
 */
export class ConfigError extends BaseError {
    constructor(code: ErrorCode, message: string, details?: unknown) {
        super(code, message, details);
    }
}

/**
 * Storage-related errors
 */
export class StorageError extends BaseError {
    constructor(code: ErrorCode, message: string, details?: unknown) {
        super(code, message, details);
    }
}

/**
 * Validation-related errors
 */
export class ValidationError extends BaseError {
    constructor(code: ErrorCode, message: string, details?: unknown) {
        super(code, message, details);
    }
}

/**
 * Error messages for common scenarios
 */
export const ErrorMessages = {
    [ErrorCodes.TASK_NOT_FOUND]: 'Task not found',
    [ErrorCodes.TASK_VALIDATION]: 'Task validation failed',
    [ErrorCodes.TASK_DEPENDENCY]: 'Invalid task dependency',
    [ErrorCodes.TASK_STATUS]: 'Invalid task status',
    [ErrorCodes.TASK_DUPLICATE]: 'Task already exists',
    [ErrorCodes.TASK_INVALID_TYPE]: 'Invalid task type',
    [ErrorCodes.TASK_INVALID_STATUS]: 'Invalid task status',
    [ErrorCodes.TASK_INVALID_PARENT]: 'Invalid parent task',
    [ErrorCodes.STORAGE_READ]: 'Failed to read from storage',
    [ErrorCodes.STORAGE_WRITE]: 'Failed to write to storage',
    [ErrorCodes.STORAGE_DELETE]: 'Failed to delete from storage',
    [ErrorCodes.STORAGE_ERROR]: 'Storage operation failed',
    [ErrorCodes.STORAGE_INIT]: 'Failed to initialize storage',
    [ErrorCodes.STORAGE_INIT_ERROR]: 'Failed to initialize storage',
    [ErrorCodes.CONFIG_INVALID]: 'Invalid configuration',
    [ErrorCodes.CONFIG_MISSING]: 'Required configuration missing',
    [ErrorCodes.CONFIG_TYPE_ERROR]: 'Configuration type error',
    [ErrorCodes.VALIDATION_ERROR]: 'Validation failed',
    [ErrorCodes.INVALID_INPUT]: 'Invalid input provided',
    [ErrorCodes.INVALID_STATE]: 'Invalid state',
    [ErrorCodes.OPERATION_FAILED]: 'Operation failed',
    [ErrorCodes.NOT_IMPLEMENTED]: 'Not implemented',
    [ErrorCodes.INTERNAL_ERROR]: 'Internal error occurred'
} as const;

/**
 * Creates an error with a standard message
 */
export function createError(code: ErrorCode, details?: unknown): BaseError {
    const message = ErrorMessages[code];
    switch (code) {
        case ErrorCodes.TASK_NOT_FOUND:
        case ErrorCodes.TASK_VALIDATION:
        case ErrorCodes.TASK_DEPENDENCY:
        case ErrorCodes.TASK_STATUS:
        case ErrorCodes.TASK_DUPLICATE:
        case ErrorCodes.TASK_INVALID_TYPE:
        case ErrorCodes.TASK_INVALID_STATUS:
        case ErrorCodes.TASK_INVALID_PARENT:
            return new TaskError(code, message, details);
        case ErrorCodes.CONFIG_INVALID:
        case ErrorCodes.CONFIG_MISSING:
        case ErrorCodes.CONFIG_TYPE_ERROR:
            return new ConfigError(code, message, details);
        case ErrorCodes.STORAGE_READ:
        case ErrorCodes.STORAGE_WRITE:
        case ErrorCodes.STORAGE_DELETE:
        case ErrorCodes.STORAGE_ERROR:
        case ErrorCodes.STORAGE_INIT:
        case ErrorCodes.STORAGE_INIT_ERROR:
            return new StorageError(code, message, details);
        case ErrorCodes.VALIDATION_ERROR:
        case ErrorCodes.INVALID_INPUT:
        case ErrorCodes.INVALID_STATE:
            return new ValidationError(code, message, details);
        default:
            return new BaseError(code, message, details);
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
            error.details
        );
    }
    return new BaseError(
        ErrorCodes.INTERNAL_ERROR,
        `${context}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
    );
}

/**
 * Type guard for BaseError
 */
export function isBaseError(error: unknown): error is BaseError {
    return error instanceof BaseError;
}

/**
 * Gets a user-friendly error message
 */
export function getUserErrorMessage(error: unknown): string {
    if (error instanceof BaseError) {
        return error.message;
    }
    return 'An unexpected error occurred';
}

/**
 * Error handler type
 */
export type ErrorHandler = (error: unknown) => void;

/**
 * Creates a default error handler
 */
export function createErrorHandler(context: string): ErrorHandler {
    return (error: unknown) => {
        console.error(`[${context}]`, error);
    };
}
