/**
 * Configuration types
 */
import { LogLevel } from '../types/logging.js';

/**
 * Environment types
 */
export const Environments = {
    DEVELOPMENT: 'development',
    PRODUCTION: 'production',
    TEST: 'test'
} as const;

export type Environment = typeof Environments[keyof typeof Environments];

/**
 * Environment configuration
 */
export interface EnvironmentConfig {
    /** Node environment */
    NODE_ENV: Environment;
    /** Log level */
    LOG_LEVEL: LogLevel;
    /** Task storage directory */
    TASK_STORAGE_DIR: string;
}

/**
 * Logging configuration
 */
export interface LoggingConfig {
    /** Log level */
    level: LogLevel;
    /** Enable console logging */
    console: boolean;
    /** Enable file logging */
    file: boolean;
    /** Log directory */
    dir?: string;
    /** Maximum log files */
    maxFiles: number;
    /** Maximum log file size */
    maxSize: number;
}

/**
 * Storage configuration
 */
export interface StorageConfig {
    /** Base directory */
    baseDir: string;
    /** Storage name */
    name: string;
    /** Connection settings */
    connection?: {
        /** Maximum retries */
        maxRetries?: number;
        /** Retry delay in milliseconds */
        retryDelay?: number;
        /** Busy timeout in milliseconds */
        busyTimeout?: number;
    };
    /** Performance settings */
    performance?: {
        /** WAL mode checkpoint interval */
        checkpointInterval?: number;
        /** Cache size in pages */
        cacheSize?: number;
        /** Memory map size */
        mmapSize?: number;
        /** Page size */
        pageSize?: number;
    };
}

/**
 * Application configuration
 */
export interface Config {
    /** Environment */
    env: Environment;
    /** Logging configuration */
    logging: LoggingConfig;
    /** Storage configuration */
    storage: StorageConfig;
}
