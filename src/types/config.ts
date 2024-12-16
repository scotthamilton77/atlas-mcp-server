/**
 * Configuration-related type definitions
 */
import { z } from 'zod';
import { LogLevel, LogLevels } from '../types/logging.js';

/**
 * Environment type
 * @description Defines the possible runtime environments
 */
export const Environments = {
    DEVELOPMENT: 'development',
    TEST: 'test',
    PRODUCTION: 'production'
} as const;

export type Environment = typeof Environments[keyof typeof Environments];

/**
 * Server configuration interface
 * @description Configuration options for the server
 */
export interface ServerConfig {
    /** Server name */
    name: string;
    /** Server version */
    version: string;
    /** Server host */
    host: string;
    /** Server port */
    port: number;
}

/**
 * Storage configuration interface
 * @description Configuration options for storage management
 */
export interface StorageConfig {
    /** Base directory for storage */
    baseDir: string;
    /** Maximum number of sessions to keep */
    maxSessions: number;
    /** Session time-to-live in seconds */
    sessionTTL: number;
    /** Whether to enable backups */
    backupEnabled: boolean;
    /** Maximum number of backups to keep */
    maxBackups: number;
}

/**
 * Logging configuration interface
 * @description Configuration options for logging
 */
export interface LoggingConfig {
    /** Minimum log level */
    level: LogLevel;
    /** Log directory path */
    logDir?: string;
    /** Whether to log to console */
    console: boolean;
    /** Whether to log to file */
    file: boolean;
    /** Maximum number of log files to keep */
    maxFiles: number;
    /** Maximum size of each log file in bytes */
    maxFileSize: number;
}

/**
 * Rate limiting configuration interface
 * @description Configuration options for rate limiting
 */
export interface RateLimitingConfig {
    /** Whether rate limiting is enabled */
    enabled: boolean;
    /** Maximum number of requests per window */
    maxRequests: number;
    /** Time window in milliseconds */
    windowMs: number;
}

/**
 * Security configuration interface
 * @description Configuration options for security
 */
export interface SecurityConfig {
    /** Session secret for encryption */
    sessionSecret: string;
    /** Rate limiting configuration */
    rateLimiting: RateLimitingConfig;
}

/**
 * Complete configuration interface
 * @description Complete application configuration
 */
export interface Config {
    /** Runtime environment */
    env: Environment;
    /** Server configuration */
    server: ServerConfig;
    /** Storage configuration */
    storage: StorageConfig;
    /** Logging configuration */
    logging: LoggingConfig;
    /** Security configuration */
    security: SecurityConfig;
}

/**
 * Configuration validation result interface
 * @description Result of configuration validation
 */
export interface ConfigValidationResult {
    /** Whether the configuration is valid */
    valid: boolean;
    /** Validation errors if any */
    errors?: {
        /** Path to the invalid property */
        path: string;
        /** Error message */
        message: string;
        /** Validation rule that failed */
        rule: string;
        /** Expected value or type */
        expected: unknown;
        /** Actual value */
        actual: unknown;
    }[];
}

/**
 * Configuration defaults type
 * @description Type for configuration default values
 */
export type ConfigDefaults = {
    [K in keyof Config]: Partial<Config[K]>;
};

/**
 * Configuration override type
 * @description Type for configuration overrides
 */
export type ConfigOverride = Partial<{
    [K in keyof Config]: Partial<Config[K]>;
}>;

/**
 * Environment variable mapping interface
 * @description Maps environment variables to configuration paths
 */
export interface EnvVarMapping {
    /** Environment variable name */
    [key: string]: {
        /** Path to configuration property */
        path: string;
        /** Transform function for the value */
        transform?: (value: string) => unknown;
        /** Whether the variable is required */
        required?: boolean;
        /** Default value if not provided */
        default?: unknown;
        /** Validation function */
        validate?: (value: unknown) => boolean;
    };
}

/**
 * Configuration schema type
 * @description Type for configuration schema validation
 */
export type ConfigSchema = {
    [K in keyof Config]: {
        /** Property type */
        type: string;
        /** Whether the property is required */
        required?: boolean;
        /** Property description */
        description?: string;
        /** Validation rules */
        rules?: {
            /** Rule name */
            name: string;
            /** Validation function */
            validate: (value: unknown) => boolean;
            /** Error message */
            message: string;
        }[];
        /** Nested schema for objects */
        properties?: Record<string, ConfigSchema[K]>;
    };
};

/**
 * Configuration provider interface
 * @description Interface for configuration providers
 */
export interface ConfigProvider {
    /** Get configuration value */
    get<T>(path: string): T;
    /** Set configuration value */
    set<T>(path: string, value: T): void;
    /** Check if configuration exists */
    has(path: string): boolean;
    /** Get all configuration */
    getAll(): Config;
    /** Validate configuration */
    validate(): ConfigValidationResult;
    /** Reset configuration to defaults */
    reset(): void;
    /** Load configuration from source */
    load(): Promise<void>;
    /** Save configuration to source */
    save(): Promise<void>;
}
