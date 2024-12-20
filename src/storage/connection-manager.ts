/**
 * SQLite connection manager to handle connection pooling and lifecycle
 */
import sqlite3 from 'sqlite3';
import { Database, open } from 'sqlite';
import path from 'path';
import { Logger } from '../logging/index.js';
import { UnifiedStorageError } from './unified-storage.js';

export class ConnectionManager {
    private static instance: ConnectionManager;
    private connections: Map<string, Database> = new Map();
    private logger: Logger;

    private constructor() {
        this.logger = Logger.getInstance().child({ component: 'ConnectionManager' });
    }

    static getInstance(): ConnectionManager {
        if (!ConnectionManager.instance) {
            ConnectionManager.instance = new ConnectionManager();
        }
        return ConnectionManager.instance;
    }

    /**
     * Gets or creates a database connection with retry logic
     */
    async getConnection(dbPath: string, retries = 3, delay = 1000): Promise<Database> {
        if (this.connections.has(dbPath)) {
            return this.connections.get(dbPath)!;
        }

        let lastError: Error | null = null;
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const db = await open({
                    filename: dbPath,
                    driver: sqlite3.Database,
                    mode: sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
                });

                // Enable WAL mode and other optimizations
                await Promise.all([
                    db.exec('PRAGMA journal_mode = WAL'),
                    db.exec('PRAGMA synchronous = NORMAL'),
                    db.exec('PRAGMA temp_store = MEMORY'),
                    db.exec('PRAGMA mmap_size = 30000000000'),
                    db.exec('PRAGMA page_size = 4096'),
                    db.exec('PRAGMA busy_timeout = 5000'), // 5 second timeout for busy connections
                ]);

                this.connections.set(dbPath, db);
                this.logger.info('Database connection established', { path: dbPath, attempt });
                return db;
            } catch (error) {
                lastError = error as Error;
                this.logger.warn('Database connection attempt failed', { 
                    path: dbPath, 
                    attempt,
                    error,
                    willRetry: attempt < retries
                });

                if (attempt < retries) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        throw new UnifiedStorageError(
            'Failed to establish database connection',
            'CONNECTION_ERROR',
            lastError
        );
    }

    /**
     * Closes all database connections
     */
    async closeAll(): Promise<void> {
        for (const [path, db] of this.connections) {
            try {
                await db.close();
                this.connections.delete(path);
            } catch (error) {
                this.logger.error('Error closing database connection', { path, error });
            }
        }
    }

    /**
     * Closes a specific database connection
     */
    async closeConnection(dbPath: string): Promise<void> {
        const db = this.connections.get(dbPath);
        if (db) {
            try {
                await db.close();
                this.connections.delete(dbPath);
            } catch (error) {
                throw new UnifiedStorageError(
                    'Failed to close database connection',
                    'CONNECTION_CLOSE_ERROR',
                    error
                );
            }
        }
    }
}
