/**
 * Storage factory for creating task storage instances
 */
import { StorageConfig, TaskStorage, StorageError, StorageErrorType } from '../types/storage.js';
import { SqliteStorage } from './sqlite-storage.js';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Creates a storage instance based on configuration
 */
export async function createStorage(config: StorageConfig): Promise<TaskStorage> {
    try {
        // Ensure base directory exists with proper permissions
        await fs.mkdir(config.baseDir, { recursive: true, mode: 0o750 });

        // Create SQLite storage
        const storage = new SqliteStorage(config);
        await storage.initialize();

        return storage;
    } catch (error) {
        throw new StorageError(
            StorageErrorType.INITIALIZATION,
            'Failed to create storage',
            error
        );
    }
}

/**
 * Creates a storage instance with default configuration
 */
export async function createDefaultStorage(): Promise<TaskStorage> {
    const baseDir = process.env.ATLAS_STORAGE_DIR || path.join(process.cwd(), 'data');

    const config: StorageConfig = {
        baseDir,
        name: process.env.ATLAS_STORAGE_NAME || 'atlas-tasks',
        connection: {
            maxRetries: Number(process.env.ATLAS_MAX_RETRIES) || 3,
            retryDelay: Number(process.env.ATLAS_RETRY_DELAY) || 1000,
            busyTimeout: Number(process.env.ATLAS_BUSY_TIMEOUT) || 5000
        },
        performance: {
            checkpointInterval: Number(process.env.ATLAS_CHECKPOINT_INTERVAL) || 300000, // 5 minutes
            cacheSize: Number(process.env.ATLAS_CACHE_SIZE) || 2000,
            mmapSize: Number(process.env.ATLAS_MMAP_SIZE) || 30000000000, // 30GB
            pageSize: Number(process.env.ATLAS_PAGE_SIZE) || 4096
        }
    };

    return createStorage(config);
}
