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
      maxConnections: 3,
      maxRetries: 3,
      retryDelay: 1000,
      busyTimeout: 2000,
      idleTimeout: 15000,
    },
    performance: {
      cacheSize: 500,
      pageSize: 4096,
      mmapSize: 0, // Disable memory mapping
      maxMemory: 32 * 1024 * 1024, // 32MB max memory
      checkpointInterval: 30000,
      sharedMemory: false,
    },
  };

  try {
    return await createStorage(config);
  } catch (error) {
    return errorHandler.handleCreateError(error, 'createDefaultStorage', { config });
  }
}
