/**
 * Storage factory for creating task storage instances
 */
import { StorageConfig, TaskStorage } from '../types/storage.js';
import { ErrorCodes, createError } from '../errors/index.js';
import { SqliteStorage } from './sqlite-storage.js';
import { ConfigManager } from '../config/index.js';
import { promises as fs } from 'fs';

/**
 * Creates a storage instance based on configuration
 */
export async function createStorage(config: StorageConfig): Promise<TaskStorage> {
    try {
        // Ensure base directory exists with platform-appropriate permissions
        await fs.mkdir(config.baseDir, { 
            recursive: true, 
            mode: process.platform === 'win32' ? undefined : 0o755 
        });

        // Create SQLite storage
        const storage = new SqliteStorage(config);
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
    return createStorage(config.storage);
}
