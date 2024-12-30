/**
 * Configuration module
 * Handles application configuration management
 */

import { ConfigError, ErrorCodes } from '../errors/index.js';
import { LogLevel, LogLevels } from '../types/logging.js';
import { ErrorContext, ErrorSeverity } from '../types/error.js';
import { resolve, join } from 'path';
import { PlatformPaths, PlatformCapabilities } from '../utils/platform-utils.js';

/**
 * Environment variable names
 */
export const EnvVars = {
  NODE_ENV: 'NODE_ENV',
  LOG_LEVEL: 'LOG_LEVEL',
  ATLAS_STORAGE_DIR: 'ATLAS_STORAGE_DIR',
  ATLAS_STORAGE_NAME: 'ATLAS_STORAGE_NAME',
} as const;

/**
 * Environment types
 */
export const Environments = {
  DEVELOPMENT: 'development',
  PRODUCTION: 'production',
  TEST: 'test',
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
    maxMemory?: number;
  };
}

/**
 * Application configuration type
 */
export interface AppConfig {
  env: string;
  logging: LoggingConfig;
  storage: StorageConfig;
}

/**
 * Partial application configuration type
 */
export interface PartialAppConfig {
  env?: string;
  logging?: Partial<LoggingConfig>;
  storage?: Partial<StorageConfig>;
}

/**
 * Default logging configuration
 */
const defaultLoggingConfig: LoggingConfig = {
  level: LogLevels.DEBUG, // Set default to debug for more comprehensive logging
  console: false, // Disable console logging by default
  file: true,
  dir: 'logs',
  maxFiles: 10, // Keep more log history
  maxSize: 10 * 1024 * 1024, // 10MB per file
};

/**
 * Default configuration values
 */
