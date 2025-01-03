import { promises as fs } from 'fs';
import * as path from 'path';
import { Logger } from '../logging/index.js';
import { ErrorCodes, createError } from '../errors/index.js';
import { ConfigData, Environment, Environments, StorageConfig } from '../types/config.js';

export class ConfigInitializer {
  private readonly logger: Logger;

  constructor() {
    this.logger = Logger.getInstance().child({ component: 'ConfigInitializer' });
  }

  /**
   * Initialize configuration by merging built-in and user configs
   */
  async initializeConfig(configPath: string, builtInConfigPath: string): Promise<ConfigData> {
    try {
      let userConfig: Partial<ConfigData> = {};
      let builtInConfig: ConfigData;

      // Ensure config directory exists
      await this.ensureDirectoryExists(path.dirname(configPath));

      // Read built-in config
      try {
        if (!(await this.fileExists(builtInConfigPath))) {
          this.logger.error('Built-in config not found', { path: builtInConfigPath });
          throw new Error(`Built-in config not found at ${builtInConfigPath}`);
        }
        const builtInContent = await fs.readFile(builtInConfigPath, 'utf-8');
        try {
          builtInConfig = JSON.parse(builtInContent);
        } catch (parseError) {
          const error = parseError as Error;
          this.logger.error('Failed to parse built-in config', { error, path: builtInConfigPath });
          throw new Error(
            `Invalid JSON in built-in config at ${builtInConfigPath}: ${error.message}`
          );
        }
      } catch (err) {
        const error = err as Error;
        this.logger.error('Failed to read built-in config', { error, path: builtInConfigPath });
        throw createError(
          ErrorCodes.CONFIG_INIT_ERROR,
          `Failed to read built-in config: ${error.message}`,
          'ConfigInitializer.initializeConfig',
          undefined,
          { error, path: builtInConfigPath }
        );
      }

      // Read user config if it exists
      try {
        if (await this.fileExists(configPath)) {
          const userContent = await fs.readFile(configPath, 'utf-8');
          userConfig = JSON.parse(userContent);
          this.logger.info('Found existing user config', { path: configPath });
        }
      } catch (error) {
        this.logger.warn('Error reading user config, will use built-in defaults', {
          error,
          path: configPath,
        });
      }

      // Merge configs, preferring user values
      const mergedConfig = this.mergeConfigs(builtInConfig, userConfig);

      // Write merged config if it doesn't exist or is different
      if (
        !(await this.fileExists(configPath)) ||
        !(await this.configsMatch(configPath, mergedConfig))
      ) {
        await this.ensureDirectoryExists(path.dirname(configPath));
        await fs.writeFile(configPath, JSON.stringify(mergedConfig, null, 2));
        this.logger.info('Wrote merged config', { path: configPath });
      }

      return mergedConfig;
    } catch (error) {
      this.logger.error('Failed to initialize config', { error });
      throw createError(
        ErrorCodes.CONFIG_INIT_ERROR,
        'Failed to initialize config',
        'ConfigInitializer.initializeConfig',
        undefined,
        { error }
      );
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  }

  private async configsMatch(configPath: string, newConfig: ConfigData): Promise<boolean> {
    try {
      const existingContent = await fs.readFile(configPath, 'utf-8');
      const existingConfig = JSON.parse(existingContent);
      return JSON.stringify(existingConfig) === JSON.stringify(newConfig);
    } catch {
      return false;
    }
  }

  private mergeConfigs(builtIn: ConfigData, user: Partial<ConfigData>): ConfigData {
    const merged = { ...builtIn };

    // Environment settings take precedence in this order:
    // 1. User config env setting (most specific)
    // 2. NODE_ENV environment variable
    // 3. Built-in default (least specific)
    merged.env =
      user.env || (process.env.NODE_ENV as Environment) || builtIn.env || Environments.DEVELOPMENT;

    // Merge logging section
    if (user.logging) {
      merged.logging = {
        ...builtIn.logging,
        ...user.logging,
      };
    }

    // Merge storage section with nested objects
    if (user.storage) {
      merged.storage = {
        ...builtIn.storage,
        ...user.storage,
        // Deep merge connection settings
        connection: user.storage.connection
          ? {
              ...builtIn.storage?.connection,
              ...user.storage.connection,
            }
          : builtIn.storage?.connection,
        // Deep merge performance settings
        performance: user.storage.performance
          ? {
              ...builtIn.storage?.performance,
              ...user.storage.performance,
            }
          : builtIn.storage?.performance,
      };
    }

    // Ensure required storage fields have defaults
    const defaultStorage: StorageConfig = {
      baseDir: merged.storage?.baseDir || '.',
      name: merged.storage?.name || 'atlas-tasks',
      connection: merged.storage?.connection || {
        maxRetries: 3,
        retryDelay: 1000,
        busyTimeout: 5000,
      },
      performance: merged.storage?.performance || {
        checkpointInterval: 30000,
        cacheSize: 2000,
        mmapSize: 33554432,
        pageSize: 4096,
        maxMemory: 134217728,
        sharedMemory: false,
      },
    };
    merged.storage = defaultStorage;

    return merged;
  }
}
