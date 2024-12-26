import { BaseError } from './base-error.js';
import { ErrorCode, ErrorContext, ErrorSeverity } from '../types/error.js';

/**
 * Factory class for creating standardized errors
 */
export class ErrorFactory {
    /**
     * Creates a new error instance
     */
    static createError(
        code: ErrorCode,
        message: string,
        operation: string,
        userMessage?: string,
        metadata?: Record<string, unknown>
    ): BaseError {
        const context: ErrorContext = {
            operation,
            metadata,
            timestamp: Date.now(),
            severity: this.getSeverityForCode(code),
            stackTrace: new Error().stack,
            correlationId: metadata?.correlationId as string
        };

        const error = new BaseError(code, message, context);
        if (userMessage) {
            error.setUserMessage(userMessage);
        }
        return error;
    }

    /**
     * Creates a database error
     */
    static createDatabaseError(
        operation: string,
        originalError: Error,
        metadata?: Record<string, unknown>
    ): BaseError {
        return this.createError(
            'DATABASE_ERROR',
            originalError.message,
            operation,
            'A database error occurred',
            {
                ...metadata,
                originalError: {
                    name: originalError.name,
                    message: originalError.message,
                    stack: originalError.stack
                }
            }
        );
    }

    /**
     * Creates a storage error
     */
    static createStorageError(
        operation: string,
        originalError: Error,
        metadata?: Record<string, unknown>
    ): BaseError {
        return this.createError(
            'STORAGE_ERROR',
            originalError.message,
            operation,
            'A storage error occurred',
            {
                ...metadata,
                originalError: {
                    name: originalError.name,
                    message: originalError.message,
                    stack: originalError.stack
                }
            }
        );
    }

    /**
     * Creates a validation error
     */
    static createValidationError(
        operation: string,
        message: string,
        details?: Record<string, unknown>
    ): BaseError {
        return this.createError(
            'VALIDATION_ERROR',
            message,
            operation,
            'Validation failed',
            details
        );
    }

    /**
     * Creates a not found error
     */
    static createNotFoundError(
        operation: string,
        resourceType: string,
        identifier: string
    ): BaseError {
        return this.createError(
            'TASK_NOT_FOUND',
            `${resourceType} not found: ${identifier}`,
            operation,
            `The requested ${resourceType.toLowerCase()} could not be found`,
            { resourceType, identifier }
        );
    }

    /**
     * Creates a permission denied error
     */
    static createPermissionError(
        operation: string,
        resource: string,
        action: string
    ): BaseError {
        return this.createError(
            'PERMISSION_DENIED',
            `Permission denied: ${action} on ${resource}`,
            operation,
            'You do not have permission to perform this action',
            { resource, action }
        );
    }

    /**
     * Creates a timeout error
     */
    static createTimeoutError(
        operation: string,
        duration: number,
        metadata?: Record<string, unknown>
    ): BaseError {
        return this.createError(
            'TIMEOUT',
            `Operation timed out after ${duration}ms`,
            operation,
            'The operation took too long to complete',
            { ...metadata, duration }
        );
    }

    /**
     * Determines error severity based on error code
     */
    private static getSeverityForCode(code: ErrorCode): ErrorSeverity {
        // Critical errors that need immediate attention
        const criticalErrors = [
            'DATABASE_ERROR',
            'STORAGE_ERROR',
            'SERVER_INIT',
            'SERVER_SHUTDOWN'
        ] as const;

        // High severity errors that impact functionality
        const highSeverityErrors = [
            'TASK_NOT_FOUND',
            'STORAGE_TRANSACTION',
            'STORAGE_ROLLBACK',
            'STORAGE_COMMIT',
            'SERVER_CONNECTION',
            'SERVER_TIMEOUT',
            'SERVER_OVERLOAD'
        ] as const;

        // Medium severity errors that may need investigation
        const mediumSeverityErrors = [
            'TASK_VALIDATION',
            'TASK_DEPENDENCY',
            'TASK_STATUS',
            'CONFIG_MISSING',
            'CONFIG_INVALID',
            'TOOL_EXECUTION',
            'TOOL_TIMEOUT'
        ] as const;

        if (criticalErrors.includes(code as any)) {
            return ErrorSeverity.CRITICAL;
        }

        if (highSeverityErrors.includes(code as any)) {
            return ErrorSeverity.HIGH;
        }

        if (mediumSeverityErrors.includes(code as any)) {
            return ErrorSeverity.MEDIUM;
        }

        return ErrorSeverity.LOW;
    }

    /**
     * Converts an error to a string representation
     */
    static stringifyError(error: Error | unknown): string {
        if (error instanceof Error) {
            return `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ''}`;
        }
        return String(error);
    }
}
