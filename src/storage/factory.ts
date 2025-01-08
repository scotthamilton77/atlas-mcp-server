import { StorageConfig, TaskStorage } from '../types/storage.js';
import { createStorage } from './sqlite/init.js';
import path from 'path';
import { StorageFactoryErrorHandler } from './factory/error-handler.js';

/**
 * Create a default storage instance with standard configuration
 */
export async function createDefaultStorage(): Promise<TaskStorage> {
  const errorHandler = new StorageFactoryErrorHandler();

  // Ensure storage directory is an absolute path
  const baseDir = process.env.ATLAS_STORAGE_DIR
    ? path.resolve(process.env.ATLAS_STORAGE_DIR)
    : path.resolve(process.cwd(), '.atlas');

  const config: StorageConfig = {
    baseDir,
    name: process.env.ATLAS_STORAGE_NAME || 'atlas-tasks',
    connection: {
      maxConnections: 1, // Reduce to single connection for better stability
      maxRetries: 5, // Increase retry attempts
      retryDelay: 3000, // Increase delay between retries
      busyTimeout: 10000, // Increase busy timeout
      idleTimeout: 30000, // Increase idle timeout
    },
    performance: {
      cacheSize: 2000, // Increase cache size
      pageSize: 4096,
      mmapSize: 0, // Keep memory mapping disabled
      maxMemory: 64 * 1024 * 1024, // Increase to 64MB max memory
      checkpointInterval: 60000, // Increase checkpoint interval
      sharedMemory: false,
    },
    journalMode: 'delete', // Switch from WAL to rollback journal temporarily
    synchronous: 'full', // Increase durability
  };

  try {
    return await createStorage(config);
  } catch (error) {
    return errorHandler.handleCreateError(error, 'createDefaultStorage', { config });
  }
}
