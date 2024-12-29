/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'LOW', // Minor issues, system continues normally
  MEDIUM = 'MEDIUM', // Significant issues, operation failed but system stable
  HIGH = 'HIGH', // Critical issues, system stability may be affected
  CRITICAL = 'CRITICAL', // Severe issues, system stability compromised
}

/**
 * Error codes for different types of errors
 */
export const ErrorCodes = {
  // Task errors
  TASK_NOT_FOUND: 'TASK_NOT_FOUND' as const,
  TASK_VALIDATION: 'TASK_VALIDATION' as const,
  TASK_DEPENDENCY: 'TASK_DEPENDENCY' as const,
  TASK_STATUS: 'TASK_STATUS' as const,
  TASK_OPERATION_FAILED: 'TASK_OPERATION_FAILED' as const,
  TASK_INITIALIZATION: 'TASK_INITIALIZATION' as const,
  TASK_DUPLICATE: 'TASK_DUPLICATE' as const,
  TASK_INVALID_TYPE: 'TASK_INVALID_TYPE' as const,
  TASK_INVALID_STATUS: 'TASK_INVALID_STATUS' as const,
  TASK_INVALID_PARENT: 'TASK_INVALID_PARENT' as const,
  TASK_INVALID_PATH: 'TASK_INVALID_PATH' as const,
  TASK_PARENT_NOT_FOUND: 'TASK_PARENT_NOT_FOUND' as const,
  TASK_PARENT_TYPE: 'TASK_PARENT_TYPE' as const,
  TASK_CYCLE: 'TASK_CYCLE' as const,

  // Storage errors
  STORAGE_INIT: 'STORAGE_INIT' as const,
  STORAGE_CONNECTION: 'STORAGE_CONNECTION' as const,
  STORAGE_QUERY: 'STORAGE_QUERY' as const,
  STORAGE_TRANSACTION: 'STORAGE_TRANSACTION' as const,
  STORAGE_MIGRATION: 'STORAGE_MIGRATION' as const,
  STORAGE_BACKUP: 'STORAGE_BACKUP' as const,
  STORAGE_INTEGRITY: 'STORAGE_INTEGRITY' as const,
  STORAGE_READ: 'STORAGE_READ' as const,
  STORAGE_WRITE: 'STORAGE_WRITE' as const,
  STORAGE_DELETE: 'STORAGE_DELETE' as const,
  STORAGE_ROLLBACK: 'STORAGE_ROLLBACK' as const,
  STORAGE_COMMIT: 'STORAGE_COMMIT' as const,
  STORAGE_PERMISSION: 'STORAGE_PERMISSION' as const,
  STORAGE_NOT_FOUND: 'STORAGE_NOT_FOUND' as const,
  STORAGE_ERROR: 'STORAGE_ERROR' as const,
  DATABASE_ERROR: 'DATABASE_ERROR' as const,

  // Configuration errors
  CONFIG_INVALID: 'CONFIG_INVALID' as const,
  CONFIG_MISSING: 'CONFIG_MISSING' as const,
  CONFIG_TYPE: 'CONFIG_TYPE' as const,
  CONFIG_VALIDATION: 'CONFIG_VALIDATION' as const,
  CONFIG_REQUIRED: 'CONFIG_REQUIRED' as const,

  // Tool errors
  TOOL_NOT_FOUND: 'TOOL_NOT_FOUND' as const,
  TOOL_EXECUTION: 'TOOL_EXECUTION' as const,
  TOOL_TIMEOUT: 'TOOL_TIMEOUT' as const,
  TOOL_VALIDATION: 'TOOL_VALIDATION' as const,
  TOOL_INITIALIZATION: 'TOOL_INITIALIZATION' as const,
  TOOL_PERMISSION: 'TOOL_PERMISSION' as const,

  // System errors
  SYSTEM_RESOURCE: 'SYSTEM_RESOURCE' as const,
  SYSTEM_MEMORY: 'SYSTEM_MEMORY' as const,
  SYSTEM_DISK: 'SYSTEM_DISK' as const,
  SYSTEM_NETWORK: 'SYSTEM_NETWORK' as const,
  SYSTEM_TIMEOUT: 'SYSTEM_TIMEOUT' as const,
  TIMEOUT: 'TIMEOUT' as const,
  TIMEOUT_ERROR: 'TIMEOUT_ERROR' as const,
  CONCURRENCY_ERROR: 'CONCURRENCY_ERROR' as const,

  // Transaction errors
  TRANSACTION_ERROR: 'TRANSACTION_ERROR' as const,

  // Input/Output errors
  IO_READ: 'IO_READ' as const,
  IO_WRITE: 'IO_WRITE' as const,
  IO_PERMISSION: 'IO_PERMISSION' as const,
  IO_NOT_FOUND: 'IO_NOT_FOUND' as const,

  // Cache errors
  CACHE_MISS: 'CACHE_MISS' as const,
  CACHE_INVALID: 'CACHE_INVALID' as const,
  CACHE_FULL: 'CACHE_FULL' as const,
  CACHE_CORRUPTION: 'CACHE_CORRUPTION' as const,

  // Event errors
  EVENT_INVALID: 'EVENT_INVALID' as const,
  EVENT_HANDLER: 'EVENT_HANDLER' as const,
  EVENT_DISPATCH: 'EVENT_DISPATCH' as const,
  EVENT_SUBSCRIPTION: 'EVENT_SUBSCRIPTION' as const,

  // Validation errors
  VALIDATION_TYPE: 'VALIDATION_TYPE' as const,
  VALIDATION_RANGE: 'VALIDATION_RANGE' as const,
  VALIDATION_FORMAT: 'VALIDATION_FORMAT' as const,
  VALIDATION_CONSTRAINT: 'VALIDATION_CONSTRAINT' as const,
  VALIDATION_ERROR: 'VALIDATION_ERROR' as const,

  // Authentication/Authorization errors
  AUTH_INVALID: 'AUTH_INVALID' as const,
  AUTH_EXPIRED: 'AUTH_EXPIRED' as const,
  AUTH_MISSING: 'AUTH_MISSING' as const,
  AUTH_FORBIDDEN: 'AUTH_FORBIDDEN' as const,
  PERMISSION_DENIED: 'PERMISSION_DENIED' as const,

  // Generic errors
  INVALID_INPUT: 'INVALID_INPUT' as const,
  INVALID_STATE: 'INVALID_STATE' as const,
  OPERATION_FAILED: 'OPERATION_FAILED' as const,
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED' as const,
  INTERNAL_ERROR: 'INTERNAL_ERROR' as const,
} as const;

