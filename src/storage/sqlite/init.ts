import { Logger } from '../../logging/index.js';
import { createDefaultStorage } from '../factory.js';
import { promises as fs } from 'fs';

let initialized = false;

/**
 * Verifies SQLite database integrity
 */
export async function verifySqliteIntegrity(dbPath: string): Promise<boolean> {
    const logger = Logger.getInstance();
    const storage = await createDefaultStorage();
    
    try {
        await storage.initialize();
        await storage.beginTransaction();
        
        try {
            await storage.analyze();
            await storage.vacuum();
            await storage.checkpoint();
            
            await storage.commitTransaction();
            await storage.close();
            
            logger.info('SQLite integrity check passed', { path: dbPath });
            return true;
        } catch (error) {
            await storage.rollbackTransaction();
            throw error;
        }
    } catch (error) {
        logger.error('SQLite integrity check failed', {
            path: dbPath,
            error: error instanceof Error ? error.message : String(error)
        });
        return false;
    }
}

/**
 * Gets SQLite database statistics
 */
export async function getSqliteStats(dbPath: string): Promise<{
    size: number;
    walSize: number;
    pageCount: number;
    pageSize: number;
    journalMode: string;
}> {
    const logger = Logger.getInstance();
    const storage = await createDefaultStorage();
    
    try {
        await storage.initialize();
        const metrics = await storage.getMetrics();
        await storage.close();

        const stats = await fs.stat(dbPath);
        const walPath = `${dbPath}-wal`;
        const walStats = await fs.stat(walPath).catch(() => ({ size: 0 }));

        const result = {
            size: stats.size,
            walSize: walStats.size,
            pageCount: metrics.storage.pageCount,
            pageSize: metrics.storage.pageSize,
            journalMode: 'WAL'
        };

        logger.debug('SQLite stats retrieved', {
            path: dbPath,
            stats: result
        });

        return result;
    } catch (error) {
        logger.error('Failed to get SQLite stats', {
            path: dbPath,
            error: error instanceof Error ? error.message : String(error)
        });
        throw error;
    }
}

export async function initializeSqliteStorage(dbPath?: string): Promise<void> {
    const logger = Logger.getInstance();

    // Prevent multiple initializations
    if (initialized) {
        logger.debug('SQLite storage already initialized');
        return;
    }

    try {
        // Initialize storage with configuration
        const storage = dbPath 
            ? await createDefaultStorage() 
            : await createDefaultStorage();
        
        // Set up cleanup on process exit
        let isCleaningUp = false;
        const cleanup = async (signal: string) => {
            if (isCleaningUp) {
                return;
            }
            isCleaningUp = true;

            // Only log cleanup start if we're actually going to do it
            if (!(storage as any).isClosed) {
                logger.info('Cleaning up SQLite storage...', { signal });
            }
            try {
                await storage.close();
            } catch (error) {
                // Only log non-"already closed" errors
                if (!(error instanceof Error && error.message.includes('Database handle is closed'))) {
                    logger.error('Error closing SQLite storage', {
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
            }

            // Exit after cleanup
            process.exit(0);
        };

        // Handle termination signals
        process.once('SIGINT', () => cleanup('SIGINT'));
        process.once('SIGTERM', () => cleanup('SIGTERM'));
        process.once('beforeExit', () => cleanup('beforeExit'));

        // Handle uncaught errors
        process.on('uncaughtException', async (error) => {
            logger.error('Uncaught exception, cleaning up...', {
                error: error instanceof Error ? error.message : String(error)
            });
            await cleanup('uncaughtException');
        });

        initialized = true;
        logger.info('SQLite storage initialization completed');
    } catch (error) {
        logger.error('Failed to initialize SQLite storage', {
            error: error instanceof Error ? error.message : String(error)
        });
        throw error;
    }
}
