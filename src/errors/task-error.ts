import { BaseError } from './base-error.js';
import { ErrorCode, ErrorContext, ErrorSeverity } from '../types/error.js';

/**
 * Factory for creating task-specific errors
 */
export class TaskErrorFactory {
  /**
   * Creates a task error with context
   */
  private static createError(
    code: ErrorCode,
    message: string,
    operation: string,
    metadata?: Record<string, unknown>
  ): BaseError {
    const context: ErrorContext = {
      operation,
      timestamp: Date.now(),
      severity: ErrorSeverity.HIGH,
      metadata: {
        ...metadata,
        stackTrace: new Error().stack,
      },
      component: 'Task',
    };

    return new BaseError(code, message, context);
  }

  /**
   * Creates a task creation error
   */
  static createTaskCreationError(
    operation: string,
    error: Error,
    metadata?: Record<string, unknown>
  ): BaseError {
    return this.createError(
      'TASK_OPERATION_FAILED',
      `Failed to create task: ${error.message}`,
      operation,
      {
        ...metadata,
        originalError: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      }
    );
  }

  /**
   * Creates a task update error
   */
  static createTaskUpdateError(
    operation: string,
    error: Error,
    metadata?: Record<string, unknown>
  ): BaseError {
    return this.createError(
      'TASK_OPERATION_FAILED',
      `Failed to update task: ${error.message}`,
      operation,
      {
        ...metadata,
        originalError: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      }
    );
  }

  /**
   * Creates a task not found error
   */
  static createTaskNotFoundError(operation: string, path: string): BaseError {
    return this.createError('TASK_NOT_FOUND', `Task not found: ${path}`, operation, { path });
  }

  /**
   * Creates a task validation error
   */
  static createTaskValidationError(
    operation: string,
    message: string,
    metadata?: Record<string, unknown>
  ): BaseError {
    return this.createError('TASK_VALIDATION', message, operation, metadata);
  }

  /**
   * Creates a task dependency error
   */
  static createTaskDependencyError(
    operation: string,
    message: string,
    metadata?: Record<string, unknown>
  ): BaseError {
    return this.createError('TASK_DEPENDENCY', message, operation, metadata);
  }

  /**
   * Creates a task status error
   */
  static createTaskStatusError(
    operation: string,
    message: string,
    metadata?: Record<string, unknown>
  ): BaseError {
    return this.createError('TASK_STATUS', message, operation, metadata);
  }

  /**
   * Creates a task operation error
   */
  static createTaskOperationError(
    operation: string,
    message: string,
    metadata?: Record<string, unknown>
  ): BaseError {
    return this.createError('TASK_OPERATION_FAILED', message, operation, metadata);
  }

  /**
   * Creates a task initialization error
   */
  static createTaskInitializationError(
    operation: string,
    error: Error,
    metadata?: Record<string, unknown>
  ): BaseError {
    return this.createError(
      'TASK_INITIALIZATION',
      `Failed to initialize task: ${error.message}`,
      operation,
      {
        ...metadata,
        originalError: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      }
    );
  }

  /**
   * Creates a task storage error
   */
  static createTaskStorageError(
    operation: string,
    error: Error,
    metadata?: Record<string, unknown>
  ): BaseError {
    return this.createError('STORAGE_ERROR', `Task storage error: ${error.message}`, operation, {
      ...metadata,
      originalError: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
    });
  }
}
