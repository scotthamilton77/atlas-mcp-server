import { ErrorCodes, createError, type ErrorCode } from '../errors/index.js';
import { Logger } from '../logging/index.js';

/**
 * Helper function to create tool errors with consistent operation naming
 */
export function createToolError(
    code: ErrorCode,
    message: string,
    operation: string = 'ToolHandler',
    userMessage?: string,
    metadata?: Record<string, unknown>
): Error {
    return createError(
        code,
        message,
        `ToolHandler.${operation}`,
        userMessage,
        metadata
    );
}

/**
 * Helper class to handle tool errors with logging
 */
export class ToolErrorHandler {
    private readonly logger: Logger;

    constructor(component: string = 'ToolHandler') {
        this.logger = Logger.getInstance().child({ component });
    }

    /**
     * Handles tool operation errors with consistent logging and error creation
     */
    handleError(
        error: unknown,
        operation: string,
        context?: Record<string, unknown>
    ): never {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorDetails = error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
            code: (error as any).code
        } : { error };

        this.logger.error(`Failed to ${operation}`, {
            error: errorDetails,
            context
        });

        throw createToolError(
            ErrorCodes.TOOL_EXECUTION,
            `Failed to ${operation}`,
            operation,
            `Tool operation failed: ${errorMessage}`,
            {
                ...context,
                error: errorDetails
            }
        );
    }

    /**
     * Handles validation errors with consistent logging and error creation
     */
    handleValidationError(
        message: string,
        operation: string,
        context?: Record<string, unknown>
    ): never {
        this.logger.error(`Validation error in ${operation}`, {
            message,
            context
        });

        throw createToolError(
            ErrorCodes.INVALID_INPUT,
            message,
            operation,
            'Invalid tool input',
            context
        );
    }

    /**
     * Handles tool not found errors
     */
    handleToolNotFound(
        toolName: string,
        context?: Record<string, unknown>
    ): never {
        this.logger.error('Tool not found', {
            tool: toolName,
            context
        });

        throw createToolError(
            ErrorCodes.TOOL_NOT_FOUND,
            `Unknown tool: ${toolName}`,
            'handleToolCall',
            'The requested tool is not available',
            {
                tool: toolName,
                ...context
            }
        );
    }

    /**
     * Handles tool timeout errors
     */
    handleTimeout(
        toolName: string,
        duration: number,
        context?: Record<string, unknown>
    ): never {
        this.logger.error('Tool execution timeout', {
            tool: toolName,
            duration,
            context
        });

        throw createToolError(
            ErrorCodes.TOOL_TIMEOUT,
            `Tool execution timed out after ${duration}ms`,
            'handleToolCall',
            'The tool operation took too long to complete',
            {
                tool: toolName,
                duration,
                ...context
            }
        );
    }
}