export const defaultConfig: AppConfig = {
  env: Environments.DEVELOPMENT,
  logging: defaultLoggingConfig,
  storage: {
    baseDir: join(PlatformPaths.getAppDataDir('atlas-mcp'), 'storage'),
    name: 'atlas-tasks',
    connection: {
      maxRetries: 3,
      retryDelay: 1000,
      busyTimeout: 5000,
    },
    performance: {
      checkpointInterval: 300000, // 5 minutes
      cacheSize: 2000,
      mmapSize: 64 * 1024 * 1024, // 64MB
      maxMemory: 256 * 1024 * 1024, // 256MB
      pageSize: 4096,
    },
  },
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
   * Creates an error context
   */
  private static createErrorContext(
    operation: string,
    metadata?: Record<string, unknown>
  ): ErrorContext {
    return {
      operation,
      timestamp: Date.now(),
      severity: ErrorSeverity.HIGH,
      metadata: {
        ...metadata,
        stackTrace: new Error().stack,
      },
    };
  }

  /**
   * Gets the configuration manager instance
   */
  static getInstance(): ConfigManager {
    if (!ConfigManager.instance || !ConfigManager.instance.initialized) {
      throw new ConfigError(
        ErrorCodes.CONFIG_INVALID,
        'Configuration not initialized. Call ConfigManager.initialize() first.',
        this.createErrorContext('ConfigManager.getInstance')
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

        // Validate and apply custom config
        if (config) {
          // Pre-validate logging level
          if (config.logging?.level && !Object.values(LogLevels).includes(config.logging.level)) {
            throw new ConfigError(
              ErrorCodes.CONFIG_INVALID,
              'Invalid log level',
              this.createErrorContext('ConfigManager.initialize', {
                level: config.logging.level,
                validLevels: Object.values(LogLevels),
              })
            );
          }
          await ConfigManager.instance.updateConfig(config);
        }

        ConfigManager.instance.initialized = true;
        return ConfigManager.instance;
      } catch (error) {
        // Ensure error is properly formatted with context
        if (error instanceof ConfigError) {
          throw error;
        }
        throw new ConfigError(
          ErrorCodes.CONFIG_INVALID,
          `Failed to initialize configuration: ${error instanceof Error ? error.message : String(error)}`,
          this.createErrorContext('ConfigManager.initialize', { error })
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
    if (!this.initialized) {
      throw new ConfigError(
        ErrorCodes.CONFIG_INVALID,
        'Configuration not initialized',
        ConfigManager.createErrorContext('ConfigManager.getConfig')
      );
    }
    return { ...this.config };
  }

  /**
   * Updates the configuration
   */
  async updateConfig(updates: PartialAppConfig): Promise<void> {
    try {
      // Pre-validate logging configuration
      if (updates.logging?.level && !Object.values(LogLevels).includes(updates.logging.level)) {
        throw new ConfigError(
          ErrorCodes.CONFIG_INVALID,
          'Invalid log level',
          ConfigManager.createErrorContext('ConfigManager.updateConfig', {
            level: updates.logging.level,
            validLevels: Object.values(LogLevels),
          })
        );
      }

      const newConfig = {
        ...this.config,
        ...updates,
        logging: {
          ...this.config.logging,
          ...(updates.logging || {}),
        },
        storage: {
          ...this.config.storage,
          ...(updates.storage || {}),
        },
      };

      // Load environment config and create directories
      const envConfig = await this.loadEnvConfig(newConfig);

      // Merge with environment config
      const finalConfig = {
        ...newConfig,
        storage: {
          ...newConfig.storage,
          ...envConfig.storage,
        },
      };

      this.validateConfig(finalConfig);
      this.config = finalConfig;
    } catch (error) {
      if (error instanceof ConfigError) {
        throw error;
      }
      throw new ConfigError(
        ErrorCodes.CONFIG_INVALID,
        `Failed to update configuration: ${error instanceof Error ? error.message : String(error)}`,
        ConfigManager.createErrorContext('ConfigManager.updateConfig', { error })
      );
    }
  }

  /**
   * Gets platform-specific user data directory
   */
  private getUserDataDir(): string {
    return PlatformPaths.getAppDataDir('atlas-mcp');
  }

  /**
   * Loads configuration from environment variables and ensures directories exist
   */
  private async loadEnvConfig(customConfig: PartialAppConfig): Promise<AppConfig> {
    try {
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
          mode: PlatformCapabilities.getFileMode(0o755),
        });
      } catch (error) {
        throw new ConfigError(
          ErrorCodes.CONFIG_INVALID,
          `Failed to create storage directory: ${error instanceof Error ? error.message : String(error)}`,
          ConfigManager.createErrorContext('ConfigManager.loadEnvConfig', {
            storageDir,
            error,
          })
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
            busyTimeout: 5000,
          },
          performance: {
            checkpointInterval: 300000, // 5 minutes
            cacheSize: 2000,
            mmapSize: 64 * 1024 * 1024, // 64MB
            maxMemory: 256 * 1024 * 1024, // 256MB
            pageSize: 4096,
          },
        },
        logging: { ...defaultLoggingConfig },
      };

      if (currentEnv) {
        if (!Object.values(Environments).includes(currentEnv as any)) {
          throw new ConfigError(
            ErrorCodes.CONFIG_INVALID,
            'Invalid environment',
            ConfigManager.createErrorContext('ConfigManager.loadEnvConfig', {
              currentEnv,
              validEnvs: Object.values(Environments),
            })
          );
        }
        config.env = currentEnv;
      }

      if (currentLogLevel) {
        const level = currentLogLevel.toLowerCase();
        if (!Object.values(LogLevels).includes(level as any)) {
          throw new ConfigError(
            ErrorCodes.CONFIG_INVALID,
            'Invalid log level',
            ConfigManager.createErrorContext('ConfigManager.loadEnvConfig', {
              currentLogLevel,
              validLevels: Object.values(LogLevels),
            })
          );
        }
        config.logging.level = level as LogLevel;
      }

      return config;
    } catch (error) {
      if (error instanceof ConfigError) {
        throw error;
      }
      throw new ConfigError(
        ErrorCodes.CONFIG_INVALID,
        `Failed to load environment config: ${error instanceof Error ? error.message : String(error)}`,
        ConfigManager.createErrorContext('ConfigManager.loadEnvConfig', { error })
      );
    }
  }

  /**
   * Validates configuration against schema
   */
  private validateConfig(config: AppConfig): void {
    try {
      if (!config.storage?.baseDir) {
        throw new ConfigError(
          ErrorCodes.CONFIG_MISSING,
          'Storage directory must be provided',
          ConfigManager.createErrorContext('ConfigManager.validateConfig', {
            config,
          })
        );
      }

      if (!config.storage?.name) {
        throw new ConfigError(
          ErrorCodes.CONFIG_MISSING,
          'Storage name must be provided',
          ConfigManager.createErrorContext('ConfigManager.validateConfig', {
            config,
          })
        );
      }

      if (config.logging?.level && !Object.values(LogLevels).includes(config.logging.level)) {
        throw new ConfigError(
          ErrorCodes.CONFIG_INVALID,
          'Invalid log level',
          ConfigManager.createErrorContext('ConfigManager.validateConfig', {
            level: config.logging.level,
            validLevels: Object.values(LogLevels),
          })
        );
      }
    } catch (error) {
      if (error instanceof ConfigError) {
        throw error;
      }
      throw new ConfigError(
        ErrorCodes.CONFIG_INVALID,
        `Failed to validate configuration: ${error instanceof Error ? error.message : String(error)}`,
        ConfigManager.createErrorContext('ConfigManager.validateConfig', { error })
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
