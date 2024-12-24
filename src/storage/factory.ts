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

/**
 * Creates a storage instance based on configuration
 */
export async function createStorage(config: SqliteConfig): Promise<TaskStorage> {
    try {
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
        const storage = new SqliteStorage(sqliteConfig);
        await storage.initialize();

        return storage;
    } catch (error) {
        throw createError(
            ErrorCodes.STORAGE_INIT,
            'Failed to create storage',
            error instanceof Error ? error.message : String(error)
        );
    }
}

/**
 * Creates a storage instance with default configuration from ConfigManager
 */
export async function createDefaultStorage(): Promise<TaskStorage> {
    const configManager = ConfigManager.getInstance();
    const config = configManager.getConfig();
    
    // Use the storage config from ConfigManager which already handles:
    // - Platform-specific paths
    // - Environment variables
    // - Default values
    // - Directory creation
    return createStorage(config.storage as SqliteConfig);
}
