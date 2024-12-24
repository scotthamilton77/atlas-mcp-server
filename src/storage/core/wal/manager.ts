/**
 * WAL (Write-Ahead Logging) management
 */
import { Database } from 'sqlite';
import { Logger } from '../../../logging/index.js';
import { ErrorCodes, createError } from '../../../errors/index.js';
import { EventManager } from '../../../events/event-manager.js';
import { EventTypes } from '../../../types/events.js';
import { promises as fs } from 'fs';

export interface WALMetrics {
    isEnabled: boolean;
    walSize: number;
    lastCheckpoint: number;
    checkpointCount: number;
    autoCheckpointSize: number;
}

export class WALManager {
    private static instance: WALManager;
    private readonly logger: Logger;
    private readonly eventManager: EventManager;
    private isWALEnabled = false;
    private lastCheckpoint = 0;
    private checkpointCount = 0;
    private readonly dbPath: string;
    private checkpointInterval: NodeJS.Timeout | null = null;
    private readonly CHECKPOINT_INTERVAL = 60000; // 1 minute
    private readonly MAX_WAL_SIZE = 10 * 1024 * 1024; // 10MB

    private constructor(dbPath: string) {
        this.logger = Logger.getInstance().child({ component: 'WALManager' });
        this.eventManager = EventManager.getInstance();
        this.dbPath = dbPath;
        this.resetState();
    }

    /**
     * Reset internal state
     */
    private resetState(): void {
        this.isWALEnabled = false;
        this.lastCheckpoint = 0;
        this.checkpointCount = 0;
        if (this.checkpointInterval) {
            clearInterval(this.checkpointInterval);
            this.checkpointInterval = null;
        }
    }

    static getInstance(dbPath?: string): WALManager {
        if (!WALManager.instance) {
            if (!dbPath) {
                throw new Error('dbPath required for WALManager initialization');
            }
            WALManager.instance = new WALManager(dbPath);
        }
        return WALManager.instance;
    }

    /**
     * Enable WAL mode with proper locking and verification
     */
    async enableWAL(db: Database): Promise<void> {
        if (this.isWALEnabled) {
            return;
        }

        // Clean up any existing WAL files from previous runs
        await this.cleanupWALFiles();

        try {
            // Set exclusive lock to prevent other connections
            await db.exec('PRAGMA locking_mode = EXCLUSIVE');
            
            // Check current mode
            const currentMode = await db.get<{ journal_mode: string }>('PRAGMA journal_mode');
            
            if (currentMode?.journal_mode !== 'wal') {
                // Force checkpoint existing journal
                await db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
                
                // Enable WAL mode
                await db.exec('PRAGMA journal_mode = WAL');
                
                // Verify WAL mode
                const newMode = await db.get<{ journal_mode: string }>('PRAGMA journal_mode');
                if (newMode?.journal_mode !== 'wal') {
                    throw createError(
                        ErrorCodes.STORAGE_INIT,
                        'Failed to enable WAL mode',
                        `Expected 'wal', got '${newMode?.journal_mode}'`
                    );
                }

                try {
                    // Set synchronous mode first (must be outside transaction)
                    await db.exec('PRAGMA synchronous = NORMAL');
                    
                    // Verify synchronous setting
                    const syncMode = await db.get('PRAGMA synchronous');
                    if (syncMode?.synchronous !== 1) { // NORMAL = 1
                        throw new Error('Failed to set synchronous mode');
                    }

                    // Set other PRAGMAs in transaction
                    await db.exec('BEGIN IMMEDIATE');
                    await db.exec('PRAGMA wal_autocheckpoint = 1000');
                    await db.exec(`PRAGMA journal_size_limit = ${this.MAX_WAL_SIZE}`);
                    await db.exec('COMMIT');

                    // Verify transaction-safe settings
                    const checkpoint = await db.get('PRAGMA wal_autocheckpoint');
                    const journalSize = await db.get('PRAGMA journal_size_limit');

                    if (checkpoint?.wal_autocheckpoint !== 1000 ||
                        journalSize?.journal_size_limit !== this.MAX_WAL_SIZE) {
                        throw new Error('Failed to set WAL optimization settings');
                    }

                    this.isWALEnabled = true;
                    this.startCheckpointMonitoring(db);

                    this.logger.info('WAL mode enabled successfully', {
                        mode: newMode.journal_mode,
                        settings: {
                            synchronous: syncMode?.synchronous,
                            journal_mode: newMode.journal_mode,
                            wal_autocheckpoint: checkpoint?.wal_autocheckpoint,
                            journal_size_limit: journalSize?.journal_size_limit
                        }
                    });
                } catch (error) {
                    // Roll back transaction if it failed
                    await db.exec('ROLLBACK').catch(() => {});
                    throw error;
                }

                // Emit WAL enabled event
                this.eventManager.emitSystemEvent({
                    type: EventTypes.STORAGE_WAL_ENABLED,
                    timestamp: Date.now(),
                    metadata: {
                        dbPath: this.dbPath
                    }
                });
            } else {
                this.isWALEnabled = true;
                this.startCheckpointMonitoring(db);
                this.logger.info('Database already in WAL mode');
            }
        } catch (error) {
            // Ensure error is properly stringified
            const errorMessage = error instanceof Error 
                ? error.message 
                : error && typeof error === 'object'
                    ? JSON.stringify(error)
                    : String(error);
            
            this.logger.error('Failed to enable WAL mode', { 
                error: errorMessage,
                details: error instanceof Error ? error.stack : undefined
            });
            
            // Reset WAL state
            this.isWALEnabled = false;
            
            throw createError(
                ErrorCodes.STORAGE_INIT,
                'Failed to enable WAL mode',
                errorMessage
            );
        } finally {
            // Release exclusive lock
            try {
                await db.exec('PRAGMA locking_mode = NORMAL');
            } catch (error) {
                this.logger.warn('Failed to release exclusive lock', { error });
            }
        }
    }

