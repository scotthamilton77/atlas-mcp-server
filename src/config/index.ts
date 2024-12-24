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
 * Storage configuration type
 */
export interface StorageConfig {
    baseDir: string;
    name: string;
    connection?: {
        maxRetries?: number;
        retryDelay?: number;
        busyTimeout?: number;
    };
    performance?: {
        checkpointInterval?: number;
        cacheSize?: number;
        mmapSize?: number;
        pageSize?: number;
    };
}

/**
 * Application configuration type
 */
export interface AppConfig {
    env: string;
    logging: LoggingConfig;
    storage: StorageConfig;  // Make storage required
}

export interface PartialAppConfig {
    env?: string;
    logging?: Partial<LoggingConfig>;
    storage?: Partial<StorageConfig>;
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
                enum: Object.values(LogLevels),
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
    file: true,
    dir: 'logs',
    maxFiles: 5,
    maxSize: 5242880
};

/**
 * Default configuration values
 */
export const defaultConfig: AppConfig = {
    env: Environments.DEVELOPMENT,
    logging: defaultLoggingConfig,
    storage: {
        baseDir: join(process.platform === 'win32' ? 
            process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local') :
            process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'),
            'atlas-mcp', 'storage'
        ),
        name: 'atlas-tasks',
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
    }
};

/**
 * Configuration manager class
 */
export class ConfigManager {
    private static instance: ConfigManager | null = null;
    private static initializationPromise: Promise<ConfigManager> | null = null;
    private config: AppConfig;
    private initialized = false;

    private constructor() {
        this.config = defaultConfig;
    }

    /**
     * Gets the configuration manager instance
     */
    static getInstance(): ConfigManager {
        if (!ConfigManager.instance || !ConfigManager.instance.initialized) {
            throw new ConfigError(
                ErrorCodes.CONFIG_INVALID,
                'Configuration not initialized. Call ConfigManager.initialize() first.'
            );
        }
        return ConfigManager.instance;
    }

    /**
     * Initializes the configuration manager with custom config
     */
    static async initialize(config?: PartialAppConfig): Promise<ConfigManager> {
        // Return existing instance if available
        if (ConfigManager.instance && ConfigManager.instance.initialized) {
            return ConfigManager.instance;
        }

        // If initialization is in progress, wait for it
        if (ConfigManager.initializationPromise) {
            return ConfigManager.initializationPromise;
        }

        // Start new initialization with mutex
        ConfigManager.initializationPromise = (async () => {
            try {
                // Double-check instance hasn't been created while waiting
                if (ConfigManager.instance && ConfigManager.instance.initialized) {
                    return ConfigManager.instance;
                }

                ConfigManager.instance = new ConfigManager();
                if (config) {
                    await ConfigManager.instance.updateConfig(config);
                }
                ConfigManager.instance.initialized = true;
                return ConfigManager.instance;
            } catch (error) {
                throw new ConfigError(
                    ErrorCodes.CONFIG_INVALID,
                    `Failed to initialize configuration: ${error instanceof Error ? error.message : String(error)}`
                );
            } finally {
                ConfigManager.initializationPromise = null;
            }
        })();

        return ConfigManager.initializationPromise;
    }

    /**
     * Gets the current configuration
     */
    getConfig(): AppConfig {
        return { ...this.config };
    }

    /**
     * Updates the configuration
     */
    async updateConfig(updates: PartialAppConfig): Promise<void> {
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
     * Gets platform-specific user data directory
     */
    private getUserDataDir(): string {
        // Try environment variables first
        if (process.env.LOCALAPPDATA) {
            return process.env.LOCALAPPDATA;
        }
        if (process.env.XDG_DATA_HOME) {
            return process.env.XDG_DATA_HOME;
        }

        // Fall back to platform-specific defaults
        const home = homedir();
        return process.platform === 'win32'
            ? join(home, 'AppData', 'Local')
            : join(home, '.local', 'share');
    }

    /**
     * Loads configuration from environment variables and ensures directories exist
     */
    private async loadEnvConfig(customConfig: PartialAppConfig): Promise<AppConfig> {
        const currentEnv = process.env[EnvVars.NODE_ENV];
        const currentLogLevel = process.env[EnvVars.LOG_LEVEL];
        
        // Handle storage directory with platform-agnostic paths
        let storageDir = customConfig.storage?.baseDir || process.env[EnvVars.ATLAS_STORAGE_DIR];
        let storageName = customConfig.storage?.name || process.env[EnvVars.ATLAS_STORAGE_NAME];
        
        // Use defaults if env vars not provided
        if (!storageDir) {
            const userDataDir = this.getUserDataDir();
            storageDir = join(userDataDir, 'atlas-mcp', 'storage');
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
                // Skip mode on Windows as it's ignored
                ...(process.platform !== 'win32' && { mode: 0o755 })
            });
        } catch (error) {
            throw new ConfigError(
                ErrorCodes.CONFIG_INVALID,
                `Failed to create storage directory: ${error instanceof Error ? error.message : String(error)}`
            );
        }

        const config: AppConfig = {
            env: currentEnv || Environments.DEVELOPMENT,
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

        if (currentEnv) {
            if (!Object.values(Environments).includes(currentEnv as any)) {
                throw new ConfigError(
                    ErrorCodes.CONFIG_INVALID,
                    'Invalid environment'
                );
            }
            config.env = currentEnv;
        }

        if (currentLogLevel) {
            const level = currentLogLevel.toLowerCase();
            if (!Object.values(LogLevels).includes(level as any)) {
                throw new ConfigError(
                    ErrorCodes.CONFIG_INVALID,
                    'Invalid log level'
                );
            }
            config.logging.level = level as LogLevel;
        }

        return config;
    }

    /**
     * Validates configuration against schema
     */
    private validateConfig(config: AppConfig): void {
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
