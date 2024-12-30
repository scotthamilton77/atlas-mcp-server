import { StorageConfig } from '../../types/storage.js';
import { SqliteStorage } from './storage.js';
import { Logger } from '../../logging/index.js';
import { SqliteErrorHandler } from './error-handler.js';

/**
 * Create a new SQLite storage instance
 */
export async function createStorage(config: StorageConfig): Promise<SqliteStorage> {
  const logger = Logger.getInstance().child({ component: 'SqliteStorage' });
  let storage: SqliteStorage | undefined;

  try {
    logger.info('Initializing SQLite storage', {
      operation: 'createStorage',
      baseDir: config.baseDir,
      name: config.name,
      config: {
        ...config,
        connection: {
          maxConnections: config.connection?.maxConnections ?? 3,
          idleTimeout: config.connection?.idleTimeout ?? 15000,
          busyTimeout: config.connection?.busyTimeout ?? 5000,
        },
        performance: {
          cacheSize: config.performance?.cacheSize ?? 8000,
          pageSize: config.performance?.pageSize ?? 4096,
          mmapSize: config.performance?.mmapSize ?? 67108864, // 64MB
          maxMemory: config.performance?.maxMemory ?? 134217728, // 128MB
        },
      },
    });

    // Ensure storage directory exists with proper permissions
    const fs = await import('fs/promises');
    const path = await import('path');
    const storageDir = config.baseDir;
    const dbPath = path.join(storageDir, `${config.name}.db`);

    try {
      // Create directory with explicit permissions
      await fs.mkdir(storageDir, {
        recursive: true,
        mode: 0o755, // rwxr-xr-x
      });

      // Verify directory permissions
      const dirStats = await fs.stat(storageDir);
      logger.info('Storage directory ready', {
        operation: 'createStorage',
        storageDir,
        mode: dirStats.mode,
        uid: dirStats.uid,
        gid: dirStats.gid,
      });

      // Check if database file exists and is accessible
      try {
        await fs.access(dbPath, fs.constants.F_OK);
        // File exists, check if we can read/write
        await fs.access(dbPath, fs.constants.R_OK | fs.constants.W_OK);
        const fileStats = await fs.stat(dbPath);
        logger.info('Database file accessible', {
          operation: 'createStorage',
          dbPath,
          mode: fileStats.mode,
          size: fileStats.size,
        });
      } catch (error) {
        // File doesn't exist or isn't accessible
        logger.info('Database file will be created', {
          operation: 'createStorage',
          dbPath,
        });
      }
    } catch (error) {
      logger.error('Storage directory error', {
        operation: 'createStorage',
        storageDir,
        dbPath,
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                code: (error as any).code,
                errno: (error as any).errno,
              }
            : error,
      });
      throw error;
    }

    storage = new SqliteStorage(config);
    await storage.initialize();

    logger.info('SQLite storage initialized successfully', {
      operation: 'createStorage',
      baseDir: config.baseDir,
      name: config.name,
    });

    return storage;
  } catch (error) {
    logger.error('Failed to initialize SQLite storage', error, {
      operation: 'createStorage',
      baseDir: config.baseDir,
      name: config.name,
    });

    // Ensure cleanup if initialization fails
    if (storage) {
      try {
        await storage.close();
      } catch (closeError) {
        logger.error('Error during storage cleanup', closeError, {
          operation: 'createStorage.cleanup',
        });
      }
    }

    const errorHandler = new SqliteErrorHandler();
    return errorHandler.handleInitError(error, {
      operation: 'createStorage',
      baseDir: config.baseDir,
      name: config.name,
      storageDir: config.baseDir,
      error: error instanceof Error ? error : new Error(String(error)),
    }) as never;
  }
}
