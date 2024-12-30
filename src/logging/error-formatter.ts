import { BaseError } from '../errors/base-error.js';
import { LogMetadata } from '../types/logging.js';

interface ErrorFormatterOptions {
  includeStack: boolean;
  redactSensitive: boolean;
  maxDepth: number;
  currentDepth: number;
  seen: WeakSet<object>;
}

type FormattedError = NonNullable<LogMetadata['error']>;

/**
 * Creates a new options object with updated depth
 */
function incrementDepth(options: ErrorFormatterOptions): ErrorFormatterOptions {
  return {
    includeStack: options.includeStack,
    redactSensitive: options.redactSensitive,
    maxDepth: options.maxDepth,
    currentDepth: options.currentDepth + 1,
    seen: options.seen,
  };
}

/**
 * Handles error formatting for logging with advanced features
 */
export class ErrorFormatter {
  // Sensitive keys that should be redacted
  private static readonly SENSITIVE_KEYS = new Set([
    'password',
    'secret',
    'token',
    'key',
    'auth',
    'credential',
    'private',
    'ssn',
    'credit',
    'apiKey',
    'accessToken',
    'refreshToken',
  ]);

  // Maximum depth for error object traversal
  private static readonly MAX_DEPTH = 10;

  /**
   * Formats an error for logging with proper handling of:
   * - Circular references
   * - Stack traces
   * - Nested errors
   * - Sensitive data
   * - Custom error types
   */
  static format(
    error: unknown,
    options: {
      includeStack?: boolean;
      redactSensitive?: boolean;
      maxDepth?: number;
    } = {}
  ): FormattedError {
    const {
      includeStack = true,
      redactSensitive = true,
      maxDepth = ErrorFormatter.MAX_DEPTH,
    } = options;

    // Handle null/undefined
    if (!error) {
      return {
        name: 'NoError',
        message: 'No error provided',
      };
    }

    try {
      // Track seen objects for circular reference detection
      const seen = new WeakSet();

      // Format the error object
      return ErrorFormatter.formatErrorObject(error, {
        includeStack,
        redactSensitive,
        maxDepth,
        currentDepth: 0,
        seen,
      });
    } catch (formatError) {
      // Fallback if formatting fails
      return {
        name: 'ErrorFormattingFailed',
        message: 'Failed to format error',
        details: {
          originalError: String(error),
          formattingError: String(formatError),
        },
      };
    }
  }

  /**
   * Formats an error object with proper type handling
   */
  private static formatErrorObject(error: unknown, options: ErrorFormatterOptions): FormattedError {
    const { includeStack, redactSensitive, maxDepth, currentDepth, seen } = options;

    // Check depth limit
    if (currentDepth >= maxDepth) {
      return {
        name: 'MaxDepthExceeded',
        message: 'Maximum error depth exceeded',
      };
    }

    // Handle BaseError instances
    if (error instanceof BaseError) {
      const formatted: FormattedError = {
        name: error.name,
        message: error.message,
        code: error.code,
        stack: includeStack ? error.stack : undefined,
      };

      const details = this.sanitizeErrorDetails(error.details, incrementDepth(options));
      if (details !== undefined) {
        formatted.details = details;
      }

      return formatted;
    }

    // Handle standard Error instances
    if (error instanceof Error) {
      const formatted: FormattedError = {
        name: error.name,
        message: error.message,
        stack: includeStack ? error.stack : undefined,
      };

      // Handle SQLite errors
      const sqliteError = error as any;
      if (
        sqliteError.code &&
        typeof sqliteError.code === 'string' &&
        sqliteError.code.startsWith('SQLITE_')
      ) {
        formatted.code = sqliteError.code;
        formatted.details = {
          errno: sqliteError.errno,
          sqliteCode: sqliteError.code,
          sqlMessage: sqliteError.message,
        };
      }

      // Add any additional properties
      const additionalProps = this.extractErrorProperties(error, options);
      if (Object.keys(additionalProps).length > 0) {
        formatted.details = formatted.details || {};
        Object.assign(formatted.details as Record<string, unknown>, additionalProps);
      }

      return formatted;
    }

    // Handle plain objects
    if (error && typeof error === 'object') {
      // Check for circular references
      if (seen.has(error as object)) {
        return {
          name: 'CircularReference',
          message: 'Circular reference detected',
        };
      }

      seen.add(error as object);

      // Convert object to sanitized format
      const sanitized = this.sanitizeObject(error, incrementDepth(options));

      return {
        name: 'ObjectError',
        message: 'Error object encountered',
        details: sanitized,
      };
    }

    // Handle primitives
    return {
      name: 'UnknownError',
      message: String(error),
      details: {
        type: typeof error,
        value: redactSensitive ? '[Redacted]' : String(error),
      },
    };
  }

