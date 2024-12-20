/**
 * Configuration module
 * Handles application configuration management
 */

import { z } from 'zod';
import { ConfigError, ErrorCodes } from '../errors/index.js';
import { LogLevels } from '../logging/index.js';

/**
 * Environment variable names
 */
export const EnvVars = {
    NODE_ENV: 'NODE_ENV',
    LOG_LEVEL: 'LOG_LEVEL',
    TASK_STORAGE_DIR: 'TASK_STORAGE_DIR',
    SESSION_ID: 'SESSION_ID'
} as const;

/**
 * Environment types
 */
export const Environments = {
    DEVELOPMENT: 'development',
    PRODUCTION: 'production',
    TEST: 'test'
} as const;

/**
 * Logging configuration type
 */
export interface LoggingConfig {
    level: typeof LogLevels[keyof typeof LogLevels];
    console: boolean;
    file: boolean;
    dir?: string;
    maxFiles: number;
    maxSize: number;
}

/**
 * Configuration schema
 */
export const configSchema = z.object({
    env: z.enum([
        Environments.DEVELOPMENT,
        Environments.PRODUCTION,
        Environments.TEST
    ]).default(Environments.DEVELOPMENT),
    logging: z.object({
        level: z.enum([
            LogLevels.DEBUG,
            LogLevels.INFO,
            LogLevels.WARN,
            LogLevels.ERROR,
            LogLevels.FATAL
        ]).default(LogLevels.INFO),
        console: z.boolean().default(true),
        file: z.boolean().default(false),
        dir: z.string().optional(),
        maxFiles: z.number().positive().default(5),
        maxSize: z.number().positive().default(5242880) // 5MB
    }),
    storage: z.object({
        dir: z.string(),
        sessionId: z.string().uuid()
    })
});

export type Config = z.infer<typeof configSchema>;

/**
 * Default logging configuration
 */
const defaultLoggingConfig: LoggingConfig = {
    level: LogLevels.INFO,
    console: true,
    file: false,
    maxFiles: 5,
    maxSize: 5242880
};

/**
 * Default configuration values
 */
export const defaultConfig: Partial<Config> = {
    env: Environments.DEVELOPMENT,
    logging: defaultLoggingConfig
};

/**
 * Configuration manager class
 */
export class ConfigManager {
    private static instance: ConfigManager;
    private config: Config;

    private constructor(initialConfig: Partial<Config> = {}) {
        this.config = this.loadConfig(initialConfig);
    }

    /**
     * Gets the configuration manager instance
     */
    static getInstance(): ConfigManager {
        if (!ConfigManager.instance) {
            ConfigManager.instance = new ConfigManager();
        }
        return ConfigManager.instance;
    }

    /**
     * Initializes the configuration manager with custom config
     */
    static initialize(config: Partial<Config>): void {
        if (ConfigManager.instance) {
            throw new ConfigError(
                ErrorCodes.CONFIG_INVALID,
                'Configuration already initialized'
            );
        }
        ConfigManager.instance = new ConfigManager(config);
    }

    /**
     * Gets the current configuration
     */
    getConfig(): Config {
        return { ...this.config };
    }

    /**
     * Updates the configuration
     */
    updateConfig(updates: Partial<Config>): void {
        const newConfig = {
            ...this.config,
            ...updates,
            logging: {
                ...this.config.logging,
                ...(updates.logging || {})
            }
        };

        const result = configSchema.safeParse(newConfig);
        if (!result.success) {
            throw new ConfigError(
                ErrorCodes.CONFIG_INVALID,
                'Invalid configuration update',
                result.error
            );
        }

        this.config = result.data;
    }

    /**
     * Loads and validates configuration
     */
    private loadConfig(customConfig: Partial<Config>): Config {
        try {
            // Load from environment
            const envConfig = this.loadEnvConfig(customConfig);

            // Merge configurations with precedence:
            // custom > environment > default
            const mergedConfig = {
                ...defaultConfig,
                ...envConfig,
                ...customConfig,
                logging: {
                    ...defaultLoggingConfig,
                    ...(envConfig.logging || {}),
                    ...(customConfig.logging || {})
                }
            };

            // Validate final configuration
            const result = configSchema.safeParse(mergedConfig);
            if (!result.success) {
                throw new ConfigError(
                    ErrorCodes.CONFIG_INVALID,
                    'Invalid configuration',
                    result.error
                );
            }

            return result.data;
        } catch (error) {
            if (error instanceof ConfigError) {
                throw error;
            }
            throw new ConfigError(
                ErrorCodes.CONFIG_INVALID,
                'Failed to load configuration',
                error
            );
        }
    }

    /**
     * Loads configuration from environment variables
     */
    private loadEnvConfig(customConfig: Partial<Config>): Partial<Config> {
        const env = process.env[EnvVars.NODE_ENV];
        const logLevel = process.env[EnvVars.LOG_LEVEL];
        const storageDir = customConfig.storage?.dir || process.env[EnvVars.TASK_STORAGE_DIR];
        const sessionId = customConfig.storage?.sessionId || process.env[EnvVars.SESSION_ID];

        if (!storageDir) {
            throw new ConfigError(
                ErrorCodes.CONFIG_MISSING,
                'Storage directory must be provided'
            );
        }

        const config: Partial<Config> = {
            storage: {
                dir: storageDir,
                sessionId: sessionId || crypto.randomUUID()
            },
            logging: { ...defaultLoggingConfig }
        };

        if (env) {
            const result = z.enum([
                Environments.DEVELOPMENT,
                Environments.PRODUCTION,
                Environments.TEST
            ]).safeParse(env);

            if (!result.success) {
                throw new ConfigError(
                    ErrorCodes.CONFIG_INVALID,
                    'Invalid environment'
                );
            }

            config.env = result.data;
        }

        if (logLevel) {
            const result = z.enum([
                LogLevels.DEBUG,
                LogLevels.INFO,
                LogLevels.WARN,
                LogLevels.ERROR,
                LogLevels.FATAL
            ]).safeParse(logLevel);

            if (!result.success) {
                throw new ConfigError(
                    ErrorCodes.CONFIG_INVALID,
                    'Invalid log level'
                );
            }

            config.logging!.level = result.data;
        }

        return config;
    }
}

/**
 * Creates a default configuration manager
 */
export function createDefaultConfig(): ConfigManager {
    return ConfigManager.getInstance();
}
