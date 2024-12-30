import { SqliteStorage } from './storage.js';
import { SqliteConfig } from './config.js';
import { Logger } from '../../logging/index.js';
import { TaskStorage } from '../../types/storage.js';
import { createError, ErrorCodes } from '../../errors/index.js';

const logger = Logger.getInstance().child({ component: 'StorageFactory' });

/**
 * Creates a new SQLite storage instance with the given configuration
 */
export async function createStorage(config: SqliteConfig): Promise<TaskStorage> {
  try {
    const storage = new SqliteStorage(config);
    await storage.initialize();
    return storage;
  } catch (error) {
    logger.error('Failed to create storage', { error });
    throw createError(
      ErrorCodes.STORAGE_INIT,
      'Failed to create storage',
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Creates a storage instance with default configuration
 */
export async function createDefaultStorage(): Promise<TaskStorage> {
  return createStorage({
    baseDir: process.env.ATLAS_STORAGE_DIR || './data',
    name: process.env.ATLAS_STORAGE_NAME || 'atlas-tasks',
    sqlite: {
      journalMode: 'WAL',
      synchronous: 'NORMAL',
      tempStore: 'MEMORY',
      lockingMode: 'NORMAL',
    },
    performance: {
      pageSize: 4096,
      cacheSize: 2000,
      mmapSize: 64 * 1024 * 1024,
      maxMemory: 256 * 1024 * 1024,
    },
    connection: {
      busyTimeout: 5000,
      maxRetries: 3,
      retryDelay: 1000,
    },
  });
}
