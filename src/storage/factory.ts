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

// Singleton storage instance
let storageInstance: TaskStorage | null = null;

/**
 * Creates or returns the singleton storage instance
 */
export async function createStorage(config: SqliteConfig): Promise<TaskStorage> {
    const logger = Logger.getInstance();

    try {
        // Return existing instance if available
        if (storageInstance) {
            logger.debug('Returning existing storage instance');
            return storageInstance;
        }

        logger.info('Creating new storage instance', {
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

        // Create SQLite storage
        storageInstance = new SqliteStorage(sqliteConfig);
        await storageInstance.initialize();

        logger.info('Storage instance created successfully');
        return storageInstance;
    } catch (error) {
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
export async function createDefaultStorage(): Promise<TaskStorage> {
    const logger = Logger.getInstance();
    
    try {
        // Return existing instance if available
        if (storageInstance) {
            logger.debug('Returning existing default storage instance');
            return storageInstance;
        }

        const configManager = ConfigManager.getInstance();
        const config = configManager.getConfig();
        
        if (!config.storage) {
            throw new Error('Storage configuration not found in ConfigManager');
        }

        logger.info('Creating default storage instance');
        return createStorage(config.storage as SqliteConfig);
    } catch (error) {
        logger.error('Failed to create default storage', {
            error: error instanceof Error ? error.message : String(error)
        });
        throw createError(
            ErrorCodes.STORAGE_INIT,
            'Failed to create default storage',
            error instanceof Error ? error.message : String(error)
        );
    }
}
