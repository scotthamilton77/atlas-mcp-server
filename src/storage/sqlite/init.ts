import { StorageConfig } from '../../types/storage.js';
import { SqliteStorage } from './storage.js';
import { Logger } from '../../logging/index.js';
import { SqliteErrorHandler } from './error-handler.js';
import { createConfig } from './config.js';
import { SqliteConnection } from './database/connection.js';
import { PlatformCapabilities } from '../../utils/platform-utils.js';
import { StartupBackupManager } from '../core/backup/startup-manager.js';
import type { Database } from 'better-sqlite3';

// Track temporary resources for cleanup
const tempConnections = new Set<Database>();
const tempTimeouts = new Set<NodeJS.Timeout>();

/**
 * Create a new SQLite storage instance
 */
export async function createStorage(config: StorageConfig): Promise<SqliteStorage> {
  const logger = Logger.getInstance().child({ component: 'SqliteStorage' });
  let storage: SqliteStorage | undefined;
  let startupBackupManager: StartupBackupManager | undefined;
  let connection: SqliteConnection | undefined;

  try {
    const { baseDir, name } = config;
    const path = await import('path');
    const dbPath = path.join(baseDir, `${name}.db`);

    logger.info('Initializing SQLite storage', {
      operation: 'createStorage',
      config: {
        baseDir,
        name,
        dbPath,
      },
    });

    // Ensure storage directory exists with proper permissions
    const fs = await import('fs/promises');

    try {
      // Create directory with platform-appropriate permissions
      await fs.mkdir(baseDir, {
        recursive: true,
        mode: PlatformCapabilities.getDefaultMode(),
      });

      // Verify directory permissions
      const dirStats = await fs.stat(baseDir);
      logger.info('Storage directory ready', {
        operation: 'createStorage',
        baseDir,
        mode: dirStats.mode,
        uid: dirStats.uid,
        gid: dirStats.gid,
      });

      // Single stat call to check if database exists and get its info
      try {
        const fileStats = await fs.stat(dbPath);

        // Only check WAL/SHM if database exists and has content
        if (fileStats.size > 0) {
          // Check for WAL/SHM files
          const walPath = `${dbPath}-wal`;
          const shmPath = `${dbPath}-shm`;
          const [walExists, shmExists] = await Promise.all([
            fs
              .access(walPath, fs.constants.F_OK)
              .then(() => true)
              .catch(() => false),
            fs
              .access(shmPath, fs.constants.F_OK)
              .then(() => true)
              .catch(() => false),
          ]);

          if (walExists || shmExists) {
            logger.warn('Database exists with WAL/SHM files - attempting recovery', {
              operation: 'createStorage',
              dbPath,
              dbSize: fileStats.size,
              walExists,
              shmExists,
            });

            // Attempt safe WAL checkpoint first
            const sqlite3 = await import('better-sqlite3');
            try {
              const tempDb = new sqlite3.default(dbPath, {
                verbose: (...args: unknown[]) => {
                  if (typeof args[0] === 'string') {
                    logger.debug(args[0]);
                  }
                },
                timeout: 30000,
                readonly: true, // Open readonly first to prevent modifications
              });
              tempConnections.add(tempDb);

              // Check database integrity first
              const integrityResult = tempDb.pragma('integrity_check');
              const isCorrupted = Array.isArray(integrityResult)
                ? integrityResult.some(r => r !== 'ok')
                : integrityResult !== 'ok';

              if (!isCorrupted) {
                // Database is healthy, perform safe checkpoint
                await tempDb.exec('PRAGMA wal_checkpoint(PASSIVE)');
                tempDb.close();
                tempConnections.delete(tempDb);

                logger.info('Successfully checkpointed database files', {
                  operation: 'createStorage',
                  dbPath,
                });
              } else {
                // Database is corrupted, attempt recovery
                tempDb.close();
                tempConnections.delete(tempDb);

                logger.warn('Database corruption detected - attempting recovery', {
                  operation: 'createStorage',
                  dbPath,
                });

                // Create backup before recovery attempt
                const backupPath = `${dbPath}.backup-${Date.now()}`;
                await fs.copyFile(dbPath, backupPath);

                // Attempt recovery with new connection
                const recoveryDb = new sqlite3.default(dbPath, {
                  timeout: 30000,
                });
                tempConnections.add(recoveryDb);

                try {
                  await recoveryDb.exec('PRAGMA wal_checkpoint(TRUNCATE)');
                  recoveryDb.close();
                  tempConnections.delete(recoveryDb);

                  logger.info('Successfully recovered database files', {
                    operation: 'createStorage',
                    dbPath,
                  });
                } catch (recoveryError) {
                  logger.error('Recovery failed - restoring from backup', {
                    error:
                      recoveryError instanceof Error
                        ? recoveryError.message
                        : String(recoveryError),
                    operation: 'createStorage',
                    dbPath,
                  });

                  // Restore from backup
                  await fs.copyFile(backupPath, dbPath);
                } finally {
                  // Clean up backup
                  await fs.unlink(backupPath).catch(() => {});
                }
              }
            } catch (error) {
              logger.error('Database access error during recovery', {
                error: error instanceof Error ? error.message : String(error),
                operation: 'createStorage',
                dbPath,
              });
              throw error;
            }
          }
        }

        logger.info('Database file accessible', {
          operation: 'createStorage',
          dbPath,
          mode: fileStats.mode,
          size: fileStats.size,
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === 'Database exists with WAL/SHM files - manual recovery required'
        ) {
          throw error;
        }
        // File doesn't exist or isn't accessible
        logger.info('Database file will be created', {
          operation: 'createStorage',
          dbPath,
        });
      }
    } catch (error) {
      logger.error('Storage directory error', {
        operation: 'createStorage',
        baseDir,
        dbPath,
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                code: (error as NodeJS.ErrnoException).code,
                errno: (error as NodeJS.ErrnoException).errno,
              }
            : String(error),
      });
      throw error;
    }

    // Create SQLite config with platform-specific settings and required fields
    const platformSqlite = PlatformCapabilities.getSqliteConfig();
    const sqliteConfig = createConfig({
      path: dbPath,
      baseDir: config.baseDir,
      name: config.name,
      connection: {
        maxConnections: config.connection?.maxConnections ?? 1,
        maxRetries: config.connection?.maxRetries ?? 3,
        retryDelay: config.connection?.retryDelay ?? 1000,
        busyTimeout: config.connection?.busyTimeout ?? 2000,
        idleTimeout: config.connection?.idleTimeout ?? 15000,
      },
      performance: {
        checkpointInterval: config.performance?.checkpointInterval ?? 30000,
        cacheSize: config.performance?.cacheSize ?? 2000,
        mmapSize: config.performance?.mmapSize ?? 67108864,
        pageSize: config.performance?.pageSize ?? platformSqlite.pageSize,
        maxMemory: config.performance?.maxMemory ?? 134217728,
        sharedMemory: platformSqlite.sharedMemory,
      },
      journalMode: config.journalMode ?? 'wal',
      synchronous: config.synchronous ?? 'normal',
      tempStore: config.tempStore ?? 'memory',
      readonly: config.readonly ?? false,
    });

    // Reduce retry delay and max wait time
    const retryDelay = 1000; // Reduced from 5000ms
    const maxWaitTime = 10000; // Reduced from 30000ms
    let lastError: unknown;
    const startTime = Date.now();

    while (true) {
      try {
        // Check for shutdown marker
        const markerPath = `${dbPath}.shutdown`;
        const markerExists = await fs
          .access(markerPath)
          .then(() => true)
          .catch(() => false);

        if (markerExists) {
          // Read shutdown timestamp
          const markerContent = await fs.readFile(markerPath, 'utf8');
          const shutdownTime = parseInt(markerContent, 10);
          const elapsed = Date.now() - shutdownTime;

          if (elapsed < 3000) {
            // Reduced wait time for cleanup if shutdown was recent
            const waitTime = 3000 - elapsed;
            logger.info('Recent shutdown detected, waiting for cleanup', {
              operation: 'createStorage',
              shutdownTime,
              elapsed,
              waitTime,
            });
            const shutdownTimeout = setTimeout(() => {}, waitTime);
            tempTimeouts.add(shutdownTimeout);
            await new Promise(resolve => {
              shutdownTimeout.unref();
              setTimeout(resolve, waitTime);
            });
            tempTimeouts.delete(shutdownTimeout);
          }

          // Clean up marker file
          try {
            await fs.unlink(markerPath);
          } catch (cleanupError) {
            logger.warn('Failed to clean up shutdown marker', {
              error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
              operation: 'createStorage',
              markerPath,
            });
          }
        }

        // Only clean up auxiliary files if they exist without a main database
        const dbExists = await fs
          .access(dbPath)
          .then(() => true)
          .catch(() => false);
        if (!dbExists) {
          // Clean up orphaned WAL/SHM files only if main DB doesn't exist
          await fs.unlink(`${dbPath}-wal`).catch(() => {});
          await fs.unlink(`${dbPath}-shm`).catch(() => {});
          await fs.unlink(`${dbPath}-journal`).catch(() => {});

          logger.info('Cleaned up orphaned auxiliary files', {
            operation: 'createStorage',
            dbPath,
          });
        }

        // Check if WAL or SHM files still exist after cleanup attempt
        const walExists = await fs
          .access(`${dbPath}-wal`)
          .then(() => true)
          .catch(() => false);
        const shmExists = await fs
          .access(`${dbPath}-shm`)
          .then(() => true)
          .catch(() => false);

        // If WAL/SHM files still exist, wait for them to be released
        if (walExists || shmExists) {
          const elapsed = Date.now() - startTime;
          if (elapsed >= maxWaitTime) {
            logger.error('Timed out waiting for database locks to clear', {
              operation: 'createStorage',
              elapsed,
              maxWaitTime,
              dbPath,
              walExists,
              shmExists,
            });
            throw new Error('Database lock timeout - manual cleanup may be required');
          }

          logger.info('Database files still locked, waiting for natural release...', {
            elapsed,
            maxWaitTime,
            context: {
              operation: 'createStorage',
              walExists,
              shmExists,
              dbPath,
            },
          });

          const retryTimeout = setTimeout(() => {}, retryDelay);
          tempTimeouts.add(retryTimeout);
          await new Promise(resolve => {
            retryTimeout.unref();
            setTimeout(resolve, retryDelay);
          });
          tempTimeouts.delete(retryTimeout);
          continue;
        }

        // Create connection first
        connection = new SqliteConnection(sqliteConfig);
        await connection.open();

        // Create startup backup manager after database is opened
        startupBackupManager = new StartupBackupManager(dbPath);
        break;
      } catch (error) {
        lastError = error;

        // Check if error is due to locked database
        if (
          error instanceof Error &&
          (error.message.includes('SQLITE_BUSY') || error.message.includes('SQLITE_LOCKED'))
        ) {
          const elapsed = Date.now() - startTime;
          if (elapsed >= maxWaitTime) {
            logger.error('Timed out waiting for database to unlock', {
              operation: 'createStorage',
              elapsed,
              maxWaitTime,
              error: error.message,
              dbPath,
            });
            throw new Error('Database lock timeout - manual cleanup may be required');
          }

          logger.warn('Database locked, retrying...', {
            elapsed,
            maxWaitTime,
            error: error.message,
            context: {
              operation: 'createStorage',
              dbPath,
            },
          });
          const lockTimeout = setTimeout(() => {}, retryDelay);
          tempTimeouts.add(lockTimeout);
          await new Promise(resolve => {
            lockTimeout.unref();
            setTimeout(resolve, retryDelay);
          });
          tempTimeouts.delete(lockTimeout);
          continue;
        }
        throw error;
      }
    }

    if (!connection) {
      throw lastError instanceof Error
        ? lastError
        : new Error('Failed to open database after retries');
    }

    // Create shutdown marker file
    const shutdownMarkerPath = `${dbPath}.shutdown`;
    await fs.writeFile(shutdownMarkerPath, Date.now().toString(), 'utf8');

    storage = new SqliteStorage(connection, sqliteConfig, startupBackupManager);
    await storage.initialize();

    // Create startup backup and initialize templates in parallel after initialization
    const initPromises = [];

    if (startupBackupManager) {
      initPromises.push(
        startupBackupManager.createStartupBackup().catch(error => {
          logger.error('Failed to create startup backup', {
            error: error instanceof Error ? error.message : String(error),
            operation: 'createStorage.backup',
          });
        })
      );
    }

    // Let initialization continue while backup and templates load
    Promise.all(initPromises).catch(error => {
      logger.error('Background initialization error', {
        error: error instanceof Error ? error.message : String(error),
        operation: 'createStorage.background',
      });
    });

    // Remove shutdown marker after successful initialization
    await fs.unlink(shutdownMarkerPath).catch(() => {});

    logger.info('SQLite storage initialized successfully', {
      operation: 'createStorage',
      config: {
        baseDir: config.baseDir,
        name: config.name,
      },
    });

    return storage;
  } catch (error) {
    logger.error('Failed to initialize SQLite storage', {
      error: error instanceof Error ? error : String(error),
      operation: 'createStorage',
      config: {
        baseDir: config.baseDir,
        name: config.name,
      },
    });

    // Clean up any temporary resources
    for (const tempDb of tempConnections) {
      try {
        tempDb.close();
      } catch (closeError) {
        logger.error('Failed to close temporary connection', {
          error: closeError instanceof Error ? closeError.message : String(closeError),
        });
      }
    }
    tempConnections.clear();

    for (const timeout of tempTimeouts) {
      clearTimeout(timeout);
    }
    tempTimeouts.clear();

    // Ensure cleanup if initialization fails
    if (storage) {
      try {
        // Create shutdown backup before closing
        if (startupBackupManager) {
          await startupBackupManager.createShutdownBackup();
        }
        await storage.close();
      } catch (closeError) {
        logger.error('Error during storage cleanup', {
          error: closeError instanceof Error ? closeError : String(closeError),
          operation: 'createStorage.cleanup',
        });
      }
    }

    const errorHandler = new SqliteErrorHandler();
    return errorHandler.handleInitError(error, {
      operation: 'createStorage',
      config: {
        baseDir: config.baseDir,
        name: config.name,
      },
      error: error instanceof Error ? error : new Error(String(error)),
    }) as never;
  }
}
