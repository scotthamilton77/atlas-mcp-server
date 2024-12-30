import { BaseError } from './base-error.js';
import { ErrorCode, ErrorContext, ErrorSeverity } from '../types/error.js';
import { isDatabaseError, isTransientError } from '../utils/error-utils.js';

/**
 * Factory class for creating standardized errors
 */
export class ErrorFactory {
  /**
   * SQLite error codes that indicate transient issues
   */
  private static readonly TRANSIENT_SQLITE_ERRORS = new Set([
    'SQLITE_BUSY',
    'SQLITE_LOCKED',
    'SQLITE_PROTOCOL',
    'SQLITE_IOERR',
    'SQLITE_CORRUPT',
    'SQLITE_FULL',
    'SQLITE_CANTOPEN',
    'SQLITE_NOMEM',
  ]);

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
      correlationId: metadata?.correlationId as string,
    };

    const error = new BaseError(code, message, context);
    if (userMessage) {
      error.setUserMessage(userMessage);
    }
    return error;
  }

  /**
   * Creates a database error with proper SQLite error handling
   */
  static createDatabaseError(
    operation: string,
    originalError: Error,
    metadata?: Record<string, unknown>
  ): BaseError {
    // Extract SQLite error code if present
    const sqliteError = originalError as any;
    const sqliteCode = sqliteError.code?.startsWith?.('SQLITE_') ? sqliteError.code : undefined;
    const isTransient = sqliteCode
      ? this.TRANSIENT_SQLITE_ERRORS.has(sqliteCode)
      : isTransientError(originalError);

    return this.createError(
      'DATABASE_ERROR',
      originalError.message,
      operation,
      this.getSqliteUserMessage(originalError),
      {
        ...metadata,
        originalError: {
          name: originalError.name,
          message: originalError.message,
          stack: originalError.stack,
        },
        sqliteCode,
        isTransient,
        isDatabaseError: isDatabaseError(originalError),
      }
    );
  }

  /**
   * Creates a storage error with proper classification
   */
  static createStorageError(
    operation: string,
    originalError: Error,
    metadata?: Record<string, unknown>
  ): BaseError {
    // Check if this is a SQLite error
    const sqliteError = originalError as any;
    if (sqliteError.code?.startsWith?.('SQLITE_')) {
      return this.createDatabaseError(operation, originalError, metadata);
    }

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
          stack: originalError.stack,
        },
        isTransient: isTransientError(originalError),
        isDatabaseError: isDatabaseError(originalError),
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
    return this.createError('VALIDATION_ERROR', message, operation, 'Validation failed', details);
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
  static createPermissionError(operation: string, resource: string, action: string): BaseError {
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
      { ...metadata, duration, isTransient: true }
    );
  }

  /**
   * Gets user-friendly message for SQLite errors
   */
  private static getSqliteUserMessage(error: Error): string {
    const sqliteError = error as any;
    const sqliteCode = sqliteError.code?.startsWith?.('SQLITE_') ? sqliteError.code : undefined;
    if (!sqliteCode) {
      return 'A database error occurred';
    }

    switch (sqliteCode) {
      case 'SQLITE_BUSY':
        return 'The database is temporarily busy. Please try again.';
      case 'SQLITE_LOCKED':
        return 'The database is locked. Please try again.';
      case 'SQLITE_READONLY':
        return 'The database is in read-only mode.';
      case 'SQLITE_IOERR':
        return 'A database I/O error occurred.';
      case 'SQLITE_CORRUPT':
        return 'The database file is corrupted.';
      case 'SQLITE_NOTFOUND':
        return 'The requested database record was not found.';
      case 'SQLITE_FULL':
        return 'The database is full.';
      case 'SQLITE_CANTOPEN':
        return 'Could not open the database file.';
      case 'SQLITE_PROTOCOL':
        return 'Database protocol error occurred.';
      case 'SQLITE_SCHEMA':
        return 'Database schema has changed.';
      case 'SQLITE_CONSTRAINT':
        return 'A database constraint was violated.';
      case 'SQLITE_MISMATCH':
        return 'Data type mismatch in database operation.';
      case 'SQLITE_MISUSE':
        return 'Database API was used incorrectly.';
      case 'SQLITE_NOLFS':
        return 'Database operation not supported on this system.';
      case 'SQLITE_AUTH':
        return 'Database authentication failed.';
      case 'SQLITE_FORMAT':
        return 'Database file format error.';
      case 'SQLITE_RANGE':
        return 'Database operation out of range.';
      case 'SQLITE_NOTADB':
        return 'File is not a database file.';
      case 'SQLITE_NOTICE':
        return 'Database notice.';
      case 'SQLITE_WARNING':
        return 'Database warning.';
      case 'SQLITE_ROW':
        return 'Another database row is available.';
      case 'SQLITE_DONE':
        return 'Database operation completed.';
      default:
        return 'A database error occurred';
    }
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
      'SERVER_SHUTDOWN',
      'LOGGING_INIT',
      'LOGGING_WRITE',
    ] as const;

    // High severity errors that impact functionality
    const highSeverityErrors = [
      'TASK_NOT_FOUND',
      'STORAGE_TRANSACTION',
      'STORAGE_ROLLBACK',
      'STORAGE_COMMIT',
      'SERVER_CONNECTION',
      'SERVER_TIMEOUT',
      'SERVER_OVERLOAD',
      'LOGGING_ROTATION',
      'LOGGING_TRANSPORT',
    ] as const;

    // Medium severity errors that may need investigation
    const mediumSeverityErrors = [
      'TASK_VALIDATION',
      'TASK_DEPENDENCY',
      'TASK_STATUS',
      'CONFIG_MISSING',
      'CONFIG_INVALID',
      'TOOL_EXECUTION',
      'TOOL_TIMEOUT',
      'LOGGING_CONFIG',
      'LOGGING_LEVEL',
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
}

// Export createError function for backward compatibility
export const createError = ErrorFactory.createError.bind(ErrorFactory);
