/**
 * Error codes and error creation utility
 */
export const ErrorCodes = {
    // Task errors (1000-1999)
    TASK_NOT_FOUND: 'TASK_1001',
    TASK_VALIDATION: 'TASK_1002',
    TASK_DEPENDENCY: 'TASK_1003',
    TASK_STATUS: 'TASK_1004',
    TASK_DUPLICATE: 'TASK_1005',
    TASK_CYCLE: 'TASK_1006',
    TASK_INVALID_PATH: 'TASK_1007',
    TASK_PARENT_NOT_FOUND: 'TASK_1008',
    TASK_PARENT_TYPE: 'TASK_1009',

    // Storage errors (2000-2999)
    STORAGE_ERROR: 'STORAGE_2001',
    STORAGE_READ: 'STORAGE_2002',
    STORAGE_WRITE: 'STORAGE_2003',
    STORAGE_DELETE: 'STORAGE_2004',
    STORAGE_INIT: 'STORAGE_2005',
    STORAGE_CLOSE: 'STORAGE_2006',

    // Transaction errors (3000-3999)
    TRANSACTION_ERROR: 'TRANSACTION_3001',
    TRANSACTION_TIMEOUT: 'TRANSACTION_3002',
    TRANSACTION_DEADLOCK: 'TRANSACTION_3003',
    TRANSACTION_ROLLBACK: 'TRANSACTION_3004',
    TRANSACTION_COMMIT: 'TRANSACTION_3005',
    TRANSACTION_ISOLATION: 'TRANSACTION_3006',
    TRANSACTION_NESTED: 'TRANSACTION_3007',

    // Connection errors (4000-4999)
    CONNECTION_ERROR: 'CONNECTION_4001',
    CONNECTION_TIMEOUT: 'CONNECTION_4002',
    CONNECTION_LIMIT: 'CONNECTION_4003',
    CONNECTION_CLOSED: 'CONNECTION_4004',
    CONNECTION_BUSY: 'CONNECTION_4005',

    // Operation errors (5000-5999)
    INVALID_INPUT: 'OPERATION_5001',
    INVALID_STATE: 'OPERATION_5002',
    CONCURRENT_MODIFICATION: 'OPERATION_5003',
    INTERNAL_ERROR: 'OPERATION_5004',
    TIMEOUT: 'OPERATION_5005',
    OPERATION_FAILED: 'OPERATION_5006',
    VALIDATION_ERROR: 'OPERATION_5007',

    // Configuration errors (6000-6999)
    CONFIG_INVALID: 'CONFIG_6001',
    CONFIG_MISSING: 'CONFIG_6002'
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

export interface ErrorDetails {
    code: ErrorCode;
    message: string;
    operation?: string;
    cause?: string;
    details?: Record<string, unknown>;
}

export class BaseError extends Error {
    readonly code: ErrorCode;
    readonly operation?: string;
    readonly details?: Record<string, unknown>;

    constructor(details: ErrorDetails) {
        super(details.message);
        this.name = 'BaseError';
        this.code = details.code;
        this.operation = details.operation;
        this.details = details.details;
    }

    getUserMessage(): string {
        return this.message;
    }

    toJSON(): Record<string, unknown> {
        return {
            code: this.code,
            message: this.message,
            operation: this.operation,
            details: this.details
        };
    }
}

/**
 * Create a standardized error with proper code and context
 */
export class ConfigError extends BaseError {
    constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
        super({
            code,
            message,
            details
        });
        this.name = 'ConfigError';
    }
}

export function createError(
    code: ErrorCode,
    message: string,
    operation?: string,
    cause?: string,
    details?: Record<string, unknown>
): BaseError {
    const fullMessage = cause ? `${message}: ${cause}` : message;
    return new BaseError({
        code,
        message: fullMessage,
        operation,
        details
    });
}

/**
 * Check if an error is a specific type
 */
export function isErrorType(error: unknown, code: ErrorCode): boolean {
    return error instanceof BaseError && error.code === code;
}

/**
 * Retryable error codes
 */
export const RetryableErrorCodes = {
    CONNECTION_BUSY: ErrorCodes.CONNECTION_BUSY,
    TRANSACTION_DEADLOCK: ErrorCodes.TRANSACTION_DEADLOCK,
    CONNECTION_TIMEOUT: ErrorCodes.CONNECTION_TIMEOUT,
    STORAGE_ERROR: ErrorCodes.STORAGE_ERROR
} as const;

export type RetryableErrorCode = typeof RetryableErrorCodes[keyof typeof RetryableErrorCodes];

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
    if (!(error instanceof BaseError)) return false;

    return Object.values(RetryableErrorCodes).includes(error.code as RetryableErrorCode);
}

/**
 * Format error for logging
 */
export function formatError(error: unknown): Record<string, unknown> {
    if (error instanceof BaseError) {
        return error.toJSON();
    }

    if (error instanceof Error) {
        return {
            message: error.message,
            name: error.name,
            stack: error.stack
        };
    }

    return {
        message: String(error)
    };
}
