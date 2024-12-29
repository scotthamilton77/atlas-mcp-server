/**
 * Logging-related type definitions
 */
import { EventManager } from '../events/event-manager.js';

/**
 * Log levels
 */
export const LogLevels = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
  HTTP: 'http',
  VERBOSE: 'verbose',
  SILLY: 'silly',
} as const;

export type LogLevel = (typeof LogLevels)[keyof typeof LogLevels];

/**
 * Logger configuration
 */
export interface LoggerConfig {
  /** Minimum log level to record */
  minLevel: LogLevel;
  /** Whether to log to console */
  console?: boolean;
  /** Whether to log to file */
  file?: boolean;
  /** Directory for log files */
  logDir?: string;
  /** Maximum size of each log file in bytes */
  maxFileSize?: number;
  /** Maximum number of log files to keep */
  maxFiles?: number;
  /** Whether to disable colors in console output */
  noColors?: boolean;
  /** Event manager instance for logging events */
  eventManager?: EventManager;
}

/**
 * Logger health check status
 */
export interface LoggerHealthStatus {
  /** Whether the logger is healthy */
  healthy: boolean;
  /** Error details if unhealthy */
  error?: string;
  /** Number of consecutive health check failures */
  consecutiveFailures?: number;
  /** Timestamp of last health check */
  lastCheckTime?: number;
  /** Additional diagnostic information */
  diagnostics?: {
    /** File descriptor status */
    fileDescriptors?: {
      open: boolean;
      writable: boolean;
      error?: string;
    };
    /** Transport status */
    transports?: {
      console?: {
        active: boolean;
        error?: string;
      };
      file?: {
        active: boolean;
        path?: string;
        error?: string;
      };
    };
    /** Memory usage */
    memory?: {
      heapUsed: number;
      heapTotal: number;
      external: number;
    };
  };
}

/**
 * Logger transport configuration
 */
export interface LoggerTransportConfig {
  /** Transport type */
  type: 'console' | 'file';
  /** Transport-specific options */
  options?: {
    /** File path (for file transport) */
    filename?: string;
    /** Maximum file size */
    maxsize?: number;
    /** Maximum number of files */
    maxFiles?: number;
    /** Whether to use colors (for console transport) */
    colors?: boolean;
    /** Log format */
    format?: 'json' | 'simple' | 'pretty';
    /** Minimum log level */
    minLevel?: LogLevel;
  };
}

/**
 * Log entry metadata
 */
export interface LogMetadata {
  /** Timestamp of the log entry */
  timestamp: number;
  /** Correlation ID for request tracing */
  correlationId?: string;
  /** Component that generated the log */
  component?: string;
  /** Operation being performed */
  operation?: string;
  /** Additional context */
  context?: Record<string, unknown>;
  /** Error information */
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
    details?: unknown;
  };
}

/**
 * Log entry format
 */
export interface LogEntry extends LogMetadata {
  /** Log level */
  level: LogLevel;
  /** Log message */
  message: string;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Logger recovery options
 */
export interface LoggerRecoveryOptions {
  /** Maximum number of recovery attempts */
  maxAttempts?: number;
  /** Delay between recovery attempts (ms) */
  retryDelay?: number;
  /** Whether to recreate transports on recovery */
  recreateTransports?: boolean;
  /** Whether to flush logs before recovery */
  flushBeforeRecovery?: boolean;
  /** Callback for recovery events */
  onRecoveryAttempt?: (attempt: number, error?: Error) => void;
}
