import { TaskErrorFactory } from '../../errors/task-error.js';
import { Logger } from '../../logging/index.js';

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

    throw TaskErrorFactory.createTaskOperationError(
      `TaskManager.${operation}`,
      `Failed to ${operation}: ${errorMessage}`,
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

    throw TaskErrorFactory.createTaskValidationError(`TaskManager.${operation}`, message, context);
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

    throw TaskErrorFactory.createTaskNotFoundError(`TaskManager.${operation}`, taskPath);
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

    throw TaskErrorFactory.createTaskDependencyError(`TaskManager.${operation}`, message, context);
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

    throw TaskErrorFactory.createTaskStatusError(`TaskManager.${operation}`, message, context);
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

    throw TaskErrorFactory.createTaskOperationError(`TaskManager.${operation}`, message, {
      ...context,
      errorType: 'TASK_CYCLE',
      userMessage: 'Circular dependency detected in task relationships',
    });
  }
}