    /**
     * Start periodic checkpoint monitoring
     */
    private startCheckpointMonitoring(db: Database): void {
        if (this.checkpointInterval) {
            return;
        }

        // Check WAL size periodically
        this.checkpointInterval = setInterval(async () => {
            try {
                const metrics = await this.getMetrics();
                
                // If WAL file is too large, force a checkpoint
                if (metrics.walSize > this.MAX_WAL_SIZE) {
                    await this.checkpoint(db);
                }
            } catch (error) {
                this.logger.error('Checkpoint monitoring failed', { error });
            }
        }, this.CHECKPOINT_INTERVAL);

        // Ensure the interval doesn't prevent the process from exiting
        this.checkpointInterval.unref();
    }

    /**
     * Force a WAL checkpoint
     */
    async checkpoint(db: Database): Promise<void> {
        try {
            await db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
            this.lastCheckpoint = Date.now();
            this.checkpointCount++;
            
            this.logger.info('WAL checkpoint completed', {
                checkpointCount: this.checkpointCount
            });

            // Emit checkpoint event
            this.eventManager.emitSystemEvent({
                type: EventTypes.STORAGE_WAL_CHECKPOINT,
                timestamp: Date.now(),
                metadata: {
                    checkpointCount: this.checkpointCount,
                    dbPath: this.dbPath
                }
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error('WAL checkpoint failed', { error: errorMessage });
            throw createError(
                ErrorCodes.STORAGE_ERROR,
                'WAL checkpoint failed',
                errorMessage
            );
        }
    }

    /**
     * Get WAL metrics
     */
    async getMetrics(): Promise<WALMetrics> {
        const walPath = `${this.dbPath}-wal`;
        let walSize = 0;

        try {
            const stats = await fs.stat(walPath);
            walSize = stats.size;
        } catch (error) {
            // WAL file might not exist yet
            this.logger.debug('Could not get WAL file size', { error });
        }

        return {
            isEnabled: this.isWALEnabled,
            walSize,
            lastCheckpoint: this.lastCheckpoint,
            checkpointCount: this.checkpointCount,
            autoCheckpointSize: 1000 // Pages
        };
    }

    /**
     * Verify WAL file integrity
     */
    async verifyWALIntegrity(): Promise<boolean> {
        const walPath = `${this.dbPath}-wal`;
        const shmPath = `${this.dbPath}-shm`;

        try {
            // Check if WAL and SHM files exist
            await Promise.all([
                fs.access(walPath),
                fs.access(shmPath)
            ]);

            // Get WAL file size
            const stats = await fs.stat(walPath);
            
            // Basic integrity checks
            if (stats.size === 0) {
                this.logger.warn('WAL file is empty', { walPath });
                return false;
            }

            if (stats.size % 4096 !== 0) {
                this.logger.warn('WAL file size is not page-aligned', { 
                    size: stats.size,
                    walPath 
                });
                return false;
            }

            return true;
        } catch (error) {
            this.logger.warn('WAL integrity check failed', { error });
            return false;
        }
    }

    /**
     * Clean up any existing WAL files
     */
    private lastCleanup = 0;
    private readonly CLEANUP_INTERVAL = 1000; // 1 second

    private async cleanupWALFiles(): Promise<void> {
        const now = Date.now();
        // Only cleanup every 5 seconds to reduce memory pressure
        if (now - this.lastCleanup < this.CLEANUP_INTERVAL) {
            return;
        }

        const walPath = `${this.dbPath}-wal`;
        const shmPath = `${this.dbPath}-shm`;

        try {
            // Check if files exist first to avoid unnecessary operations
            const [walExists, shmExists] = await Promise.all([
                fs.access(walPath).then(() => true).catch(() => false),
                fs.access(shmPath).then(() => true).catch(() => false)
            ]);

            // Only delete if files exist
            if (walExists || shmExists) {
                const promises = [];
                if (walExists) promises.push(fs.unlink(walPath));
                if (shmExists) promises.push(fs.unlink(shmPath));
                await Promise.all(promises);
                this.logger.debug('Cleaned up existing WAL files');
            }
        } catch (error) {
            // Ignore errors as files may not exist
            this.logger.debug('No existing WAL files to clean up');
        } finally {
            this.lastCleanup = now;
        }
    }

    /**
     * Clean up resources
     */
    async close(): Promise<void> {
        try {
            // Stop checkpoint monitoring
            if (this.checkpointInterval) {
                clearInterval(this.checkpointInterval);
                this.checkpointInterval = null;
            }

            // Clean up WAL files
            await this.cleanupWALFiles();
            
            // Reset state
            this.resetState();

            this.logger.info('WAL manager closed successfully');
        } catch (error) {
            this.logger.error('Error closing WAL manager', { error });
            throw error;
        }
    }
}
