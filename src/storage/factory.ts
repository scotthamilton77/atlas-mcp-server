/**
 * Storage factory for creating task storage instances
 */
import { TaskStorage } from '../types/storage.js';
import { ErrorCodes, createError } from '../errors/index.js';
import { 
    SqliteStorage,
    SqliteConfig,
    DEFAULT_PAGE_SIZE,
    DEFAULT_CACHE_SIZE,
    DEFAULT_BUSY_TIMEOUT
} from './sqlite/index.js';
import { ConfigManager } from '../config/index.js';
import { promises as fs } from 'fs';
import { Logger } from '../logging/index.js';

/**
 * Storage factory class for managing singleton storage instance
 */
class StorageFactory {
    private static instance: StorageFactory | null = null;
    private static initializationPromise: Promise<StorageFactory> | null = null;
    private storageInstance: TaskStorage | null = null;
    private static logger: Logger;

    private static initLogger(): void {
        if (!StorageFactory.logger) {
            StorageFactory.logger = Logger.getInstance().child({ component: 'StorageFactory' });
        }
    }

    private constructor() {
        StorageFactory.initLogger();
    }

    /**
     * Gets the StorageFactory instance
     */
    static async getInstance(): Promise<StorageFactory> {
        // Return existing instance if available
        if (StorageFactory.instance) {
            return StorageFactory.instance;
        }

        // If initialization is in progress, wait for it
        if (StorageFactory.initializationPromise) {
            return StorageFactory.initializationPromise;
        }

        // Start new initialization with mutex
        StorageFactory.initializationPromise = (async () => {
            try {
                // Double-check instance hasn't been created while waiting
                if (StorageFactory.instance) {
                    return StorageFactory.instance;
                }

                StorageFactory.instance = new StorageFactory();
                return StorageFactory.instance;
            } catch (error) {
                throw createError(
                    ErrorCodes.STORAGE_INIT,
                    `Failed to initialize StorageFactory: ${error instanceof Error ? error.message : String(error)}`
                );
            } finally {
                StorageFactory.initializationPromise = null;
            }
        })();

        return StorageFactory.initializationPromise;
    }

    /**
     * Creates or returns the singleton storage instance
     */
    async createStorage(config: SqliteConfig): Promise<TaskStorage> {
        try {
            // Return existing instance if available
            if (this.storageInstance) {
                StorageFactory.logger.debug('Returning existing storage instance');
                return this.storageInstance;
            }

            StorageFactory.logger.info('Creating new storage instance', {
                baseDir: config.baseDir,
                name: config.name
            });

            // Ensure base directory exists with platform-appropriate permissions
            await fs.mkdir(config.baseDir, { 
                recursive: true, 
                mode: process.platform === 'win32' ? undefined : 0o755 
            });

            // Apply SQLite-specific defaults
            const sqliteConfig: SqliteConfig = {
                ...config,
                sqlite: {
                    journalMode: 'WAL',
                    synchronous: 'NORMAL',
                    tempStore: 'MEMORY',
                    lockingMode: 'NORMAL',
                    autoVacuum: 'NONE',
                    ...config.sqlite
                },
                performance: {
                    pageSize: DEFAULT_PAGE_SIZE,
                    cacheSize: DEFAULT_CACHE_SIZE,
                    ...config.performance
                },
                connection: {
                    busyTimeout: DEFAULT_BUSY_TIMEOUT,
                    ...config.connection
                }
            };

            // Create and initialize storage
            const storage = new SqliteStorage(sqliteConfig);
            await storage.initialize();
            
            // Only set singleton after successful initialization
            this.storageInstance = storage;
            StorageFactory.logger.info('Storage instance created successfully');
            return storage;
        } catch (error) {
            // Clear storage instance on error
            this.storageInstance = null;
            StorageFactory.logger.error('Failed to create storage instance', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw createError(
                ErrorCodes.STORAGE_INIT,
                'Failed to create storage',
                error instanceof Error ? error.message : String(error)
            );
        }
    }

    /**
     * Creates or returns the storage instance with default configuration
     */
    async createDefaultStorage(): Promise<TaskStorage> {
        try {
            // Return existing instance if available
            if (this.storageInstance) {
                StorageFactory.logger.debug('Returning existing default storage instance');
                return this.storageInstance;
            }

            const configManager = ConfigManager.getInstance();
            const config = configManager.getConfig();
            
            if (!config.storage) {
                throw new Error('Storage configuration not found in ConfigManager');
            }

            StorageFactory.logger.info('Creating default storage instance');
            return this.createStorage(config.storage as SqliteConfig);
        } catch (error) {
            StorageFactory.logger.error('Failed to create default storage', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw createError(
                ErrorCodes.STORAGE_INIT,
                'Failed to create default storage',
                error instanceof Error ? error.message : String(error)
            );
        }
    }
}

// Export factory instance creation functions
export async function createStorage(config: SqliteConfig): Promise<TaskStorage> {
    const factory = await StorageFactory.getInstance();
    return factory.createStorage(config);
}

export async function createDefaultStorage(): Promise<TaskStorage> {
    const factory = await StorageFactory.getInstance();
    return factory.createDefaultStorage();
}
