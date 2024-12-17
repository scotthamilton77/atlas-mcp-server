/**
 * Error-related type definitions
 */

/**
 * Error codes enumeration
 * @description Defines all possible error codes in the system
 */
export const ErrorCodes = {
    // Task-related errors
    TASK_NOT_FOUND: 'TASK_NOT_FOUND',
    TASK_VALIDATION: 'TASK_VALIDATION',
    TASK_DEPENDENCY: 'TASK_DEPENDENCY',
    TASK_STATUS: 'TASK_STATUS',
    TASK_DUPLICATE: 'TASK_DUPLICATE',
    TASK_INVALID_TYPE: 'TASK_INVALID_TYPE',
    TASK_INVALID_STATUS: 'TASK_INVALID_STATUS',
    TASK_INVALID_PARENT: 'TASK_INVALID_PARENT',
    TASK_OPERATION_FAILED: 'TASK_OPERATION_FAILED',
    
    // Storage-related errors
    STORAGE_READ: 'STORAGE_READ',
    STORAGE_WRITE: 'STORAGE_WRITE',
    STORAGE_INIT: 'STORAGE_INIT',
    STORAGE_DELETE: 'STORAGE_DELETE',
    STORAGE_PERMISSION: 'STORAGE_PERMISSION',
    STORAGE_NOT_FOUND: 'STORAGE_NOT_FOUND',
    STORAGE_TRANSACTION: 'STORAGE_TRANSACTION',
    STORAGE_ROLLBACK: 'STORAGE_ROLLBACK',
    STORAGE_COMMIT: 'STORAGE_COMMIT',
    
    // Configuration errors
    CONFIG_MISSING: 'CONFIG_MISSING',
    CONFIG_INVALID: 'CONFIG_INVALID',
    CONFIG_TYPE: 'CONFIG_TYPE',
    CONFIG_VALIDATION: 'CONFIG_VALIDATION',
    CONFIG_REQUIRED: 'CONFIG_REQUIRED',
    
    // Server errors
    SERVER_INIT: 'SERVER_INIT',
    SERVER_SHUTDOWN: 'SERVER_SHUTDOWN',
    SERVER_CONNECTION: 'SERVER_CONNECTION',
    SERVER_TIMEOUT: 'SERVER_TIMEOUT',
    SERVER_OVERLOAD: 'SERVER_OVERLOAD',
    
    // Tool-related errors
    TOOL_NOT_FOUND: 'TOOL_NOT_FOUND',
    TOOL_EXECUTION: 'TOOL_EXECUTION',
    TOOL_VALIDATION: 'TOOL_VALIDATION',
    TOOL_TIMEOUT: 'TOOL_TIMEOUT',
    TOOL_PERMISSION: 'TOOL_PERMISSION',
    
    // General errors
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    INVALID_INPUT: 'INVALID_INPUT',
    OPERATION_FAILED: 'OPERATION_FAILED',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    PERMISSION_DENIED: 'PERMISSION_DENIED',
    NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
    TIMEOUT: 'TIMEOUT'
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

/**
 * Base error interface
 * @description Common properties for all errors
 */
export interface BaseError {
    /** Error name/type */
    name: string;
    /** Error message */
    message: string;
    /** Error code */
    code: ErrorCode;
    /** Error stack trace */
    stack?: string;
    /** Additional error details */
    details?: unknown;
}

/**
 * Error severity levels
 * @description Defines the severity of errors for logging and handling
 */
export const ErrorSeverity = {
    DEBUG: 'debug',
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error',
    FATAL: 'fatal'
} as const;

export type ErrorSeverityLevel = typeof ErrorSeverity[keyof typeof ErrorSeverity];

/**
 * Extended error interface with severity
 * @description Error interface with additional severity information
 */
export interface ExtendedError extends BaseError {
    /** Error severity level */
    severity: ErrorSeverityLevel;
    /** Timestamp when the error occurred */
    timestamp: string;
    /** Request ID associated with the error */
    requestId?: string;
    /** Session ID associated with the error */
    sessionId?: string;
    /** User ID associated with the error */
    userId?: string;
    /** Additional context about the error */
    context?: Record<string, unknown>;
}

/**
 * Error response interface
 * @description Standard error response format
 */
export interface ErrorResponse {
    /** Operation success status (always false for errors) */
    success: false;
    /** Error information */
    error: {
        /** Error code */
        code: ErrorCode;
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
    };
}

/**
 * Error handler options interface
 * @description Configuration options for error handling
 */
export interface ErrorHandlerOptions {
    /** Whether to include stack traces in errors */
    includeStack?: boolean;
    /** Default error severity level */
    defaultSeverity?: ErrorSeverityLevel;
    /** Whether to log errors automatically */
    autoLog?: boolean;
    /** Custom error transformers */
    transformers?: {
        [key: string]: (error: unknown) => ErrorResponse;
    };
}

/**
 * Error category mapping
 * @description Maps error codes to their categories for better organization
 */
export const ErrorCategories = {
    TASK: [
        ErrorCodes.TASK_NOT_FOUND,
        ErrorCodes.TASK_VALIDATION,
        ErrorCodes.TASK_DEPENDENCY,
        ErrorCodes.TASK_STATUS,
        ErrorCodes.TASK_DUPLICATE,
        ErrorCodes.TASK_INVALID_TYPE,
        ErrorCodes.TASK_INVALID_STATUS,
        ErrorCodes.TASK_INVALID_PARENT,
        ErrorCodes.TASK_OPERATION_FAILED
    ],
    STORAGE: [
        ErrorCodes.STORAGE_READ,
        ErrorCodes.STORAGE_WRITE,
        ErrorCodes.STORAGE_INIT,
        ErrorCodes.STORAGE_DELETE,
        ErrorCodes.STORAGE_PERMISSION,
        ErrorCodes.STORAGE_NOT_FOUND,
        ErrorCodes.STORAGE_TRANSACTION,
        ErrorCodes.STORAGE_ROLLBACK,
        ErrorCodes.STORAGE_COMMIT
    ],
    CONFIG: [
        ErrorCodes.CONFIG_MISSING,
        ErrorCodes.CONFIG_INVALID,
        ErrorCodes.CONFIG_TYPE,
        ErrorCodes.CONFIG_VALIDATION,
        ErrorCodes.CONFIG_REQUIRED
    ],
    SERVER: [
        ErrorCodes.SERVER_INIT,
        ErrorCodes.SERVER_SHUTDOWN,
        ErrorCodes.SERVER_CONNECTION,
        ErrorCodes.SERVER_TIMEOUT,
        ErrorCodes.SERVER_OVERLOAD
    ],
    TOOL: [
        ErrorCodes.TOOL_NOT_FOUND,
        ErrorCodes.TOOL_EXECUTION,
        ErrorCodes.TOOL_VALIDATION,
        ErrorCodes.TOOL_TIMEOUT,
        ErrorCodes.TOOL_PERMISSION
    ],
    GENERAL: [
        ErrorCodes.INTERNAL_ERROR,
        ErrorCodes.INVALID_INPUT,
        ErrorCodes.OPERATION_FAILED,
        ErrorCodes.VALIDATION_ERROR,
        ErrorCodes.PERMISSION_DENIED,
        ErrorCodes.NOT_IMPLEMENTED,
        ErrorCodes.TIMEOUT
    ]
} as const;

export type ErrorCategory = keyof typeof ErrorCategories;

/**
 * Error metadata interface
 * @description Additional metadata for error tracking and analysis
 */
export interface ErrorMetadata {
    /** Error category */
    category: ErrorCategory;
    /** Error severity */
    severity: ErrorSeverityLevel;
    /** Whether the error is retryable */
    retryable: boolean;
    /** Suggested recovery action */
    recovery?: string;
    /** Related documentation link */
    docs?: string;
    /** Additional metadata */
    [key: string]: unknown;
}

/**
 * Error mapping type
 * @description Maps error codes to their metadata
 */
export type ErrorMapping = {
    [K in ErrorCode]: ErrorMetadata;
};
