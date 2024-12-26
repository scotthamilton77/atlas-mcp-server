import { ErrorCodes, createError, type ErrorCode } from '../../errors/index.js';
import { Logger } from '../../logging/index.js';

/**
 * Helper function to create storage errors with consistent operation naming
 */
export function createStorageError(
    code: ErrorCode,
    message: string,
    operation: string = 'SqliteStorage',
    userMessage?: string,
    metadata?: Record<string, unknown>
): Error {
    return createError(
        code,
        message,
        `SqliteStorage.${operation}`,
        userMessage,
        metadata
    );
}

/**
 * Helper function to format error details for logging and error creation
 */
export function formatErrorDetails(error: unknown): Record<string, unknown> {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            stack: error.stack,
            code: (error as any).code,
            errno: (error as any).errno,
            syscall: (error as any).syscall,
            // Ensure custom properties don't get overwritten
            customProps: Object.getOwnPropertyNames(error).reduce((acc, key) => {
                if (key !== 'name' && key !== 'message' && key !== 'stack') {
                    acc[key] = (error as any)[key];
                }
                return acc;
            }, {} as Record<string, unknown>)
        };
    }
    return { error };
}

/**
 * Helper class to handle SQLite errors with logging
 */
export class SqliteErrorHandler {
    private readonly logger: Logger;

    constructor(component: string = 'SqliteStorage') {
        this.logger = Logger.getInstance().child({ component });
    }

    /**
     * Handles storage operation errors with consistent logging and error creation
     */
    handleError(
        error: unknown,
        operation: string,
        context?: Record<string, unknown>
    ): never {
        const errorDetails = formatErrorDetails(error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        this.logger.error(`Failed to ${operation}`, {
            error: errorDetails,
            context
        });

        throw createStorageError(
            ErrorCodes.STORAGE_ERROR,
            `Failed to ${operation}`,
            operation,
            `Storage operation failed: ${errorMessage}`,
            {
                ...context,
                error: errorDetails
            }
        );
    }

    /**
     * Handles initialization errors with detailed logging
     */
    handleInitError(
        error: unknown,
        config: Record<string, unknown>
    ): never {
        const errorDetails = formatErrorDetails(error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        this.logger.error('Failed to initialize SQLite storage', {
            error: errorDetails,
            config
        });

        // Try to get more details about the SQLite error
        if (error instanceof Error && 'code' in error) {
            this.logger.error('SQLite error details', {
                code: (error as any).code,
                errno: (error as any).errno,
                syscall: (error as any).syscall
            });
        }

        throw createStorageError(
            ErrorCodes.STORAGE_INIT,
            'Failed to initialize SQLite storage',
            'initialize',
            `Storage initialization failed: ${errorMessage}`,
            {
                config,
                error: errorDetails
            }
        );
    }
}
