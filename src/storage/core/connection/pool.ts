/**
 * Database connection pool implementation
 */
import { Database, open } from 'sqlite';
import { Logger } from '../../../logging/index.js';
import { ErrorCodes, createError } from '../../../errors/index.js';
import { StorageConfig } from '../../../types/storage.js';
import { MonitoringConfig } from '../../monitoring/index.js';
import { ConnectionStateManager } from './state.js';
import { WALManager } from '../wal/manager.js';
import { join } from 'path';
import crypto from 'crypto';

interface PoolConnection {
    db: Database;
    id: string;
    inUse: boolean;
    lastUsed: number;
    createdAt: number;
    errorCount: number;
}

export class ConnectionPool {
    private readonly logger: Logger;
    private readonly config: StorageConfig;
    private readonly connections: Map<string, PoolConnection>;
    private readonly minConnections: number;
    private readonly maxConnections: number;
    private readonly idleTimeout: number;
    private readonly stateManager: ConnectionStateManager;
    private cleanupInterval: NodeJS.Timeout | null;
    private readonly dbPath: string;
    private readonly connectionIds = new WeakMap<Database, string>();
    private readonly verifiedConnections = new Set<string>();
    private isInitialized = false;

    constructor(config: StorageConfig & { monitoring?: MonitoringConfig }, options: {
        minConnections?: number;
        maxConnections?: number;
        idleTimeout?: number;
    } = {}) {
        this.logger = Logger.getInstance().child({ component: 'ConnectionPool' });
        this.config = config;
        this.connections = new Map();
        this.minConnections = options.minConnections || 1;  // Minimum connections
        this.maxConnections = options.maxConnections || 5;  // Reduced maximum
        this.idleTimeout = options.idleTimeout || 30000;   // 30 seconds
        this.cleanupInterval = null;
        this.dbPath = join(config.baseDir, `${config.name}.db`);
        
        // Initialize state manager with monitoring config
        this.stateManager = ConnectionStateManager.getInstance({
            errorThreshold: config.monitoring?.healthCheck?.errorThreshold,
            responseTimeThreshold: config.monitoring?.healthCheck?.responseTimeThreshold
        });
    }

    /**
     * Get the unique ID for a database connection
     */
    getConnectionId(db: Database): string {
        let id = this.connectionIds.get(db);
        if (!id) {
            id = crypto.randomUUID();
            this.connectionIds.set(db, id);
        }
        return id;
    }

