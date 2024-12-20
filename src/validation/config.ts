/**
 * Configuration validation schemas using Zod
 */
import { z } from 'zod';
import { Environments } from '../types/config.js';
import { LogLevels } from '../types/logging.js';

/**
 * Server configuration validation schema
 */
export const serverConfigSchema = z.object({
    name: z.string().min(1, 'Server name cannot be empty'),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be in semver format'),
    host: z.string().ip().or(z.literal('localhost')),
    port: z.number().int().min(1).max(65535)
});

/**
 * Storage configuration validation schema
 */
export const storageConfigSchema = z.object({
    baseDir: z.string().min(1, 'Base directory cannot be empty'),
    maxSessions: z.number().int().positive(),
    sessionTTL: z.number().int().positive(),
    backupEnabled: z.boolean(),
    maxBackups: z.number().int().nonnegative()
});

/**
 * Logging configuration validation schema
 */
export const loggingConfigSchema = z.object({
    level: z.enum([
        LogLevels.DEBUG,
        LogLevels.INFO,
        LogLevels.WARN,
        LogLevels.ERROR,
        LogLevels.FATAL
    ]),
    logDir: z.string().optional(),
    console: z.boolean(),
    file: z.boolean(),
    maxFiles: z.number().int().positive(),
    maxFileSize: z.number().int().positive()
});

/**
 * Rate limiting configuration validation schema
 */
export const rateLimitingConfigSchema = z.object({
    enabled: z.boolean(),
    maxRequests: z.number().int().positive(),
    windowMs: z.number().int().positive()
});

/**
 * Security configuration validation schema
 */
export const securityConfigSchema = z.object({
    sessionSecret: z.string().min(32, 'Session secret must be at least 32 characters'),
    rateLimiting: rateLimitingConfigSchema
});

/**
 * Complete configuration validation schema
 */
export const configSchema = z.object({
    env: z.enum([
        Environments.DEVELOPMENT,
        Environments.TEST,
        Environments.PRODUCTION
    ]),
    server: serverConfigSchema,
    storage: storageConfigSchema,
    logging: loggingConfigSchema,
    security: securityConfigSchema
});

/**
 * Environment variable validation schema
 */
export const envVarSchema = z.object({
    NODE_ENV: z.enum([
        Environments.DEVELOPMENT,
        Environments.TEST,
        Environments.PRODUCTION
    ]).default(Environments.DEVELOPMENT),
    SERVER_NAME: z.string().optional(),
    SERVER_VERSION: z.string().regex(/^\d+\.\d+\.\d+$/).optional(),
    SERVER_HOST: z.string().optional(),
    SERVER_PORT: z.string().transform(Number).pipe(z.number().int().min(1).max(65535)).optional(),
    TASK_STORAGE_DIR: z.string(),
    STORAGE_MAX_SESSIONS: z.string().transform(Number).pipe(z.number().int().positive()).optional(),
    STORAGE_SESSION_TTL: z.string().transform(Number).pipe(z.number().int().positive()).optional(),
    STORAGE_BACKUP_ENABLED: z.enum(['true', 'false']).transform(val => val === 'true').optional(),
    STORAGE_MAX_BACKUPS: z.string().transform(Number).pipe(z.number().int().nonnegative()).optional(),
    LOG_LEVEL: z.enum([
        LogLevels.DEBUG,
        LogLevels.INFO,
        LogLevels.WARN,
        LogLevels.ERROR,
        LogLevels.FATAL
    ]).optional(),
    LOG_DIR: z.string().optional(),
    LOG_CONSOLE: z.enum(['true', 'false']).transform(val => val === 'true').optional(),
    LOG_FILE: z.enum(['true', 'false']).transform(val => val === 'true').optional(),
    LOG_MAX_FILES: z.string().transform(Number).pipe(z.number().int().positive()).optional(),
    LOG_MAX_FILE_SIZE: z.string().transform(Number).pipe(z.number().int().positive()).optional(),
    SESSION_SECRET: z.string().min(32),
    RATE_LIMITING_ENABLED: z.enum(['true', 'false']).transform(val => val === 'true').optional(),
    RATE_LIMITING_MAX_REQUESTS: z.string().transform(Number).pipe(z.number().int().positive()).optional(),
    RATE_LIMITING_WINDOW_MS: z.string().transform(Number).pipe(z.number().int().positive()).optional()
});

/**
 * Configuration validation functions
 */
export const validateConfig = (config: unknown) => configSchema.parse(config);
export const validateEnvVars = (env: NodeJS.ProcessEnv) => envVarSchema.parse(env);

/**
 * Safe validation functions
 */
export const safeValidateConfig = (config: unknown) => configSchema.safeParse(config);
export const safeValidateEnvVars = (env: NodeJS.ProcessEnv) => envVarSchema.safeParse(env);

/**
 * Default configuration values
 */
export const defaultConfig = {
    env: Environments.DEVELOPMENT,
    server: {
        name: 'atlas-mcp-server',
        version: '0.1.0',
        host: 'localhost',
        port: 3000
    },
    storage: {
        maxSessions: 100,
        sessionTTL: 24 * 60 * 60,
        backupEnabled: true,
        maxBackups: 5
    },
    logging: {
        level: LogLevels.INFO,
        console: true,
        file: true,
        maxFiles: 5,
        maxFileSize: 10 * 1024 * 1024
    },
    security: {
        rateLimiting: {
            enabled: true,
            maxRequests: 100,
            windowMs: 60 * 1000
        }
    }
} as const;

/**
 * Configuration error messages
 */
export const configErrorMessages = {
    MISSING_ENV_VAR: 'Required environment variable is missing',
    INVALID_ENV_VAR: 'Environment variable has invalid value',
    INVALID_CONFIG: 'Configuration validation failed',
    MISSING_CONFIG: 'Required configuration is missing',
    INVALID_PORT: 'Port must be between 1 and 65535',
    INVALID_SESSION_SECRET: 'Session secret must be at least 32 characters',
    INVALID_LOG_LEVEL: 'Invalid log level specified',
    INVALID_ENV: 'Invalid environment specified'
} as const;
