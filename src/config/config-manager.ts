import { Config } from '../types/config.js';
import { Logger } from '../logging/index.js';
import { ErrorCodes, createError } from '../errors/index.js';

export class ConfigManager {
  private static instance: ConfigManager;
  private config!: Config; // Initialized in initialize()
  private readonly logger: Logger;

  private constructor() {
    this.logger = Logger.getInstance().child({ component: 'ConfigManager' });
  }

  static async initialize(defaultConfig: Config): Promise<ConfigManager> {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
      ConfigManager.instance.config = defaultConfig;
    }
    return ConfigManager.instance;
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      throw createError(
        ErrorCodes.CONFIG_INIT_ERROR,
        'ConfigManager not initialized',
        'ConfigManager.getInstance'
      );
    }
    return ConfigManager.instance;
  }

  getConfig(): Config {
    return this.config;
  }

  updateConfig(updates: Partial<Config>): void {
    this.config = {
      ...this.config,
      ...updates,
    };
    this.logger.info('Configuration updated', { updates });
  }
}