    /**
     * Initialize the connection pool
     */
    async initialize(): Promise<void> {
        try {
            if (this.isInitialized) {
                // On reconnect, just verify and warm up connections
                await this.warmupConnections();
                return;
            }

            // First-time initialization
            const sqlite3 = await import('sqlite3');
            const initDb = await open({
                filename: this.dbPath,
                driver: sqlite3.default.Database,
                mode: sqlite3.default.OPEN_READWRITE | sqlite3.default.OPEN_CREATE
            });

            try {
                // Enable WAL mode before creating any connections
                const walManager = WALManager.getInstance(this.dbPath);
                await walManager.enableWAL(initDb);
            } finally {
                await initDb.close();
            }

            // Create and warm up initial connections
            await this.warmupConnections();
            this.isInitialized = true;

            // Start monitoring
            this.stateManager.startMonitoring();
            this.cleanupInterval = setInterval(
                () => this.cleanupIdleConnections(),
                this.idleTimeout
            );

            this.logger.info('Connection pool initialized', {
                minConnections: this.minConnections,
                maxConnections: this.maxConnections,
                idleTimeout: this.idleTimeout
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error('Failed to initialize connection pool', { error: errorMessage });
            throw createError(
                ErrorCodes.STORAGE_INIT,
                'Failed to initialize connection pool',
                errorMessage
            );
        }
    }

    /**
     * Get a connection from the pool
     */
    async getConnection(): Promise<Database> {
        // First try to find a healthy available connection
        for (const [id, conn] of this.connections.entries()) {
            if (!conn.inUse) {
                if (this.stateManager.isHealthy(id) && !this.stateManager.hasActiveTransaction(id)) {
                    conn.inUse = true;
                    conn.lastUsed = Date.now();
                    this.stateManager.markInUse(id);
                    this.logger.debug('Reusing healthy connection', { id });
                    return conn.db;
                }
            }
        }

        // If we haven't reached max connections, create a new one
        if (this.connections.size < this.maxConnections) {
            const conn = await this.createConnection();
            conn.inUse = true;
            this.stateManager.markInUse(conn.id);
            return conn.db;
        }

        // Otherwise wait for a connection to become available
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(createError(
                    ErrorCodes.STORAGE_ERROR,
                    'Connection timeout',
                    'Timed out waiting for available connection'
                ));
            }, this.config.connection?.busyTimeout || 2000);

            const checkConnection = async () => {
                for (const [id] of this.connections.entries()) {
                    const conn = this.connections.get(id);
                    if (conn && !conn.inUse) {
                        if (this.stateManager.isHealthy(id) && !this.stateManager.hasActiveTransaction(id)) {
                            clearTimeout(timeout);
                            conn.inUse = true;
                            conn.lastUsed = Date.now();
                            this.stateManager.markInUse(id);
                            this.logger.debug('Connection became available', { id });
                            resolve(conn.db);
                            return;
                        }
                    }
                }
                setTimeout(checkConnection, 100);
            };

            checkConnection();
        });
    }

    /**
     * Release a connection back to the pool
     */
    releaseConnection(db: Database): void {
        const id = this.getConnectionId(db);
        const conn = Array.from(this.connections.values()).find(c => c.id === id);
        
        if (conn) {
            conn.inUse = false;
            conn.lastUsed = Date.now();
            this.stateManager.markAvailable(id);
            this.logger.debug('Connection released', { id });
        }
    }

    /**
     * Create a new connection
     */
    private async createConnection(): Promise<PoolConnection> {
        const sqlite3 = await import('sqlite3');
        const id = crypto.randomUUID();
        
        try {
            const db = await open({
                filename: this.dbPath,
                driver: sqlite3.default.Database,
                mode: sqlite3.default.OPEN_READWRITE | sqlite3.default.OPEN_CREATE
            });

            // Store connection ID
            this.connectionIds.set(db, id);

            // Skip verification if already verified
            if (!this.verifiedConnections.has(id)) {
                try {
                    await db.get('SELECT 1');
                    this.verifiedConnections.add(id);
                    this.logger.debug('Connection verified', { id });
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    this.logger.error('Failed to verify connection', { error: msg, id });
                    await db.close().catch(() => {}); // Attempt to close on error
                    throw error;
                }
            }

            const conn: PoolConnection = {
                db,
                id,
                inUse: false,
                lastUsed: Date.now(),
                createdAt: Date.now(),
                errorCount: 0
            };
            this.connections.set(id, conn);
            this.stateManager.registerConnection(id);
            this.logger.debug('Created new connection', { id });
            return conn;
        } catch (error) {
            this.logger.error('Failed to create connection', {
                id,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Warm up connections by creating and verifying them
     */
    private async warmupConnections(): Promise<void> {
        const promises: Promise<void>[] = [];
        
        // Create minimum number of connections
        while (this.connections.size < this.minConnections) {
            promises.push(this.createConnection().then(() => {}));
        }

        // Wait for all connections to be created
        await Promise.all(promises);
    }

    /**
     * Clean up idle connections but maintain minimum
     */
    private async cleanupIdleConnections(): Promise<void> {
        const now = Date.now();
        const idsToRemove: string[] = [];

        // Find connections to remove
        for (const [id, conn] of this.connections.entries()) {
            if (!conn.inUse && 
                now - conn.lastUsed > this.idleTimeout &&
                this.connections.size > this.minConnections) {
                idsToRemove.push(id);
            }
        }

        // Remove connections
        for (const id of idsToRemove) {
            const conn = this.connections.get(id);
            if (conn) {
                try {
                    await conn.db.close();
                    this.connections.delete(id);
                    this.stateManager.unregisterConnection(id);
                    this.connectionIds.delete(conn.db);
                    this.logger.debug('Removed idle connection', { id });
                } catch (error) {
                    this.logger.error('Failed to close idle connection', {
                        id,
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
            }
        }
    }

    /**
     * Get current pool metrics
     */
    getMetrics() {
        const metrics = this.stateManager.getMetrics();
        return metrics;
    }

    /**
     * Close all connections
     */
    async close(): Promise<void> {
        this.stateManager.stopMonitoring();
        
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }

        for (const [id, conn] of this.connections.entries()) {
            try {
                await conn.db.close();
                this.stateManager.unregisterConnection(id);
                this.connectionIds.delete(conn.db);
                this.logger.debug('Closed connection', { id });
            } catch (error) {
                this.logger.error('Failed to close connection', {
                    id,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }

        this.connections.clear();
        this.logger.info('Connection pool closed');
    }
}