// Update ErrorCode type to include all possible values
export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Error context information
 */
export interface ErrorContext {
  /** Operation that failed */
  operation: string;

  /** When the error occurred */
  timestamp: number;

  /** Error severity level */
  severity: ErrorSeverity;

  /** Additional context information */
  metadata?: Record<string, unknown>;

  /** Error stack trace */
  stackTrace?: string;

  /** Correlation ID for tracking related errors */
  correlationId?: string;

  /** User ID associated with the error */
  userId?: string;

  /** Session ID associated with the error */
  sessionId?: string;

  /** Request ID associated with the error */
  requestId?: string;

  /** Component where the error occurred */
  component?: string;

  /** Error category for grouping */
  category?: string;

  /** Whether error has been handled */
  handled?: boolean;

  /** Recovery attempts made */
  recoveryAttempts?: number;
}

/**
 * Error details for user display
 */
export interface ErrorDetails {
  /** User-friendly error message */
  message: string;

  /** Error code for programmatic handling */
  code: ErrorCode;

  /** Operation that failed */
  operation: string;

  /** When the error occurred */
  timestamp: number;

  /** Additional context for the user */
  context?: Record<string, unknown>;
}

/**
 * Error recovery options
 */
export interface ErrorRecovery {
  /** Whether the error can be retried */
  retryable: boolean;

  /** Suggested retry delay in milliseconds */
  retryDelay?: number;

  /** Maximum number of retry attempts */
  maxRetries?: number;

  /** Recovery actions that can be taken */
  actions?: Array<{
    /** Action identifier */
    id: string;

    /** User-friendly action name */
    name: string;

    /** Action description */
    description: string;

    /** Whether the action requires user confirmation */
    requiresConfirmation: boolean;
  }>;
}

/**
 * Error monitoring metadata
 */
export interface ErrorMonitoring {
  /** Error instance identifier */
  errorId: string;

  /** Related error group */
  groupId?: string;

  /** Error frequency information */
  frequency?: {
    /** Count in current period */
    count: number;

    /** Period start timestamp */
    periodStart: number;

    /** Period duration in milliseconds */
    periodDuration: number;
  };

  /** Error impact assessment */
  impact?: {
    /** Number of affected users */
    userCount?: number;

    /** Number of affected operations */
    operationCount?: number;

    /** System components affected */
    components?: string[];
  };
}
