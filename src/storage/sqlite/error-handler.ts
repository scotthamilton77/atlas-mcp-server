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
  return createError(code, message, `SqliteStorage.${operation}`, userMessage, metadata);
}

/**
 * SQLite error codes and their meanings
 */
export const SQLITE_ERROR_CODES = {
  SQLITE_CANTOPEN: 14, // Unable to open database file
  SQLITE_CORRUPT: 11, // Database file is corrupt
  SQLITE_FULL: 13, // Disk full or quota exceeded
  SQLITE_IOERR: 10, // I/O error during operation
  SQLITE_LOCKED: 6, // Database is locked
  SQLITE_NOTADB: 26, // File is not a database
  SQLITE_READONLY: 8, // Attempt to write to readonly database
  SQLITE_BUSY: 5, // Database is busy
};

/**
 * Helper function to format error details for logging and error creation
 */
interface SqliteErrorDetails {
  code?: string | number;
  errno?: number;
  syscall?: string;
  description?: string;
}

interface ErrorDetails extends Record<string, unknown> {
  name: string;
  message: string;
  stack?: string;
  sqliteError?: SqliteErrorDetails;
  customProps?: Record<string, unknown>;
}

export function formatErrorDetails(error: unknown): ErrorDetails {
  if (error instanceof Error) {
    const details: ErrorDetails = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };

    // Extract SQLite-specific error information
    if ('code' in error || 'errno' in error) {
      const errorObj = error as any;
      const sqliteError: SqliteErrorDetails = {
        code: errorObj.code,
        errno: errorObj.errno,
        syscall: errorObj.syscall,
      };

      // Map SQLite error codes to meaningful messages
      if (sqliteError.errno) {
        switch (sqliteError.errno) {
          case SQLITE_ERROR_CODES.SQLITE_CANTOPEN:
            sqliteError.description = 'Unable to open database file';
            break;
          case SQLITE_ERROR_CODES.SQLITE_CORRUPT:
            sqliteError.description = 'Database file is corrupt';
            break;
          case SQLITE_ERROR_CODES.SQLITE_FULL:
            sqliteError.description = 'Disk full or quota exceeded';
            break;
          case SQLITE_ERROR_CODES.SQLITE_IOERR:
            sqliteError.description = 'I/O error during operation';
            break;
          case SQLITE_ERROR_CODES.SQLITE_LOCKED:
            sqliteError.description = 'Database is locked';
            break;
          case SQLITE_ERROR_CODES.SQLITE_NOTADB:
            sqliteError.description = 'File is not a database';
            break;
          case SQLITE_ERROR_CODES.SQLITE_READONLY:
            sqliteError.description = 'Attempt to write to readonly database';
            break;
          case SQLITE_ERROR_CODES.SQLITE_BUSY:
            sqliteError.description = 'Database is busy';
            break;
        }
      }
      details.sqliteError = sqliteError;
    }

    // Include any additional custom properties
    details.customProps = Object.getOwnPropertyNames(error).reduce(
      (acc, key) => {
        if (!['name', 'message', 'stack', 'code', 'errno', 'syscall'].includes(key)) {
          acc[key] = (error as any)[key];
        }
        return acc;
      },
      {} as Record<string, unknown>
    );

    return details;
  }
  return {
    name: 'UnknownError',
    message: String(error),
    error,
  };
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
  handleError(error: unknown, operation: string, context?: Record<string, unknown>): never {
    const errorDetails = formatErrorDetails(error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Enhanced error logging with operation context
    this.logger.error(`Failed to ${operation}`, {
      error: errorDetails,
      context: {
        ...context,
        operation,
        timestamp: Date.now(),
      },
    });

    // Log additional SQLite-specific details if available
    if (errorDetails.sqliteError) {
      this.logger.error('SQLite error details', {
        sqliteError: errorDetails.sqliteError,
        operation,
      });
    }

    throw createStorageError(
      ErrorCodes.STORAGE_ERROR,
      `Failed to ${operation}`,
      operation,
      `Storage operation failed: ${errorMessage}`,
      {
        ...context,
        error: errorDetails,
      }
    );
  }

  /**
   * Handles initialization errors with detailed logging
   */
  handleInitError(error: unknown, config: Record<string, unknown>): never {
    const errorDetails = formatErrorDetails(error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Enhanced initialization error logging
    this.logger.error('Failed to initialize SQLite storage', {
      error: errorDetails,
      context: {
        config,
        timestamp: Date.now(),
        operation: 'initialize',
      },
    });

    // Log SQLite-specific initialization details
    if (errorDetails.sqliteError) {
      this.logger.error('SQLite initialization error details', {
        sqliteError: errorDetails.sqliteError,
        dbPath: config.baseDir ? `${config.baseDir}/${config.name}.db` : undefined,
        config: {
          baseDir: config.baseDir,
          name: config.name,
        },
      });
    }

    throw createStorageError(
      ErrorCodes.STORAGE_INIT,
      'Failed to initialize SQLite storage',
      'initialize',
      `Storage initialization failed: ${errorMessage}`,
      {
        config,
        error: errorDetails,
      }
    );
  }
}
