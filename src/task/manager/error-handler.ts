import { TaskError } from '../../errors/task-error.js';
import { Logger } from '../../logging/index.js';

/**
 * Helper class to handle task manager errors with logging
 */
export class TaskManagerErrorHandler {
    private readonly logger: Logger;

    constructor(component: string = 'TaskManager') {
        this.logger = Logger.getInstance().child({ component });
    }

    /**
     * Handles initialization errors
     */
    handleInitError(
        error: unknown,
        operation: string,
        context?: Record<string, unknown>
    ): never {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to ${operation}`, {
            error,
            context
        });

        throw TaskError.operationFailed(
            'TaskManager',
            operation,
            `Failed to ${operation}: ${errorMessage}`,
            context
        );
    }

    /**
     * Handles validation errors
     */
    handleValidationError(
        message: string,
        operation: string,
        context?: Record<string, unknown>
    ): never {
        this.logger.error('Validation error', {
            message,
            operation,
            context
        });

        throw TaskError.validationFailed(
            operation,
            message,
            context
        );
    }

    /**
     * Handles task not found errors
     */
    handleNotFoundError(
        path: string,
        operation: string,
        context?: Record<string, unknown>
    ): never {
        this.logger.error('Task not found', {
            path,
            operation,
            context
        });

        throw TaskError.notFound(
            path,
            operation,
            context
        );
    }

    /**
     * Handles dependency errors
     */
    handleDependencyError(
        message: string,
        operation: string,
        context?: Record<string, unknown>
    ): never {
        this.logger.error('Dependency error', {
            message,
            operation,
            context
        });

        throw TaskError.dependencyError(
            operation,
            message,
            context
        );
    }

    /**
     * Handles status errors
     */
    handleStatusError(
        message: string,
        operation: string,
        context?: Record<string, unknown>
    ): never {
        this.logger.error('Status error', {
            message,
            operation,
            context
        });

        throw TaskError.statusError(
            operation,
            message,
            context
        );
    }

    /**
     * Handles operation errors
     */
    handleOperationError(
        error: unknown,
        operation: string,
        context?: Record<string, unknown>
    ): never {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Operation failed: ${operation}`, {
            error,
            context
        });

        throw TaskError.operationFailed(
            'TaskManager',
            operation,
            errorMessage,
            context
        );
    }

    /**
     * Handles bulk operation errors
     */
    handleBulkOperationError(
        errors: Error[],
        operation: string,
        context?: Record<string, unknown>
    ): never {
        this.logger.error('Bulk operation failed', {
            errors,
            operation,
            context
        });

        throw TaskError.bulkOperationFailed(
            operation,
            errors,
            context
        );
    }

    /**
     * Handles invalid input errors
     */
    handleInvalidInputError(
        message: string,
        operation: string,
        context?: Record<string, unknown>
    ): never {
        this.logger.error('Invalid input', {
            message,
            operation,
            context
        });

        throw TaskError.validationFailed(
            operation,
            message,
            context
        );
    }
}
