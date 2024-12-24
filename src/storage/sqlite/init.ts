import { Logger } from '../../logging/index.js';
import { createDefaultStorage } from '../factory.js';

/**
 * Sets up cleanup handlers for SQLite storage
 */
export async function initializeSqliteStorage(): Promise<void> {
    const logger = Logger.getInstance();
    const storage = await createDefaultStorage();
    
    // Set up cleanup on process exit
    let isCleaningUp = false;
    const cleanup = async (signal: string) => {
        if (isCleaningUp) {
            return;
        }
        isCleaningUp = true;

        try {
            logger.info('Cleaning up SQLite storage...', { signal });
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

    logger.info('SQLite cleanup handlers initialized');
}
