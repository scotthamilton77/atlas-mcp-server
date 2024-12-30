import { SerializableError } from '../types/events.js';
import { BaseError } from '../errors/base-error.js';

/**
 * Gets all enumerable property names of an Error object,
 * including those from the prototype chain
 */
function getErrorPropertyNames(error: Error): string[] {
  const propertyNames = new Set<string>();
  let currentObj: any = error;

  while (currentObj && currentObj !== Object.prototype) {
    Object.getOwnPropertyNames(currentObj).forEach(name => propertyNames.add(name));
    currentObj = Object.getPrototypeOf(currentObj);
  }

  return Array.from(propertyNames);
}

/**
 * Converts an Error object to a SerializableError object
 * that can be safely stringified to JSON
 */
export function toSerializableError(err: Error | unknown): SerializableError {
  // Handle BaseError instances specially
  if (err instanceof BaseError) {
    return {
      name: err.name,
      code: err.code,
      message: err.message,
      userMessage: err.getUserMessage(),
      context: {
        operation: err.getOperation(),
        timestamp: err.getTimestamp(),
        severity: err.getSeverity(),
        correlationId: err.getCorrelationId(),
        metadata: err.getMetadata(),
      },
      stack: err.stack,
      details: err.getDetails(),
    };
  }

  // Convert unknown to Error
  const error: Error = err instanceof Error ? err : new Error(String(err));

  // Create base serializable error
  const serializableError: SerializableError = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };

  // Handle SQLite errors specially
  const sqliteError = error as any;
  if (
    sqliteError.code &&
    typeof sqliteError.code === 'string' &&
    sqliteError.code.startsWith('SQLITE_')
  ) {
    serializableError.code = sqliteError.code;
    serializableError.errno = sqliteError.errno;
    serializableError.sqliteCode = sqliteError.code;
    serializableError.sqlMessage = sqliteError.message;
  }

  // Add any additional serializable properties
  getErrorPropertyNames(error).forEach(key => {
    try {
      const value = (error as any)[key];
      // Skip if undefined, function, or symbol
      if (
        value === undefined ||
        typeof value === 'function' ||
        typeof value === 'symbol' ||
        key === 'stack' // Skip stack as it's already added
      ) {
        return;
      }

      // Handle nested errors
      if (value instanceof Error) {
        serializableError[key] = toSerializableError(value);
        return;
      }

      // Handle arrays of errors
      if (Array.isArray(value) && value.some(item => item instanceof Error)) {
        serializableError[key] = value.map(item =>
          item instanceof Error ? toSerializableError(item) : item
        );
        return;
      }

      // Handle objects that might contain errors
      if (value && typeof value === 'object') {
        try {
          // Test if object is JSON serializable
          JSON.stringify(value);
          serializableError[key] = value;
        } catch {
          // If not serializable, try to extract serializable properties
          const extracted: Record<string, unknown> = {};
          Object.entries(value).forEach(([k, v]) => {
            if (v instanceof Error) {
              extracted[k] = toSerializableError(v);
            } else if (v !== undefined && typeof v !== 'function' && typeof v !== 'symbol') {
              try {
                JSON.stringify(v);
                extracted[k] = v;
              } catch {
                extracted[k] = String(v);
              }
            }
          });
          serializableError[key] = extracted;
        }
        return;
      }

      // Only include if JSON serializable
      JSON.stringify(value);
      serializableError[key] = value;
    } catch {
      // If serialization fails, convert to string
      try {
        serializableError[key] = String(sqliteError[key]);
      } catch {
        // Skip if even string conversion fails
      }
    }
  });

  return serializableError;
}

/**
 * Extracts a clean stack trace from an error
 */
export function extractStackTrace(error: Error): string[] {
  const stack = error.stack || '';
  return stack
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('at '));
}

/**
 * Creates a condensed error summary for quick logging
 */
export function summarizeError(error: unknown): string {
  if (error instanceof BaseError) {
    return `${error.name} [${error.code}]: ${error.message}`;
  }
  if (error instanceof Error) {
    const sqliteError = error as any;
    if (
      sqliteError.code &&
      typeof sqliteError.code === 'string' &&
      sqliteError.code.startsWith('SQLITE_')
    ) {
      return `${error.name} [${sqliteError.code}]: ${error.message}`;
    }
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

/**
 * Determines if an error is a system error (e.g., ENOENT, EACCES)
 */
export function isSystemError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof (error as any).code === 'string' &&
    /^[A-Z][A-Z0-9_]*$/.test((error as any).code)
  );
}

/**
 * Determines if an error is a database-related error
 */
export function isDatabaseError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  // Check for SQLite error code
  const sqliteError = error as any;
  if (
    sqliteError.code &&
    typeof sqliteError.code === 'string' &&
    sqliteError.code.startsWith('SQLITE_')
  ) {
    return true;
  }

  // Check error message patterns
  const message = error.message.toLowerCase();
  return (
    message.includes('sqlite') ||
    message.includes('database') ||
    message.includes('db') ||
    message.includes('connection') ||
    message.includes('query') ||
    message.includes('sql')
  );
}

/**
 * Determines if an error is a network-related error
 */
export function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  // Check for system error codes related to network
  if (isSystemError(error)) {
    const networkCodes = new Set([
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'ENETUNREACH',
      'ENOTFOUND',
      'EPIPE',
    ]);
    return networkCodes.has((error as any).code);
  }

  // Check error message patterns
  const message = error.message.toLowerCase();
  return (
    message.includes('network') ||
    message.includes('connection') ||
    message.includes('timeout') ||
    message.includes('unreachable') ||
    message.includes('refused')
  );
}

/**
 * Determines if an error is likely transient and can be retried
 */
export function isTransientError(error: unknown): boolean {
  // Network errors are often transient
  if (isNetworkError(error)) return true;

  // Check for known transient SQLite errors
  if (error instanceof Error) {
    const sqliteError = error as any;
    if (sqliteError.code && typeof sqliteError.code === 'string') {
      const transientSqliteCodes = new Set([
        'SQLITE_BUSY',
        'SQLITE_LOCKED',
        'SQLITE_PROTOCOL',
        'SQLITE_IOERR',
        'SQLITE_CORRUPT',
        'SQLITE_FULL',
        'SQLITE_CANTOPEN',
        'SQLITE_NOMEM',
      ]);
      if (transientSqliteCodes.has(sqliteError.code)) {
        return true;
      }
    }
  }

  // Check for known transient database errors
  if (isDatabaseError(error)) {
    const message = (error as Error).message.toLowerCase();
    return (
      message.includes('busy') ||
      message.includes('locked') ||
      message.includes('timeout') ||
      message.includes('temporary')
    );
  }

  // Check for system error codes that indicate transient issues
  if (isSystemError(error)) {
    const transientCodes = new Set([
      'EAGAIN',
      'EBUSY',
      'ETIMEOUT',
      'ECONNRESET',
      'EPIPE',
      'EPROTO',
      'ETIMEDOUT',
    ]);
    return transientCodes.has((error as any).code);
  }

  return false;
}
