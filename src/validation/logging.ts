/**
 * Logging validation schemas
 */
import { z } from 'zod';
import { LogLevels } from '../types/logging.js';

/**
 * Log level validation schema
 */
export const logLevelSchema = z.enum([
    LogLevels.ERROR,
    LogLevels.WARN,
    LogLevels.INFO,
    LogLevels.HTTP,
    LogLevels.VERBOSE,
    LogLevels.DEBUG,
    LogLevels.SILLY
]);

/**
 * Log entry validation schema
 */
export const logEntrySchema = z.object({
    timestamp: z.string(),
    level: logLevelSchema,
    message: z.string(),
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
    minLevel: logLevelSchema,
    logDir: z.string().optional(),
    console: z.boolean().optional(),
    file: z.boolean().optional(),
    maxFiles: z.number().int().positive().optional(),
    maxFileSize: z.number().int().positive().optional(),
    noColors: z.boolean().optional()
});

/**
 * Log query options validation schema
 */
export const logQueryOptionsSchema = z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    levels: z.array(logLevelSchema).optional(),
    search: z.string().optional(),
    context: z.record(z.unknown()).optional(),
    limit: z.number().int().positive().optional(),
    offset: z.number().int().nonnegative().optional(),
    order: z.enum(['asc', 'desc']).optional()
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
 * Log file info validation schema
 */
export const logFileInfoSchema = z.object({
    name: z.string(),
    path: z.string(),
    size: z.number().int().nonnegative(),
    created: z.string(),
    modified: z.string()
});
