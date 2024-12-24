/**
 * SQLite storage initialization
 */
import { Logger } from '../../logging/index.js';
import { ConfigManager } from '../../config/index.js';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { open } from 'sqlite';
import { ErrorCodes, createError } from '../../errors/index.js';
import { EventManager } from '../../events/event-manager.js';
import { EventTypes } from '../../types/events.js';

export async function initializeSqliteStorage(dbPath?: string): Promise<void> {
    const logger = Logger.getInstance().child({ component: 'SqliteInit' });
    const configManager = ConfigManager.getInstance();
    const eventManager = EventManager.getInstance();
    const config = configManager.getConfig();

    // Use provided path or construct from config
    if (!dbPath) {
        const { baseDir, name } = config.storage;
        dbPath = join(baseDir, `${name}.db`);
    }

    try {
        // Ensure storage directory exists and is writable
        const dbDir = dirname(dbPath);
        await fs.mkdir(dbDir, { recursive: true });
        await fs.access(dbDir, fs.constants.W_OK);

        // Import sqlite3 with reduced memory footprint
        const sqlite3 = await import('sqlite3');
        logger.info('SQLite3 module imported', {
            sqlite3: typeof sqlite3,
            modes: ['Database', 'Statement', 'Backup'] // Only log essential modes
        });

        // Increase available memory for Node.js
        if (global.gc) {
            global.gc();
        }

        // Clean up WAL files with reduced memory pressure
        const [walExists, shmExists] = await Promise.all([
            fs.access(`${dbPath}-wal`).then(() => true).catch(() => false),
            fs.access(`${dbPath}-shm`).then(() => true).catch(() => false)
        ]);

        if (walExists || shmExists) {
            const promises = [];
            if (walExists) promises.push(fs.unlink(`${dbPath}-wal`));
            if (shmExists) promises.push(fs.unlink(`${dbPath}-shm`));
            await Promise.all(promises);
            logger.debug('Cleaned up existing WAL files');
        }

        // Open database with default settings first
        const db = await open({
            filename: dbPath,
            driver: sqlite3.default.Database,
            mode: sqlite3.default.OPEN_READWRITE | sqlite3.default.OPEN_CREATE
        });

        try {
            // Set transaction-unsafe PRAGMAs first
            await db.exec('PRAGMA journal_mode = WAL');
            await db.exec('PRAGMA synchronous = NORMAL');

            // Verify critical settings
            const [journalMode, syncMode] = await Promise.all([
                db.get('PRAGMA journal_mode'),
                db.get('PRAGMA synchronous')
            ]);

            if (journalMode?.journal_mode !== 'wal') {
                throw new Error(`Failed to set WAL mode, current mode: ${journalMode?.journal_mode}`);
            }
            if (syncMode?.synchronous !== 1) { // NORMAL = 1
                throw new Error('Failed to set synchronous mode');
            }

            // Set remaining PRAGMAs in transaction
            await db.exec(`
                BEGIN IMMEDIATE;
                PRAGMA busy_timeout = 5000;
                PRAGMA temp_store = FILE;
                PRAGMA foreign_keys = ON;
                PRAGMA wal_autocheckpoint = 500;
                PRAGMA cache_size = ${config.storage.performance?.cacheSize || 1000};
                PRAGMA mmap_size = ${config.storage.performance?.mmapSize || 268435456};
                PRAGMA page_size = ${config.storage.performance?.pageSize || 4096};
                PRAGMA journal_size_limit = 10485760;
                COMMIT;
            `);

            logger.info('Database configured successfully', {
                settings: {
                    journal_mode: journalMode.journal_mode,
                    synchronous: syncMode.synchronous
                }
            });

            // Create tasks table if it doesn't exist
            try {
                logger.info('Creating database schema...');
                
                // Create table
                await db.exec(`
                    CREATE TABLE IF NOT EXISTS tasks (
                        path TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        description TEXT,
                        type TEXT NOT NULL,
                        status TEXT NOT NULL,
                        parent_path TEXT,
                        notes TEXT,
                        reasoning TEXT,
                        dependencies TEXT,
                        subtasks TEXT,
                        metadata TEXT,
                        created_at INTEGER NOT NULL,
                        updated_at INTEGER NOT NULL
                    )
                `);
                logger.info('Tasks table created or verified');

                // Create indexes
                await db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_path)');
                await db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)');
                await db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type)');
                logger.info('Indexes created or verified');

                // Verify table exists
                const tableCheck = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'");
                if (!tableCheck) {
                    throw new Error('Tasks table was not created successfully');
                }

                // Log table structure
                const tableInfo = await db.all('PRAGMA table_info(tasks)');
                logger.info('Table structure verified', { columns: tableInfo });
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                logger.error('Failed to create database schema', { error: msg });
                throw error;
            }

            // Force a checkpoint to ensure WAL file is minimal
            await db.exec('PRAGMA wal_checkpoint(TRUNCATE)');

            // Emit initialization event
            eventManager.emitSystemEvent({
                type: EventTypes.SYSTEM_STARTUP,
                timestamp: Date.now(),
                metadata: {
                    component: 'SqliteInit',
                    dbPath,
                    walMode: true
                }
            });

            logger.info('SQLite storage initialization completed successfully');
        } finally {
            await db.close();
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to initialize SQLite storage', {
            error: errorMessage,
            dbPath
        });
        throw createError(
            ErrorCodes.STORAGE_INIT,
            'Failed to initialize SQLite storage',
            errorMessage
        );
    }
}

/**
 * Verify SQLite database integrity
 */
export async function verifySqliteIntegrity(dbPath: string): Promise<boolean> {
    const logger = Logger.getInstance().child({ component: 'SqliteInit' });
    const sqlite3 = await import('sqlite3');

    try {
        const db = await open({
            filename: dbPath,
            driver: sqlite3.default.Database,
            mode: sqlite3.default.OPEN_READWRITE
        });

        try {
            // Run integrity check
            const result = await db.get('PRAGMA integrity_check');
            const isValid = result?.integrity_check === 'ok';

            if (!isValid) {
                logger.error('Database integrity check failed', {
                    dbPath,
                    result
                });
            }

            return isValid;
        } finally {
            await db.close();
        }
    } catch (error) {
        logger.error('Failed to verify database integrity', {
            error,
            dbPath
        });
        return false;
    }
}

/**
 * Get SQLite database size and stats
 */
export async function getSqliteStats(dbPath: string): Promise<{
    size: number;
    walSize: number;
    pageCount: number;
    pageSize: number;
}> {
    const logger = Logger.getInstance().child({ component: 'SqliteInit' });

    try {
        // Get database file stats
        const dbStats = await fs.stat(dbPath);
        const walStats = await fs.stat(`${dbPath}-wal`).catch(() => ({ size: 0 }));

        // Get page info
        const sqlite3 = await import('sqlite3');
        const db = await open({
            filename: dbPath,
            driver: sqlite3.default.Database,
            mode: sqlite3.default.OPEN_READONLY
        });

        try {
            const pageSize = await db.get<{ page_size: number }>('PRAGMA page_size');
            const pageCount = await db.get<{ page_count: number }>('PRAGMA page_count');

            return {
                size: dbStats.size,
                walSize: walStats.size,
                pageCount: pageCount?.page_count || 0,
                pageSize: pageSize?.page_size || 4096
            };
        } finally {
            await db.close();
        }
    } catch (error) {
        logger.error('Failed to get database stats', {
            error,
            dbPath
        });
        return {
            size: 0,
            walSize: 0,
            pageCount: 0,
            pageSize: 4096
        };
    }
}