  /**
   * Extracts additional properties from an error object
   */
  private static extractErrorProperties(
    error: Error,
    options: ErrorFormatterOptions
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const seen = new Set(['name', 'message', 'stack', 'code', 'errno']);

    // Get all properties including non-enumerable ones
    const props = Object.getOwnPropertyNames(error);
    for (const prop of props) {
      if (seen.has(prop)) continue;

      const value = (error as any)[prop];
      if (value === undefined || typeof value === 'function') continue;

      if (value instanceof Error) {
        result[prop] = this.formatErrorObject(value, incrementDepth(options));
      } else if (typeof value === 'object' && value !== null) {
        result[prop] = this.sanitizeObject(value, incrementDepth(options));
      } else {
        result[prop] = value;
      }
    }

    return result;
  }

  /**
   * Sanitizes error details by handling circular references and sensitive data
   */
  private static sanitizeErrorDetails(details: unknown, options: ErrorFormatterOptions): unknown {
    if (!details || typeof details !== 'object') {
      return details;
    }

    if (options.seen.has(details as object)) {
      return '[Circular Reference]';
    }

    return this.sanitizeObject(details, options);
  }

  /**
   * Sanitizes an object by handling sensitive data and circular references
   */
  private static sanitizeObject(obj: unknown, options: ErrorFormatterOptions): unknown {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    const { redactSensitive, maxDepth, currentDepth } = options;

    // Check depth limit
    if (currentDepth >= maxDepth) {
      return '[Max Depth Exceeded]';
    }

    // Handle arrays
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item, incrementDepth(options)));
    }

    // Handle objects
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      // Check if key contains sensitive information
      if (redactSensitive && this.isSensitiveKey(key)) {
        result[key] = '[Redacted]';
        continue;
      }

      // Handle Error objects specially
      if (value instanceof Error) {
        result[key] = this.formatErrorObject(value, incrementDepth(options));
        continue;
      }

      // Recursively sanitize value
      result[key] = this.sanitizeObject(value, incrementDepth(options));
    }

    return result;
  }

  /**
   * Checks if a key might contain sensitive information
   */
  private static isSensitiveKey(key: string): boolean {
    const lowerKey = key.toLowerCase();
    return Array.from(ErrorFormatter.SENSITIVE_KEYS).some(sensitive =>
      lowerKey.includes(sensitive.toLowerCase())
    );
  }

  /**
   * Extracts a clean stack trace from an error
   */
  static extractStackTrace(error: Error): string[] {
    const stack = error.stack || '';
    return stack
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('at '));
  }

  /**
   * Creates a condensed error summary for quick logging
   */
  static summarize(error: unknown): string {
    const formatted = this.format(error, { includeStack: false });
    if (!formatted) {
      return 'Unknown error';
    }

    const { name = 'UnknownError', message = 'No message', code } = formatted;
    const sqliteError = error as any;
    if (sqliteError?.code?.startsWith?.('SQLITE_')) {
      return `${name} [${sqliteError.code}]: ${message}`;
    }
    return `${name}${code ? ` [${code}]` : ''}: ${message}`;
  }
}
