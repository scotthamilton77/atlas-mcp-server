import { Environment, Environments } from '../types/config.js';
import { PlatformPaths, PlatformCapabilities } from '../utils/platform-utils.js';
import { join } from 'path';
import { cpus } from 'os';

/**
 * Manages configuration with platform-agnostic paths and environment handling
 */
export class ConfigManager {
  private static instance: ConfigManager;
  private readonly config: Record<string, any>;

  private constructor() {
    this.config = this.loadConfig();
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * Load configuration with platform-appropriate defaults
   */
  private loadConfig(): Record<string, any> {
    const documentsDir = PlatformPaths.getDocumentsDir();
    const defaultStorageDir = PlatformPaths.normalizePath(
      join(documentsDir, 'Cline', 'mcp-workspace', 'ATLAS')
    );

    // Platform-specific memory settings
    const maxMemory = PlatformCapabilities.getMaxMemory();
    const sqliteConfig = PlatformCapabilities.getSqliteConfig();

    return {
      env: this.getEnvironment(),
      storage: {
        baseDir: process.env.ATLAS_STORAGE_DIR || defaultStorageDir,
        name: process.env.ATLAS_STORAGE_NAME || 'atlas-tasks',
        wal: process.env.ATLAS_WAL_MODE !== 'false',
        poolSize: parseInt(process.env.ATLAS_POOL_SIZE || '0', 10) || cpus().length || 4,
        performance: {
          maxMemory: parseInt(process.env.ATLAS_MAX_MEMORY || '0', 10) || maxMemory,
          cacheSize:
            parseInt(process.env.ATLAS_CACHE_SIZE || '0', 10) || Math.floor(maxMemory * 0.25),
          pageSize: sqliteConfig.pageSize,
          sharedMemory: sqliteConfig.sharedMemory,
          checkpointInterval: parseInt(process.env.ATLAS_CHECKPOINT_INTERVAL || '30000', 10),
          vacuumInterval: parseInt(process.env.ATLAS_VACUUM_INTERVAL || '3600000', 10),
        },
      },
      logging: {
        level: process.env.ATLAS_LOG_LEVEL || 'info',
        metricsInterval: parseInt(process.env.ATLAS_METRICS_INTERVAL || '60000', 10),
        healthCheckInterval: parseInt(process.env.ATLAS_HEALTH_CHECK_INTERVAL || '30000', 10),
      },
      templates: {
        directories: (process.env.ATLAS_TEMPLATE_DIRS || '').split(',').filter(Boolean),
        maxPathDepth: parseInt(process.env.ATLAS_MAX_PATH_DEPTH || '10', 10),
      },
    };
  }

  /**
   * Get environment with platform-appropriate defaults
   */
  private getEnvironment(): Environment {
    const env = process.env.NODE_ENV?.toLowerCase();
    switch (env) {
      case 'production':
        return Environments.PRODUCTION;
      case 'test':
        return Environments.TEST;
      case 'development':
      default:
        return Environments.DEVELOPMENT;
    }
  }

  /**
   * Get configuration value
   */
  get<T>(key: string): T {
    return this.config[key];
  }

  /**
   * Get complete configuration
   */
  getConfig(): Record<string, any> {
    return { ...this.config };
  }

  /**
   * Update configuration value
   */
  set(key: string, value: any): void {
    this.config[key] = value;
  }
}
