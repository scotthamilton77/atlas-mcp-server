import { StorageError } from './index.js';
import { UnifiedStorageConfig, UnifiedStorageManager } from './unified-storage.js';
import { UnifiedSqliteStorage } from './unified-sqlite-storage.js';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Creates a storage manager instance based on configuration
 * @param config Storage configuration options
 * @returns Promise resolving to a StorageManager instance
 * @throws StorageError if initialization fails
 */
export async function createStorageManager(config: UnifiedStorageConfig): Promise<UnifiedStorageManager> {
    try {
        // Ensure base directory exists with proper permissions
        await fs.mkdir(config.baseDir, { recursive: true, mode: 0o750 });

        // Create SQLite storage (we no longer support JSON storage)
        const sqliteConfig: UnifiedStorageConfig = {
            ...config,
            baseDir: path.join(config.baseDir, 'sqlite')
        };
        const manager = new UnifiedSqliteStorage(sqliteConfig);

        // Initialize storage
        await manager.initialize();

        return manager;
    } catch (error) {
        throw new StorageError(
            'Failed to create storage manager',
            'STORAGE_INIT_ERROR',
            error instanceof Error ? error : new Error(String(error))
        );
    }
}

/**
 * Creates a storage manager with default configuration from environment variables
 * @returns Promise resolving to a StorageManager instance
 * @throws StorageError if initialization fails
 */
export async function createDefaultStorageManager(): Promise<UnifiedStorageManager> {
    const baseDir = process.env.ATLAS_STORAGE_DIR || path.join(process.cwd(), 'data');
    const sessionId = process.env.ATLAS_SESSION_ID || 'default';
    const useSqlite = process.env.ATLAS_USE_SQLITE === 'true';

    const config: UnifiedStorageConfig = {
        baseDir,
        sessionId,
        maxRetries: Number(process.env.ATLAS_MAX_RETRIES) || 3,
        retryDelay: Number(process.env.ATLAS_RETRY_DELAY) || 1000,
        maxBackups: Number(process.env.ATLAS_MAX_BACKUPS) || 5,
        useSqlite: true // Always use SQLite for better reliability
    };

    return createStorageManager(config);
}
