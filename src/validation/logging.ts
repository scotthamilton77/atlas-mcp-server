/**
 * Logging validation schemas using Zod
 */
import { z } from 'zod';
import { LogLevels } from '../types/logging.js';

/**
 * Log entry validation schema
 */
export const logEntrySchema = z.object({
    timestamp: z.string().datetime(),
    level: z.enum([
        LogLevels.DEBUG,
        LogLevels.INFO,
        LogLevels.WARN,
        LogLevels.ERROR,
        LogLevels.FATAL
    ]),
    message: z.string().min(1, 'Log message cannot be empty'),
    context: z.record(z.unknown()).optional(),
    error: z.object({
        name: z.string(),
        message: z.string(),
        stack: z.string().optional(),
        code: z.string().optional(),
        details: z.unknown().optional()
    }).optional()
});

/**
 * Logger configuration validation schema
 */
export const loggerConfigSchema = z.object({
    minLevel: z.enum([
        LogLevels.DEBUG,
        LogLevels.INFO,
        LogLevels.WARN,
        LogLevels.ERROR,
        LogLevels.FATAL
    ]),
    logDir: z.string().optional(),
    console: z.boolean().optional(),
    file: z.boolean().optional(),
    maxFiles: z.number().int().positive().optional(),
    maxFileSize: z.number().int().positive().optional()
});

/**
 * Log file info validation schema
 */
export const logFileInfoSchema = z.object({
    name: z.string(),
    path: z.string(),
    size: z.number().int().nonnegative(),
    created: z.string().datetime(),
    modified: z.string().datetime()
});

/**
 * Log rotation options validation schema
 */
export const logRotationOptionsSchema = z.object({
    maxSize: z.number().int().positive(),
    maxFiles: z.number().int().positive(),
    compress: z.boolean().optional(),
    datePattern: z.string().optional()
});

/**
 * Log query options validation schema
 */
export const logQueryOptionsSchema = z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    levels: z.array(z.enum([
        LogLevels.DEBUG,
        LogLevels.INFO,
        LogLevels.WARN,
        LogLevels.ERROR,
        LogLevels.FATAL
    ])).optional(),
    search: z.string().optional(),
    context: z.record(z.unknown()).optional(),
    limit: z.number().int().positive().optional(),
    offset: z.number().int().nonnegative().optional(),
    order: z.enum(['asc', 'desc']).optional()
});

/**
 * Child logger context validation schema
 */
export const childLoggerContextSchema = z.object({
    component: z.string().optional(),
    requestId: z.string().optional(),
    sessionId: z.string().optional(),
    userId: z.string().optional()
}).catchall(z.unknown());

/**
 * Log transport configuration validation schema
 */
export const logTransportConfigSchema = z.object({
    type: z.enum(['console', 'file', 'custom']),
    level: z.enum([
        LogLevels.DEBUG,
        LogLevels.INFO,
        LogLevels.WARN,
        LogLevels.ERROR,
        LogLevels.FATAL
    ]),
    format: z.enum(['json', 'text', 'custom']),
    options: z.record(z.unknown()).optional()
});

/**
 * Log format options validation schema
 */
export const logFormatOptionsSchema = z.object({
    timestamp: z.boolean().optional(),
    colorize: z.boolean().optional(),
    includeContext: z.boolean().optional(),
    includeStack: z.boolean().optional(),
    prettyPrint: z.boolean().optional(),
    template: z.string().optional()
});

/**
 * Validation functions
 */
export const validateLogEntry = (entry: unknown) => logEntrySchema.parse(entry);
export const validateLoggerConfig = (config: unknown) => loggerConfigSchema.parse(config);
export const validateLogFileInfo = (info: unknown) => logFileInfoSchema.parse(info);
export const validateLogRotationOptions = (options: unknown) => logRotationOptionsSchema.parse(options);
export const validateLogQueryOptions = (options: unknown) => logQueryOptionsSchema.parse(options);
export const validateChildLoggerContext = (context: unknown) => childLoggerContextSchema.parse(context);
export const validateLogTransportConfig = (config: unknown) => logTransportConfigSchema.parse(config);
export const validateLogFormatOptions = (options: unknown) => logFormatOptionsSchema.parse(options);

/**
 * Safe validation functions
 */
export const safeValidateLogEntry = (entry: unknown) => logEntrySchema.safeParse(entry);
export const safeValidateLoggerConfig = (config: unknown) => loggerConfigSchema.safeParse(config);
export const safeValidateLogFileInfo = (info: unknown) => logFileInfoSchema.safeParse(info);
export const safeValidateLogRotationOptions = (options: unknown) => logRotationOptionsSchema.safeParse(options);
export const safeValidateLogQueryOptions = (options: unknown) => logQueryOptionsSchema.safeParse(options);
export const safeValidateChildLoggerContext = (context: unknown) => childLoggerContextSchema.safeParse(context);
export const safeValidateLogTransportConfig = (config: unknown) => logTransportConfigSchema.safeParse(config);
export const safeValidateLogFormatOptions = (options: unknown) => logFormatOptionsSchema.safeParse(options);

/**
 * Error messages
 */
export const loggingErrorMessages = {
    INVALID_LOG_LEVEL: 'Invalid log level specified',
    INVALID_LOG_FORMAT: 'Invalid log format specified',
    INVALID_TRANSPORT_TYPE: 'Invalid transport type specified',
    INVALID_LOG_ENTRY: 'Invalid log entry format',
    INVALID_TIMESTAMP: 'Invalid timestamp format',
    INVALID_QUERY_OPTIONS: 'Invalid log query options',
    INVALID_ROTATION_OPTIONS: 'Invalid log rotation options',
    INVALID_FILE_INFO: 'Invalid log file information',
    MISSING_LOG_MESSAGE: 'Log message cannot be empty',
    MISSING_LOG_LEVEL: 'Log level must be specified',
    MISSING_TRANSPORT_TYPE: 'Transport type must be specified',
    MISSING_LOG_FORMAT: 'Log format must be specified'
} as const;
