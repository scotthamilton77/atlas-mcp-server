import { BaseError } from './base-error.js';
import { ConfigError } from './config-error.js';
import { TaskError } from './task-error.js';
import { StorageError } from './storage-error.js';
import { ToolError } from './tool-error.js';
import { ErrorFactory } from './error-factory.js';
import { ErrorCode, ErrorCodes as TypedErrorCodes } from '../types/error.js';

// Re-export error types and utilities
export { BaseError, ConfigError, TaskError, StorageError, ToolError, ErrorFactory };

// Export error codes enum
export const ErrorCodes = TypedErrorCodes;

// Export error code type
export type { ErrorCode };

// Export error factory function
export const createError = ErrorFactory.createError.bind(ErrorFactory);

// Export error utilities
export const isBaseError = (error: unknown): error is BaseError => {
  return error instanceof BaseError;
};

export const isConfigError = (error: unknown): error is ConfigError => {
  return error instanceof ConfigError;
};

export const isTaskError = (error: unknown): error is TaskError => {
  return error instanceof TaskError;
};

export const isStorageError = (error: unknown): error is StorageError => {
  return error instanceof StorageError;
};

export const isToolError = (error: unknown): error is ToolError => {
  return error instanceof ToolError;
};

export const formatError = (error: unknown): Record<string, unknown> => {
  if (error instanceof BaseError) {
    return {
      code: error.code,
      message: error.message,
      operation: error.getOperation(),
      userMessage: error.getUserMessage(),
      metadata: error.getMetadata(),
      stack: error.stack,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
    };
  }

  return { error };
};

export const getErrorCode = (error: unknown): ErrorCode => {
  if (error instanceof BaseError) {
    return error.code;
  }
  return ErrorCodes.INTERNAL_ERROR;
};

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof BaseError) {
    return error.getUserMessage() || error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

// Export error creation helpers
export const createTaskError = TaskError;
export const createConfigError = ConfigError;
export const createStorageError = StorageError;
export const createToolError = ToolError;

// Define error code arrays with proper typing
const taskErrorCodes = [
  ErrorCodes.TASK_NOT_FOUND,
  ErrorCodes.TASK_VALIDATION,
  ErrorCodes.TASK_DEPENDENCY,
  ErrorCodes.TASK_STATUS,
  ErrorCodes.TASK_DUPLICATE,
  ErrorCodes.TASK_INVALID_TYPE,
  ErrorCodes.TASK_INVALID_STATUS,
  ErrorCodes.TASK_INVALID_PARENT,
  ErrorCodes.TASK_OPERATION_FAILED,
  ErrorCodes.TASK_INVALID_PATH,
  ErrorCodes.TASK_PARENT_NOT_FOUND,
  ErrorCodes.TASK_PARENT_TYPE,
  ErrorCodes.TASK_CYCLE,
] as const;

const configErrorCodes = [
  ErrorCodes.CONFIG_MISSING,
  ErrorCodes.CONFIG_INVALID,
  ErrorCodes.CONFIG_TYPE,
  ErrorCodes.CONFIG_VALIDATION,
  ErrorCodes.CONFIG_REQUIRED,
] as const;

const storageErrorCodes = [
  ErrorCodes.STORAGE_READ,
  ErrorCodes.STORAGE_WRITE,
  ErrorCodes.STORAGE_INIT,
  ErrorCodes.STORAGE_DELETE,
  ErrorCodes.STORAGE_PERMISSION,
  ErrorCodes.STORAGE_NOT_FOUND,
  ErrorCodes.STORAGE_TRANSACTION,
  ErrorCodes.STORAGE_ROLLBACK,
  ErrorCodes.STORAGE_COMMIT,
  ErrorCodes.STORAGE_ERROR,
  ErrorCodes.DATABASE_ERROR,
] as const;

const toolErrorCodes = [
  ErrorCodes.TOOL_NOT_FOUND,
  ErrorCodes.TOOL_EXECUTION,
  ErrorCodes.TOOL_VALIDATION,
  ErrorCodes.TOOL_TIMEOUT,
  ErrorCodes.TOOL_PERMISSION,
] as const;

const systemErrorCodes = [
  ErrorCodes.INTERNAL_ERROR,
  ErrorCodes.INVALID_INPUT,
  ErrorCodes.OPERATION_FAILED,
  ErrorCodes.VALIDATION_ERROR,
  ErrorCodes.PERMISSION_DENIED,
  ErrorCodes.NOT_IMPLEMENTED,
  ErrorCodes.TIMEOUT,
  ErrorCodes.TIMEOUT_ERROR,
  ErrorCodes.CONCURRENCY_ERROR,
] as const;

// Export error categories
export const ErrorCategories = {
  TASK: taskErrorCodes,
  CONFIG: configErrorCodes,
  STORAGE: storageErrorCodes,
  TOOL: toolErrorCodes,
  SYSTEM: systemErrorCodes,
} as const;

export type ErrorCategory = keyof typeof ErrorCategories;

// Export error category helpers
export const getErrorCategory = (code: ErrorCode): ErrorCategory | undefined => {
  for (const [category, codes] of Object.entries(ErrorCategories)) {
    if ((codes as readonly ErrorCode[]).includes(code)) {
      return category as ErrorCategory;
    }
  }
  return undefined;
};

export const isTaskErrorCode = (code: ErrorCode): boolean => {
  return taskErrorCodes.includes(code as (typeof taskErrorCodes)[number]);
};

export const isConfigErrorCode = (code: ErrorCode): boolean => {
  return configErrorCodes.includes(code as (typeof configErrorCodes)[number]);
};

export const isStorageErrorCode = (code: ErrorCode): boolean => {
  return storageErrorCodes.includes(code as (typeof storageErrorCodes)[number]);
};

export const isToolErrorCode = (code: ErrorCode): boolean => {
  return toolErrorCodes.includes(code as (typeof toolErrorCodes)[number]);
};

export const isSystemErrorCode = (code: ErrorCode): boolean => {
  return systemErrorCodes.includes(code as (typeof systemErrorCodes)[number]);
};

// Export error type guards
export const isTaskNotFoundError = (error: unknown): error is TaskError => {
  return isTaskError(error) && error.code === ErrorCodes.TASK_NOT_FOUND;
};

export const isTaskValidationError = (error: unknown): error is TaskError => {
  return isTaskError(error) && error.code === ErrorCodes.TASK_VALIDATION;
};

export const isStorageInitError = (error: unknown): error is StorageError => {
  return isStorageError(error) && error.code === ErrorCodes.STORAGE_INIT;
};

export const isDatabaseError = (error: unknown): error is StorageError => {
  return isStorageError(error) && error.code === ErrorCodes.DATABASE_ERROR;
};

export const isConfigValidationError = (error: unknown): error is ConfigError => {
  return isConfigError(error) && error.code === ErrorCodes.CONFIG_VALIDATION;
};

export const isToolExecutionError = (error: unknown): error is ToolError => {
  return isToolError(error) && error.code === ErrorCodes.TOOL_EXECUTION;
};

export const isToolTimeoutError = (error: unknown): error is ToolError => {
  return isToolError(error) && error.code === ErrorCodes.TOOL_TIMEOUT;
};

export const isPermissionError = (error: unknown): error is BaseError => {
  return isBaseError(error) && error.code === ErrorCodes.PERMISSION_DENIED;
};
