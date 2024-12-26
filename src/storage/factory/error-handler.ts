import { ErrorCodes, createError, type ErrorCode } from '../../errors/index.js';
import { Logger } from '../../logging/index.js';

/**
 * Helper function to create storage factory errors with consistent operation naming
 */
export function createFactoryError(
    code: ErrorCode,
    message: string,
    operation: string = 'StorageFactory',
    userMessage?: string,
    metadata?: Record<string, unknown>
): Error {
    return createError(
        code,
        message,
        `StorageFactory.${operation}`,
        userMessage,
        metadata
    );
}

/**
 * Helper class to handle storage factory errors with logging
 */
export class StorageFactoryErrorHandler {
    private readonly logger: Logger;

    constructor(component: string = 'StorageFactory') {
        this.logger = Logger.getInstance().child({ component });
    }

    /**
     * Handles initialization errors with consistent logging and error creation
     */
    handleInitError(
        error: unknown,
        operation: string,
        context?: Record<string, unknown>
    ): never {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorDetails = error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack
        } : { error };

        this.logger.error(`Failed to ${operation}`, {
            error: errorDetails,
            context
        });

        throw createFactoryError(
            ErrorCodes.STORAGE_INIT,
            `Failed to ${operation}`,
            operation,
            `Storage initialization failed: ${errorMessage}`,
            {
                ...context,
                error: errorDetails
            }
        );
    }

    /**
     * Handles storage creation errors with consistent logging and error creation
     */
    handleCreateError(
        error: unknown,
        operation: string,
        context?: Record<string, unknown>
    ): never {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorDetails = error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack
        } : { error };

        this.logger.error(`Failed to create storage`, {
            error: errorDetails,
            context
        });

        throw createFactoryError(
            ErrorCodes.STORAGE_INIT,
            'Failed to create storage',
            operation,
            `Storage creation failed: ${errorMessage}`,
            {
                ...context,
                error: errorDetails
            }
        );
    }
}
