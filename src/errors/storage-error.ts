import { BaseError } from './base-error.js';
import { ErrorCode, ErrorContext, ErrorSeverity } from '../types/error.js';

type StorageErrorCode = Extract<
    ErrorCode,
    | 'STORAGE_READ'
    | 'STORAGE_WRITE'
    | 'STORAGE_INIT'
    | 'STORAGE_DELETE'
    | 'STORAGE_PERMISSION'
    | 'STORAGE_NOT_FOUND'
    | 'STORAGE_TRANSACTION'
    | 'STORAGE_ROLLBACK'
    | 'STORAGE_COMMIT'
    | 'STORAGE_ERROR'
    | 'DATABASE_ERROR'
>;

/**
 * Storage-specific error class
 */
export class StorageError extends BaseError {
    constructor(
        code: StorageErrorCode,
        message: string,
        context: ErrorContext,
        storagePath?: string
    ) {
        // Add storage path to metadata if provided
        const enrichedContext: ErrorContext = {
            ...context,
            metadata: {
                ...context.metadata,
                ...(storagePath && { storagePath })
            }
        };

        super(code, message, enrichedContext);
        this.name = 'StorageError';
    }

    /**
     * Gets the storage path if available
     */
    getStoragePath(): string | undefined {
        return this.getMetadata()?.storagePath as string | undefined;
    }

    /**
     * Creates a string representation of the storage error
     */
    toString(): string {
        const storagePath = this.getStoragePath();
        return `${this.name} [${this.code}]${storagePath ? ` at ${storagePath}` : ''}: ${this.message}${
            this.getUserMessage() !== this.message ? ` (${this.getUserMessage()})` : ''
        }`;
    }

    /**
     * Converts the storage error to a JSON-serializable object
     */
    toJSON(): Record<string, unknown> {
        return {
            ...super.toJSON(),
            storagePath: this.getStoragePath()
        };
    }

    /**
     * Creates a read error
     */
    static read(
        path: string,
        operation: string,
        reason: string,
        metadata?: Record<string, unknown>
    ): StorageError {
        return new StorageError(
            'STORAGE_READ',
            `Failed to read from storage: ${reason}`,
            {
                operation,
                timestamp: Date.now(),
                severity: ErrorSeverity.HIGH,
                metadata: {
                    ...metadata,
                    storagePath: path,
                    reason
                }
            },
            path
        );
    }

    /**
     * Creates a write error
     */
    static write(
        path: string,
        operation: string,
        reason: string,
        metadata?: Record<string, unknown>
    ): StorageError {
        return new StorageError(
            'STORAGE_WRITE',
            `Failed to write to storage: ${reason}`,
            {
                operation,
                timestamp: Date.now(),
                severity: ErrorSeverity.HIGH,
                metadata: {
                    ...metadata,
                    storagePath: path,
                    reason
                }
            },
            path
        );
    }

    /**
     * Creates an initialization error
     */
    static init(
        path: string,
        operation: string,
        reason: string,
        metadata?: Record<string, unknown>
    ): StorageError {
        return new StorageError(
            'STORAGE_INIT',
            `Failed to initialize storage: ${reason}`,
            {
                operation,
                timestamp: Date.now(),
                severity: ErrorSeverity.CRITICAL,
                metadata: {
                    ...metadata,
                    storagePath: path,
                    reason
                }
            },
            path
        );
    }

    /**
     * Creates a transaction error
     */
    static transaction(
        path: string,
        operation: string,
        reason: string,
        metadata?: Record<string, unknown>
    ): StorageError {
        return new StorageError(
            'STORAGE_TRANSACTION',
            `Transaction failed: ${reason}`,
            {
                operation,
                timestamp: Date.now(),
                severity: ErrorSeverity.HIGH,
                metadata: {
                    ...metadata,
                    storagePath: path,
                    reason
                }
            },
            path
        );
    }

    /**
     * Creates a rollback error
     */
    static rollback(
        path: string,
        operation: string,
        reason: string,
        metadata?: Record<string, unknown>
    ): StorageError {
        return new StorageError(
            'STORAGE_ROLLBACK',
            `Failed to rollback transaction: ${reason}`,
            {
                operation,
                timestamp: Date.now(),
                severity: ErrorSeverity.CRITICAL,
                metadata: {
                    ...metadata,
                    storagePath: path,
                    reason
                }
            },
            path
        );
    }

    /**
     * Creates a commit error
     */
    static commit(
        path: string,
        operation: string,
        reason: string,
        metadata?: Record<string, unknown>
    ): StorageError {
        return new StorageError(
            'STORAGE_COMMIT',
            `Failed to commit transaction: ${reason}`,
            {
                operation,
                timestamp: Date.now(),
                severity: ErrorSeverity.HIGH,
                metadata: {
                    ...metadata,
                    storagePath: path,
                    reason
                }
            },
            path
        );
    }

    /**
     * Creates a database error
     */
    static database(
        path: string,
        operation: string,
        error: Error,
        metadata?: Record<string, unknown>
    ): StorageError {
        return new StorageError(
            'DATABASE_ERROR',
            `Database error: ${error.message}`,
            {
                operation,
                timestamp: Date.now(),
                severity: ErrorSeverity.CRITICAL,
                metadata: {
                    ...metadata,
                    storagePath: path,
                    originalError: {
                        name: error.name,
                        message: error.message,
                        stack: error.stack
                    }
                }
            },
            path
        );
    }

    /**
     * Creates a permission error
     */
    static permission(
        path: string,
        operation: string,
        action: string,
        metadata?: Record<string, unknown>
    ): StorageError {
        return new StorageError(
            'STORAGE_PERMISSION',
            `Permission denied: ${action}`,
            {
                operation,
                timestamp: Date.now(),
                severity: ErrorSeverity.HIGH,
                metadata: {
                    ...metadata,
                    storagePath: path,
                    action
                }
            },
            path
        );
    }
}
