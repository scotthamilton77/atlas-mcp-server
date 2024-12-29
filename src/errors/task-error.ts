import { BaseError } from './base-error.js';
import { ErrorCode, ErrorContext, ErrorSeverity } from '../types/error.js';

/**
 * Task-specific error class
 */
export class TaskError extends BaseError {
  constructor(
    code: ErrorCode,
    message: string,
    context: ErrorContext,
    details?: Record<string, unknown>
  ) {
    super(code, message, context, details);
  }

  /**
   * Creates an error for failed task operations
   */
  static operationFailed(
    component: string,
    operation: string,
    message: string,
    details?: Record<string, unknown>
  ): TaskError {
    const context: ErrorContext = {
      operation,
      timestamp: Date.now(),
      severity: ErrorSeverity.HIGH,
      metadata: {
        component,
        ...(details || {}),
      },
      stackTrace: new Error().stack,
    };

    return new TaskError('TASK_OPERATION_FAILED', message, context, details);
  }

  /**
   * Creates an error for validation failures
   */
  static validationFailed(
    operation: string,
    message: string,
    details?: Record<string, unknown>
  ): TaskError {
    const context: ErrorContext = {
      operation,
      timestamp: Date.now(),
      severity: ErrorSeverity.MEDIUM,
      metadata: details,
      stackTrace: new Error().stack,
    };

    return new TaskError('TASK_VALIDATION', message, context, details);
  }

  /**
   * Creates an error for task not found
   */
  static notFound(path: string, operation: string, details?: Record<string, unknown>): TaskError {
    const context: ErrorContext = {
      operation,
      timestamp: Date.now(),
      severity: ErrorSeverity.MEDIUM,
      metadata: {
        path,
        ...(details || {}),
      },
      stackTrace: new Error().stack,
    };

    return new TaskError('TASK_NOT_FOUND', `Task not found: ${path}`, context, details);
  }

  /**
   * Creates an error for dependency issues
   */
  static dependencyError(
    operation: string,
    message: string,
    details?: Record<string, unknown>
  ): TaskError {
    const context: ErrorContext = {
      operation,
      timestamp: Date.now(),
      severity: ErrorSeverity.HIGH,
      metadata: details,
      stackTrace: new Error().stack,
    };

    return new TaskError('TASK_DEPENDENCY', message, context, details);
  }

  /**
   * Creates an error for status update issues
   */
  static statusError(
    operation: string,
    message: string,
    details?: Record<string, unknown>
  ): TaskError {
    const context: ErrorContext = {
      operation,
      timestamp: Date.now(),
      severity: ErrorSeverity.HIGH,
      metadata: details,
      stackTrace: new Error().stack,
    };

    return new TaskError('TASK_STATUS', message, context, details);
  }

  /**
   * Creates an error for bulk operation failures
   */
  static bulkOperationFailed(
    operation: string,
    errors: Error[],
    details?: Record<string, unknown>
  ): TaskError {
    const context: ErrorContext = {
      operation,
      timestamp: Date.now(),
      severity: ErrorSeverity.HIGH,
      metadata: {
        errors: errors.map(e => ({
          message: e.message,
          stack: e.stack,
        })),
        ...(details || {}),
      },
      stackTrace: new Error().stack,
    };

    return new TaskError(
      'TASK_OPERATION_FAILED',
      'Failed to execute bulk operations',
      context,
      details
    );
  }
}
