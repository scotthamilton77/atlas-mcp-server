export * from './base-error.js';
export * from './config-error.js';
export * from './storage-error.js';
export * from './task-error.js';
export * from './tool-error.js';
export * from './logging-error.js';
export * from './error-factory.js';

// Re-export error types
export { ErrorCode, ErrorCodes, ErrorContext, ErrorSeverity } from '../types/error.js';

// Error code categories for grouping and filtering
export const ErrorCategories = {
  TASK: 'TASK',
  STORAGE: 'STORAGE',
  CONFIG: 'CONFIG',
  TOOL: 'TOOL',
  SYSTEM: 'SYSTEM',
  LOGGING: 'LOGGING',
  VALIDATION: 'VALIDATION',
  AUTH: 'AUTH',
  IO: 'IO',
  CACHE: 'CACHE',
  EVENT: 'EVENT',
  GENERIC: 'GENERIC',
} as const;

export type ErrorCategory = (typeof ErrorCategories)[keyof typeof ErrorCategories];

// Map error codes to categories
export const errorCodeCategories: Record<string, ErrorCategory> = {
  // Task errors
  TASK_NOT_FOUND: ErrorCategories.TASK,
  TASK_VALIDATION: ErrorCategories.TASK,
  TASK_DEPENDENCY: ErrorCategories.TASK,
  TASK_STATUS: ErrorCategories.TASK,
  TASK_OPERATION_FAILED: ErrorCategories.TASK,
  TASK_INITIALIZATION: ErrorCategories.TASK,
  TASK_DUPLICATE: ErrorCategories.TASK,
  TASK_INVALID_TYPE: ErrorCategories.TASK,
  TASK_INVALID_STATUS: ErrorCategories.TASK,
  TASK_INVALID_PARENT: ErrorCategories.TASK,
  TASK_INVALID_PATH: ErrorCategories.TASK,
  TASK_PARENT_NOT_FOUND: ErrorCategories.TASK,
  TASK_PARENT_TYPE: ErrorCategories.TASK,
  TASK_CYCLE: ErrorCategories.TASK,

  // Storage errors
  STORAGE_INIT: ErrorCategories.STORAGE,
  STORAGE_CONNECTION: ErrorCategories.STORAGE,
  STORAGE_QUERY: ErrorCategories.STORAGE,
  STORAGE_TRANSACTION: ErrorCategories.STORAGE,
  STORAGE_MIGRATION: ErrorCategories.STORAGE,
  STORAGE_BACKUP: ErrorCategories.STORAGE,
  STORAGE_INTEGRITY: ErrorCategories.STORAGE,
  STORAGE_READ: ErrorCategories.STORAGE,
  STORAGE_WRITE: ErrorCategories.STORAGE,
  STORAGE_DELETE: ErrorCategories.STORAGE,
  STORAGE_ROLLBACK: ErrorCategories.STORAGE,
  STORAGE_COMMIT: ErrorCategories.STORAGE,
  STORAGE_PERMISSION: ErrorCategories.STORAGE,
  STORAGE_NOT_FOUND: ErrorCategories.STORAGE,
  STORAGE_ERROR: ErrorCategories.STORAGE,
  DATABASE_ERROR: ErrorCategories.STORAGE,

  // Config errors
  CONFIG_INVALID: ErrorCategories.CONFIG,
  CONFIG_MISSING: ErrorCategories.CONFIG,
  CONFIG_TYPE: ErrorCategories.CONFIG,
  CONFIG_VALIDATION: ErrorCategories.CONFIG,
  CONFIG_REQUIRED: ErrorCategories.CONFIG,

  // Tool errors
  TOOL_NOT_FOUND: ErrorCategories.TOOL,
  TOOL_EXECUTION: ErrorCategories.TOOL,
  TOOL_TIMEOUT: ErrorCategories.TOOL,
  TOOL_VALIDATION: ErrorCategories.TOOL,
  TOOL_INITIALIZATION: ErrorCategories.TOOL,
  TOOL_PERMISSION: ErrorCategories.TOOL,

  // System errors
  SYSTEM_RESOURCE: ErrorCategories.SYSTEM,
  SYSTEM_MEMORY: ErrorCategories.SYSTEM,
  SYSTEM_DISK: ErrorCategories.SYSTEM,
  SYSTEM_NETWORK: ErrorCategories.SYSTEM,
  SYSTEM_TIMEOUT: ErrorCategories.SYSTEM,
  TIMEOUT: ErrorCategories.SYSTEM,
  TIMEOUT_ERROR: ErrorCategories.SYSTEM,
  CONCURRENCY_ERROR: ErrorCategories.SYSTEM,

  // Logging errors
  LOGGING_INIT: ErrorCategories.LOGGING,
  LOGGING_WRITE: ErrorCategories.LOGGING,
  LOGGING_READ: ErrorCategories.LOGGING,
  LOGGING_ROTATION: ErrorCategories.LOGGING,
  LOGGING_TRANSPORT: ErrorCategories.LOGGING,
  LOGGING_CONFIG: ErrorCategories.LOGGING,
  LOGGING_LEVEL: ErrorCategories.LOGGING,
  LOGGING_FORMAT: ErrorCategories.LOGGING,
  LOGGING_PERMISSION: ErrorCategories.LOGGING,
  LOGGING_DIRECTORY: ErrorCategories.LOGGING,

  // IO errors
  IO_READ: ErrorCategories.IO,
  IO_WRITE: ErrorCategories.IO,
  IO_PERMISSION: ErrorCategories.IO,
  IO_NOT_FOUND: ErrorCategories.IO,

  // Cache errors
  CACHE_MISS: ErrorCategories.CACHE,
  CACHE_INVALID: ErrorCategories.CACHE,
  CACHE_FULL: ErrorCategories.CACHE,
  CACHE_CORRUPTION: ErrorCategories.CACHE,

  // Event errors
  EVENT_INVALID: ErrorCategories.EVENT,
  EVENT_HANDLER: ErrorCategories.EVENT,
  EVENT_DISPATCH: ErrorCategories.EVENT,
  EVENT_SUBSCRIPTION: ErrorCategories.EVENT,

  // Validation errors
  VALIDATION_TYPE: ErrorCategories.VALIDATION,
  VALIDATION_RANGE: ErrorCategories.VALIDATION,
  VALIDATION_FORMAT: ErrorCategories.VALIDATION,
  VALIDATION_CONSTRAINT: ErrorCategories.VALIDATION,
  VALIDATION_ERROR: ErrorCategories.VALIDATION,

  // Auth errors
  AUTH_INVALID: ErrorCategories.AUTH,
  AUTH_EXPIRED: ErrorCategories.AUTH,
  AUTH_MISSING: ErrorCategories.AUTH,
  AUTH_FORBIDDEN: ErrorCategories.AUTH,
  PERMISSION_DENIED: ErrorCategories.AUTH,

  // Generic errors
  INVALID_INPUT: ErrorCategories.GENERIC,
  INVALID_STATE: ErrorCategories.GENERIC,
  OPERATION_FAILED: ErrorCategories.GENERIC,
  NOT_IMPLEMENTED: ErrorCategories.GENERIC,
  INTERNAL_ERROR: ErrorCategories.GENERIC,
};

/**
 * Gets the category for an error code
 */
export function getErrorCategory(code: string): ErrorCategory {
  return errorCodeCategories[code] || ErrorCategories.GENERIC;
}
