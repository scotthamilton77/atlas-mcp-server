import { ErrorCodes, createError, type ErrorCode } from '../../errors/index.js';
import { Logger } from '../../logging/index.js';

/**
 * Helper function to create task errors with consistent operation naming
 */
export function createTaskError(
  code: ErrorCode,
  message: string,
  operation: string = 'TaskManager',
  userMessage?: string,
  metadata?: Record<string, unknown>
): Error {
  return createError(code, message, `TaskManager.${operation}`, userMessage, metadata);
}

/**
 * Helper class to handle task errors with logging
 */
export class TaskErrorHandler {
  private readonly logger: Logger;

  constructor(component: string = 'TaskManager') {
    this.logger = Logger.getInstance().child({ component });
  }

  /**
   * Handles task operation errors with consistent logging and error creation
   */
  handleError(error: unknown, operation: string, context?: Record<string, unknown>): never {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorDetails =
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
            code: (error as any).code,
          }
        : { error };

    this.logger.error(`Failed to ${operation}`, {
      error: errorDetails,
      context,
    });

    throw createTaskError(
      ErrorCodes.OPERATION_FAILED,
      `Failed to ${operation}`,
      operation,
      `Task operation failed: ${errorMessage}`,
      {
        ...context,
        error: errorDetails,
      }
    );
  }

  /**
   * Handles task validation errors
   */
  handleValidationError(
    message: string,
    operation: string,
    context?: Record<string, unknown>
  ): never {
    this.logger.error(`Validation error in ${operation}`, {
      message,
      context,
    });

    throw createTaskError(
      ErrorCodes.TASK_VALIDATION,
      message,
      operation,
      'Task validation failed',
      context
    );
  }

  /**
   * Handles task not found errors
   */
  handleTaskNotFound(
    taskPath: string,
    operation: string,
    context?: Record<string, unknown>
  ): never {
    this.logger.error('Task not found', {
      taskPath,
      operation,
      context,
    });

    throw createTaskError(
      ErrorCodes.TASK_NOT_FOUND,
      `Task not found: ${taskPath}`,
      operation,
      'The requested task could not be found',
      {
        taskPath,
        ...context,
      }
    );
  }

  /**
   * Handles task dependency errors
   */
  handleDependencyError(
    message: string,
    operation: string,
    context?: Record<string, unknown>
  ): never {
    this.logger.error('Task dependency error', {
      message,
      operation,
      context,
    });

    throw createTaskError(
      ErrorCodes.TASK_DEPENDENCY,
      message,
      operation,
      'Task dependency validation failed',
      context
    );
  }

  /**
   * Handles task status errors
   */
  handleStatusError(message: string, operation: string, context?: Record<string, unknown>): never {
    this.logger.error('Task status error', {
      message,
      operation,
      context,
    });

    throw createTaskError(
      ErrorCodes.TASK_STATUS,
      message,
      operation,
      'Invalid task status transition',
      context
    );
  }

  /**
   * Handles task cycle detection errors
   */
  handleCycleError(message: string, operation: string, context?: Record<string, unknown>): never {
    this.logger.error('Task cycle detected', {
      message,
      operation,
      context,
    });

    throw createTaskError(
      ErrorCodes.TASK_CYCLE,
      message,
      operation,
      'Circular dependency detected in task relationships',
      context
    );
  }
}
