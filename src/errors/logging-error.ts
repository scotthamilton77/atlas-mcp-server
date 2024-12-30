import { BaseError } from './base-error.js';
import { ErrorCode, ErrorContext, ErrorSeverity } from '../types/error.js';

/**
 * Logging-specific error codes
 */
export const LoggingErrorCodes = {
  LOGGING_INIT: 'LOGGING_INIT' as const,
  LOGGING_WRITE: 'LOGGING_WRITE' as const,
  LOGGING_READ: 'LOGGING_READ' as const,
  LOGGING_ROTATION: 'LOGGING_ROTATION' as const,
  LOGGING_TRANSPORT: 'LOGGING_TRANSPORT' as const,
  LOGGING_CONFIG: 'LOGGING_CONFIG' as const,
  LOGGING_LEVEL: 'LOGGING_LEVEL' as const,
  LOGGING_FORMAT: 'LOGGING_FORMAT' as const,
  LOGGING_PERMISSION: 'LOGGING_PERMISSION' as const,
  LOGGING_DIRECTORY: 'LOGGING_DIRECTORY' as const,
} as const;

export type LoggingErrorCode = (typeof LoggingErrorCodes)[keyof typeof LoggingErrorCodes];

/**
 * Factory for creating logging-specific errors
 */
export class LoggingErrorFactory {
  /**
   * Creates a logging error with context
   */
  private static createError(
    code: LoggingErrorCode,
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
      component: 'Logging',
    };

    return new BaseError(code as ErrorCode, message, context);
  }

  /**
   * Creates an initialization error
   */
  static createInitError(
    operation: string,
    error: Error,
    metadata?: Record<string, unknown>
  ): BaseError {
    return this.createError(
      LoggingErrorCodes.LOGGING_INIT,
      `Failed to initialize logging: ${error.message}`,
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
   * Creates a write error
   */
  static createWriteError(
    operation: string,
    error: Error,
    metadata?: Record<string, unknown>
  ): BaseError {
    return this.createError(
      LoggingErrorCodes.LOGGING_WRITE,
      `Failed to write log entry: ${error.message}`,
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
   * Creates a rotation error
   */
  static createRotationError(
    operation: string,
    error: Error,
    metadata?: Record<string, unknown>
  ): BaseError {
    return this.createError(
      LoggingErrorCodes.LOGGING_ROTATION,
      `Failed to rotate log file: ${error.message}`,
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
   * Creates a transport error
   */
  static createTransportError(
    operation: string,
    error: Error,
    metadata?: Record<string, unknown>
  ): BaseError {
    return this.createError(
      LoggingErrorCodes.LOGGING_TRANSPORT,
      `Transport error: ${error.message}`,
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
   * Creates a configuration error
   */
  static createConfigError(
    operation: string,
    message: string,
    metadata?: Record<string, unknown>
  ): BaseError {
    return this.createError(LoggingErrorCodes.LOGGING_CONFIG, message, operation, metadata);
  }

  /**
   * Creates a level validation error
   */
  static createLevelError(operation: string, level: string, validLevels: string[]): BaseError {
    return this.createError(
      LoggingErrorCodes.LOGGING_LEVEL,
      `Invalid log level: ${level}. Valid levels are: ${validLevels.join(', ')}`,
      operation,
      { level, validLevels }
    );
  }

  /**
   * Creates a directory error
   */
  static createDirectoryError(operation: string, path: string, error: Error): BaseError {
    return this.createError(
      LoggingErrorCodes.LOGGING_DIRECTORY,
      `Failed to access log directory ${path}: ${error.message}`,
      operation,
      {
        path,
        originalError: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      }
    );
  }

  /**
   * Creates a permission error
   */
  static createPermissionError(operation: string, path: string, error: Error): BaseError {
    return this.createError(
      LoggingErrorCodes.LOGGING_PERMISSION,
      `Permission denied for log file ${path}: ${error.message}`,
      operation,
      {
        path,
        originalError: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      }
    );
  }
}
