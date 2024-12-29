import { BaseError } from '../errors/base-error.js';
import { LogMetadata } from '../types/logging.js';

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
  ): LogMetadata['error'] {
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
  private static formatErrorObject(
    error: unknown,
    options: {
      includeStack: boolean;
      redactSensitive: boolean;
      maxDepth: number;
      currentDepth: number;
      seen: WeakSet<object>;
    }
  ): LogMetadata['error'] {
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
      return {
        name: error.name,
        message: error.message,
        code: error.code,
        details: this.sanitizeErrorDetails(error.details, {
          ...options,
          currentDepth: currentDepth + 1,
        }),
        stack: includeStack ? error.stack : undefined,
      };
    }

    // Handle standard Error instances
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: includeStack ? error.stack : undefined,
      };
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
      const sanitized = this.sanitizeObject(error, {
        ...options,
        currentDepth: currentDepth + 1,
      });

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
   * Sanitizes error details by handling circular references and sensitive data
   */
  private static sanitizeErrorDetails(
    details: unknown,
    options: {
      redactSensitive: boolean;
      maxDepth: number;
      currentDepth: number;
      seen: WeakSet<object>;
    }
  ): unknown {
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
  private static sanitizeObject(
    obj: unknown,
    options: {
      redactSensitive: boolean;
      maxDepth: number;
      currentDepth: number;
      seen: WeakSet<object>;
    }
  ): unknown {
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
      return obj.map(item =>
        this.sanitizeObject(item, {
          ...options,
          currentDepth: currentDepth + 1,
        })
      );
    }

    // Handle objects
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      // Check if key contains sensitive information
      if (redactSensitive && this.isSensitiveKey(key)) {
        result[key] = '[Redacted]';
        continue;
      }

      // Recursively sanitize value
      result[key] = this.sanitizeObject(value, {
        ...options,
        currentDepth: currentDepth + 1,
      });
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
    return `${name}: ${message}${code ? ` (${code})` : ''}`;
  }
}
