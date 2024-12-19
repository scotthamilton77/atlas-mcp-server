/**
 * Storage error codes
 */
export const StorageErrorCode = {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    NOT_FOUND: 'NOT_FOUND',
    ALREADY_EXISTS: 'ALREADY_EXISTS',
    INVALID_OPERATION: 'INVALID_OPERATION',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    TRANSACTION_ERROR: 'TRANSACTION_ERROR'
} as const;

/**
 * Storage error code type
 */
export type StorageErrorCode = typeof StorageErrorCode[keyof typeof StorageErrorCode];

/**
 * Storage error class
 */
export class StorageError extends Error {
    readonly code: StorageErrorCode;
    readonly metadata: Record<string, unknown>;

    constructor(code: StorageErrorCode, message: string, metadata: Record<string, unknown> = {}) {
        super(message);
        this.code = code;
        this.metadata = metadata;
        this.name = 'StorageError';
    }

    /**
     * Get error details
     */
    getDetails(): Record<string, unknown> {
        return {
            code: this.code,
            message: this.message,
            ...this.metadata
        };
    }

    /**
     * Create validation error
     */
    static validation(message: string, metadata: Record<string, unknown> = {}): StorageError {
        return new StorageError(StorageErrorCode.VALIDATION_ERROR, message, metadata);
    }

    /**
     * Create not found error
     */
    static notFound(message: string, metadata: Record<string, unknown> = {}): StorageError {
        return new StorageError(StorageErrorCode.NOT_FOUND, message, metadata);
    }

    /**
     * Create already exists error
     */
    static alreadyExists(message: string, metadata: Record<string, unknown> = {}): StorageError {
        return new StorageError(StorageErrorCode.ALREADY_EXISTS, message, metadata);
    }

    /**
     * Create invalid operation error
     */
    static invalidOperation(message: string, metadata: Record<string, unknown> = {}): StorageError {
        return new StorageError(StorageErrorCode.INVALID_OPERATION, message, metadata);
    }

    /**
     * Create internal error
     */
    static internal(message: string, metadata: Record<string, unknown> = {}): StorageError {
        return new StorageError(StorageErrorCode.INTERNAL_ERROR, message, metadata);
    }

    /**
     * Create transaction error
     */
    static transaction(message: string, metadata: Record<string, unknown> = {}): StorageError {
        return new StorageError(StorageErrorCode.TRANSACTION_ERROR, message, metadata);
    }
}
