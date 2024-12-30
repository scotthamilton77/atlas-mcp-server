import { TaskErrorFactory } from '../../errors/task-error.js';
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
  handleInitError(error: unknown, operation: string, context?: Record<string, unknown>): never {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.logger.error(`Failed to ${operation}`, {
      error,
      context,
    });

    throw TaskErrorFactory.createTaskInitializationError(
      `TaskManager.${operation}`,
      error instanceof Error ? error : new Error(errorMessage),
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
      context,
    });

    throw TaskErrorFactory.createTaskValidationError(`TaskManager.${operation}`, message, context);
  }

  /**
   * Handles task not found errors
   */
  handleNotFoundError(path: string, operation: string, context?: Record<string, unknown>): never {
    this.logger.error('Task not found', {
      path,
      operation,
      context,
    });

    throw TaskErrorFactory.createTaskNotFoundError(`TaskManager.${operation}`, path);
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
      context,
    });

    throw TaskErrorFactory.createTaskDependencyError(`TaskManager.${operation}`, message, context);
  }

  /**
   * Handles status errors
   */
  handleStatusError(message: string, operation: string, context?: Record<string, unknown>): never {
    this.logger.error('Status error', {
      message,
      operation,
      context,
    });

    throw TaskErrorFactory.createTaskStatusError(`TaskManager.${operation}`, message, context);
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
      context,
    });

    throw TaskErrorFactory.createTaskOperationError(
      `TaskManager.${operation}`,
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
      context,
    });

    throw TaskErrorFactory.createTaskOperationError(
      `TaskManager.${operation}`,
      'Bulk operation failed',
      {
        ...context,
        errors: errors.map(e => e.message),
      }
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
      context,
    });

    throw TaskErrorFactory.createTaskValidationError(`TaskManager.${operation}`, message, context);
  }
}
