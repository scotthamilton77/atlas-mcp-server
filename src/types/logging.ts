/**
 * Logging-related type definitions
 */

/**
 * Log levels enumeration
 * @description Defines the possible log levels using Winston's standard levels
 */
export const LogLevels = {
    ERROR: 'error',   // 0
    WARN: 'warn',     // 1
    INFO: 'info',     // 2
    HTTP: 'http',     // 3
    VERBOSE: 'verbose', // 4
    DEBUG: 'debug',   // 5
    SILLY: 'silly'    // 6
} as const;

export type LogLevel = typeof LogLevels[keyof typeof LogLevels];

/**
 * Log entry interface
 * @description Represents a single log entry
 */
export interface LogEntry {
    /** Log timestamp */
    timestamp: string;
    /** Log level */
    level: LogLevel;
    /** Log message */
    message: string;
    /** Additional context */
    context?: Record<string, unknown>;
    /** Error information if applicable */
    error?: {
        /** Error name */
        name: string;
        /** Error message */
        message: string;
        /** Error stack trace */
        stack?: string;
        /** Error code */
        code?: string;
        /** Additional error details */
        details?: unknown;
    };
}

/**
 * Logger configuration interface
 * @description Configuration options for the logger
 */
export interface LoggerConfig {
    /** Minimum log level to record */
    minLevel: LogLevel;
    /** Log directory path */
    logDir?: string;
    /** Whether to log to console */
    console?: boolean;
    /** Whether to log to file */
    file?: boolean;
    /** Maximum number of log files */
    maxFiles?: number;
    /** Maximum size of each log file in bytes */
    maxFileSize?: number;
    /** Whether to disable colored console output */
    noColors?: boolean;
}

/**
 * Log formatter interface
 * @description Interface for log formatters
 */
export interface LogFormatter {
    /** Format a log entry */
    format(entry: LogEntry): string;
}

/**
 * Log transport interface
 * @description Interface for log transports (console, file, etc.)
 */
export interface LogTransport {
    /** Write a log entry */
    write(entry: LogEntry): Promise<void>;
    /** Initialize the transport */
    initialize?(): Promise<void>;
    /** Close the transport */
    close?(): Promise<void>;
}

/**
 * Child logger context interface
 * @description Context for child loggers
 */
export interface ChildLoggerContext {
    /** Component name */
    component?: string;
    /** Request ID */
    requestId?: string;
    /** Session ID */
    sessionId?: string;
    /** User ID */
    userId?: string;
    /** Additional context */
    [key: string]: unknown;
}

/**
 * Logger interface
 * @description Interface for logger instances
 */
export interface Logger {
    /** Log at DEBUG level */
    debug(message: string, context?: Record<string, unknown>): void;
    /** Log at INFO level */
    info(message: string, context?: Record<string, unknown>): void;
    /** Log at WARN level */
    warn(message: string, context?: Record<string, unknown>): void;
    /** Log at ERROR level */
    error(message: string, error?: Error | unknown, context?: Record<string, unknown>): void;
    /** Log at ERROR level (alias for error, maintains backward compatibility) */
    fatal(message: string, error?: Error | unknown, context?: Record<string, unknown>): void;
    /** Create a child logger with additional context */
    child(context: ChildLoggerContext): Logger;
    /** Initialize the logger */
    initialize(): Promise<void>;
}

/**
 * Log file info interface
 * @description Information about a log file
 */
export interface LogFileInfo {
    /** File name */
    name: string;
    /** File path */
    path: string;
    /** File size in bytes */
    size: number;
    /** Creation timestamp */
    created: string;
    /** Last modified timestamp */
    modified: string;
}

/**
 * Log rotation options interface
 * @description Options for log rotation
 */
export interface LogRotationOptions {
    /** Maximum file size in bytes */
    maxSize: number;
    /** Maximum number of files */
    maxFiles: number;
    /** Whether to compress old logs */
    compress?: boolean;
    /** Pattern for date in file names */
    datePattern?: string;
}

/**
 * Log query options interface
 * @description Options for querying logs
 */
export interface LogQueryOptions {
    /** Start timestamp */
    from?: string;
    /** End timestamp */
    to?: string;
    /** Log levels to include */
    levels?: LogLevel[];
    /** Search text */
    search?: string;
    /** Context filters */
    context?: Record<string, unknown>;
    /** Maximum number of entries */
    limit?: number;
    /** Number of entries to skip */
    offset?: number;
    /** Sort direction */
    order?: 'asc' | 'desc';
}

/**
 * Log query result interface
 * @description Result of a log query
 */
export interface LogQueryResult {
    /** Log entries */
    entries: LogEntry[];
    /** Total number of matching entries */
    total: number;
    /** Query metadata */
    metadata: {
        /** Query timestamp */
        timestamp: string;
        /** Query duration in milliseconds */
        duration: number;
        /** Applied filters */
        filters: Record<string, unknown>;
    };
}
