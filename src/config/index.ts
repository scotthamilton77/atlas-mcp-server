/**
 * Configuration module
 * Handles application configuration management
 */

import { ConfigError, ErrorCodes } from '../errors/index.js';
import { LogLevel, LogLevels } from '../types/logging.js';
import { resolve, join } from 'path';
import { homedir } from 'os';

/**
 * Environment variable names
 */
export const EnvVars = {
    NODE_ENV: 'NODE_ENV',
    LOG_LEVEL: 'LOG_LEVEL',
    ATLAS_STORAGE_DIR: 'ATLAS_STORAGE_DIR',
    ATLAS_STORAGE_NAME: 'ATLAS_STORAGE_NAME'
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
    level: LogLevel;
    console: boolean;
    file: boolean;
    dir?: string;
    maxFiles: number;
    maxSize: number;
}

/**
 * Configuration schema
 */
export const configSchema = {
    env: {
        type: 'string',
        enum: [
            Environments.DEVELOPMENT,
            Environments.PRODUCTION,
            Environments.TEST
        ],
        default: Environments.DEVELOPMENT
    },
    logging: {
        type: 'object',
        properties: {
            level: {
                type: 'string',
                enum: [
                    LogLevels.ERROR,
                    LogLevels.WARN,
                    LogLevels.INFO,
                    LogLevels.HTTP,
                    LogLevels.VERBOSE,
                    LogLevels.DEBUG,
                    LogLevels.SILLY
                ],
                default: LogLevels.INFO
            },
            console: {
                type: 'boolean',
                default: true
            },
            file: {
                type: 'boolean',
                default: false
            },
            dir: {
                type: 'string',
                optional: true
            },
            maxFiles: {
                type: 'number',
                minimum: 1,
                default: 5
            },
            maxSize: {
                type: 'number',
                minimum: 1024,
                default: 5242880 // 5MB
            }
        },
        required: ['level']
    },
    storage: {
        type: 'object',
        properties: {
            baseDir: {
                type: 'string'
            },
            name: {
                type: 'string'
            },
            connection: {
                type: 'object',
                properties: {
                    maxRetries: {
                        type: 'number',
                        minimum: 1,
                        optional: true
                    },
                    retryDelay: {
                        type: 'number',
                        minimum: 0,
                        optional: true
                    },
                    busyTimeout: {
                        type: 'number',
                        minimum: 0,
                        optional: true
                    }
                },
                optional: true
            },
            performance: {
                type: 'object',
                properties: {
                    checkpointInterval: {
                        type: 'number',
                        minimum: 0,
                        optional: true
                    },
                    cacheSize: {
                        type: 'number',
                        minimum: 0,
                        optional: true
                    },
                    mmapSize: {
                        type: 'number',
                        minimum: 0,
                        optional: true
                    },
                    pageSize: {
                        type: 'number',
                        minimum: 0,
                        optional: true
                    }
                },
                optional: true
            }
        },
        required: ['baseDir', 'name']
    }
};

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
export const defaultConfig = {
    env: Environments.DEVELOPMENT,
    logging: defaultLoggingConfig
};

/**
 * Configuration manager class
 */
export class ConfigManager {
    private static instance: ConfigManager;
    private config: any;

    private constructor() {
        this.config = defaultConfig;
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
    static async initialize(config: any): Promise<void> {
        if (ConfigManager.instance) {
            throw new ConfigError(
                ErrorCodes.CONFIG_INVALID,
                'Configuration already initialized'
            );
        }
        ConfigManager.instance = new ConfigManager();
        await ConfigManager.instance.updateConfig(config);
    }

    /**
     * Gets the current configuration
     */
    getConfig(): any {
        return { ...this.config };
    }

    /**
     * Updates the configuration
     */
    async updateConfig(updates: any): Promise<void> {
        const newConfig = {
            ...this.config,
            ...updates,
            logging: {
                ...this.config.logging,
                ...(updates.logging || {})
            },
            storage: {
                ...this.config.storage,
                ...(updates.storage || {})
            }
        };

        // Load environment config and create directories
        const envConfig = await this.loadEnvConfig(newConfig);
        
        // Merge with environment config
        const finalConfig = {
            ...newConfig,
            storage: {
                ...newConfig.storage,
                ...envConfig.storage
            }
        };

        this.validateConfig(finalConfig);
        this.config = finalConfig;
    }

    /**
     * Loads configuration from environment variables and ensures directories exist
     */
    private async loadEnvConfig(customConfig: any): Promise<any> {
        const env = process.env[EnvVars.NODE_ENV];
        const logLevel = process.env[EnvVars.LOG_LEVEL];
        
        // Handle storage directory with platform-agnostic paths
        let storageDir = customConfig.storage?.baseDir || process.env[EnvVars.ATLAS_STORAGE_DIR];
        let storageName = customConfig.storage?.name || process.env[EnvVars.ATLAS_STORAGE_NAME];
        
        // Use defaults if env vars not provided
        if (!storageDir) {
            if (process.platform === 'win32') {
                storageDir = join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'AtlasMCP', 'storage');
            } else {
                const xdgDataHome = process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share');
                storageDir = join(xdgDataHome, 'atlas-mcp', 'storage');
            }
        }

        if (!storageName) {
            storageName = 'atlas-tasks';
        }

        // Ensure absolute path and create directory if needed
        storageDir = resolve(storageDir);
        try {
            const fs = await import('fs/promises');
            await fs.mkdir(storageDir, { 
                recursive: true,
                mode: process.platform === 'win32' ? undefined : 0o755
            });
        } catch (error) {
            throw new ConfigError(
                ErrorCodes.CONFIG_INVALID,
                `Failed to create storage directory: ${error instanceof Error ? error.message : String(error)}`
            );
        }

        const config: any = {
            storage: {
                baseDir: storageDir,
                name: storageName,
                connection: {
                    maxRetries: 3,
                    retryDelay: 1000,
                    busyTimeout: 5000
                },
                performance: {
                    checkpointInterval: 300000, // 5 minutes
                    cacheSize: 2000,
                    mmapSize: 30000000000, // 30GB
                    pageSize: 4096
                }
            },
            logging: { ...defaultLoggingConfig }
        };

        if (env) {
            if (!Object.values(Environments).includes(env as any)) {
                throw new ConfigError(
                    ErrorCodes.CONFIG_INVALID,
                    'Invalid environment'
                );
            }
            config.env = env;
        }

        if (logLevel) {
            const level = logLevel.toLowerCase();
            if (!Object.values(LogLevels).includes(level as any)) {
                throw new ConfigError(
                    ErrorCodes.CONFIG_INVALID,
                    'Invalid log level'
                );
            }
            config.logging!.level = level;
        }

        return config;
    }

    /**
     * Validates configuration against schema
     */
    private validateConfig(config: any): void {
        // Basic validation - could be expanded
        if (!config.storage?.baseDir) {
            throw new ConfigError(
                ErrorCodes.CONFIG_MISSING,
                'Storage directory must be provided'
            );
        }

        if (!config.storage?.name) {
            throw new ConfigError(
                ErrorCodes.CONFIG_MISSING,
                'Storage name must be provided'
            );
        }

        if (config.logging?.level && !Object.values(LogLevels).includes(config.logging.level)) {
            throw new ConfigError(
                ErrorCodes.CONFIG_INVALID,
                'Invalid log level'
            );
        }
    }
}

/**
 * Creates a default configuration manager
 */
export function createDefaultConfig(): ConfigManager {
    return ConfigManager.getInstance();
}
