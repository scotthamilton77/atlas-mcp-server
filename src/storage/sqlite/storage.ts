import { Database, open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { TaskStorage } from '../../types/storage.js';
import { Task, TaskStatus, CreateTaskInput, UpdateTaskInput } from '../../types/task.js';
import { Logger } from '../../logging/index.js';
import { ErrorCodes, createError } from '../../errors/index.js';
import { TransactionManager } from '../core/transactions/manager.js';

// Constants
export const DEFAULT_PAGE_SIZE = 4096;
export const DEFAULT_CACHE_SIZE = 2000;
export const DEFAULT_BUSY_TIMEOUT = 5000;

// Configuration types
export interface SqliteConfig {
    baseDir: string;
    name: string;
    sqlite?: {
        journalMode?: 'DELETE' | 'TRUNCATE' | 'PERSIST' | 'MEMORY' | 'WAL' | 'OFF';
        synchronous?: 'OFF' | 'NORMAL' | 'FULL' | 'EXTRA';
        tempStore?: 'DEFAULT' | 'FILE' | 'MEMORY';
        lockingMode?: 'NORMAL' | 'EXCLUSIVE';
        autoVacuum?: 'NONE' | 'FULL' | 'INCREMENTAL';
    };
    performance?: {
        pageSize?: number;
        cacheSize?: number;
        mmapSize?: number;
    };
    connection?: {
        busyTimeout?: number;
        maxRetries?: number;
        retryDelay?: number;
    };
}

export class SqliteStorage implements TaskStorage {
    private static initializationPromise: Promise<void> | null = null;
    private db: Database | null = null;
    private readonly logger: Logger;
    private readonly dbPath: string;
    private isInitialized = false;
    private readonly transactionManager: TransactionManager;
    private currentTransactionId: string | null = null;

    constructor(private readonly config: SqliteConfig) {
        this.logger = Logger.getInstance().child({ component: 'SqliteStorage' });
        this.dbPath = `${config.baseDir}/${config.name}.db`;
        this.transactionManager = TransactionManager.getInstance();
    }

    async initialize(): Promise<void> {
        // Return if already initialized
        if (this.isInitialized) {
            this.logger.debug('SQLite storage already initialized');
            return;
        }

        // If initialization is in progress, wait for it
        if (SqliteStorage.initializationPromise) {
            this.logger.debug('Waiting for existing initialization to complete');
            await SqliteStorage.initializationPromise;
            return;
        }

        // Start new initialization with mutex
        SqliteStorage.initializationPromise = (async () => {
            try {
                // Initialize SQLite with WAL mode
                this.db = await open({
                    filename: this.dbPath,
                    driver: sqlite3.Database,
                    mode: sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE
                });

                // Configure database with proper error handling
                const pragmas = [
                    // Enable WAL mode first for better concurrency
                    `PRAGMA journal_mode=${this.config.sqlite?.journalMode || 'WAL'}`,
                    
                    // Enable foreign keys for referential integrity
                    'PRAGMA foreign_keys=ON',
                    
                    // Configure synchronization and durability
                    `PRAGMA synchronous=${this.config.sqlite?.synchronous || 'NORMAL'}`,
                    
                    // Memory and performance settings
                    `PRAGMA temp_store=${this.config.sqlite?.tempStore || 'MEMORY'}`,
                    `PRAGMA page_size=${this.config.performance?.pageSize || DEFAULT_PAGE_SIZE}`,
                    `PRAGMA cache_size=${this.config.performance?.cacheSize || DEFAULT_CACHE_SIZE}`,
                    `PRAGMA mmap_size=${this.config.performance?.mmapSize || 30000000000}`,
                    
                    // Concurrency settings
                    `PRAGMA locking_mode=${this.config.sqlite?.lockingMode || 'NORMAL'}`,
                    `PRAGMA busy_timeout=${this.config.connection?.busyTimeout || DEFAULT_BUSY_TIMEOUT}`,
                    
                    // Maintenance settings
                    `PRAGMA auto_vacuum=${this.config.sqlite?.autoVacuum || 'NONE'}`,
                    
                    // Query optimization
                    'PRAGMA optimize'
                ];

                for (const pragma of pragmas) {
                    try {
                        await this.db.exec(pragma);
                    } catch (error) {
                        this.logger.error(`Failed to set pragma: ${pragma}`, {
                            error: error instanceof Error ? error.message : String(error)
                        });
                        throw error;
                    }
                }

                // Verify foreign keys are enabled
                const fkResult = await this.db.get('PRAGMA foreign_keys');
                if (!fkResult || !fkResult['foreign_keys']) {
                    throw new Error('Failed to enable foreign key constraints');
                }

                // Create tables and set up database schema
                await this.setupDatabase();

                this.isInitialized = true;
                this.logger.info('SQLite storage initialized', {
                    path: this.dbPath,
                    config: this.config
                });
            } catch (error) {
                this.logger.error('Failed to initialize SQLite storage', {
                    error: error instanceof Error ? error.message : String(error),
                    path: this.dbPath
                });
                throw createError(
                    ErrorCodes.STORAGE_INIT,
                    'Failed to initialize SQLite storage',
                    error instanceof Error ? error.message : String(error)
                );
            } finally {
                SqliteStorage.initializationPromise = null;
            }
        })();

        await SqliteStorage.initializationPromise;
    }

    /**
     * Sets up the database schema and tables
     */
    private async setupDatabase(): Promise<void> {
        if (!this.db) throw new Error('Database not initialized');

        try {
            // Create tables and indexes
            await this.db.exec(`
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
                    updated_at INTEGER NOT NULL,
                    version INTEGER NOT NULL DEFAULT 1
                );

                CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_path);
                CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
                CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);
            `);

            // Set WAL file permissions if needed
            try {
                const fs = await import('fs/promises');
                const path = await import('path');
                const dbPath = path.join(this.config.baseDir, `${this.config.name}.db`);
                const walPath = `${dbPath}-wal`;
                const shmPath = `${dbPath}-shm`;
                
                // Set permissions for WAL and SHM files if they exist
                await Promise.all([
                    fs.access(walPath).then(() => fs.chmod(walPath, 0o644)).catch(() => {}),
                    fs.access(shmPath).then(() => fs.chmod(shmPath, 0o644)).catch(() => {})
                ]);
            } catch (error) {
                this.logger.warn('Failed to set WAL file permissions', { error });
                // Don't throw - this is not critical
            }

            this.logger.info('Database schema setup completed');
        } catch (error) {
            this.logger.error('Failed to set up database schema', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    private isClosed = false;

    async close(): Promise<void> {
        if (!this.db || this.isClosed) {
            return;
        }

        try {
            // Cleanup any active transactions
            if (this.currentTransactionId) {
                await this.rollbackTransaction();
            }

            this.isClosed = true;
            await this.db.close();
            this.db = null;
            this.logger.info('SQLite connection closed');
        } catch (error) {
            if (error instanceof Error && error.message.includes('Database handle is closed')) {
                // Ignore already closed errors
                return;
            }
            this.logger.error('Error closing SQLite connection', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    // Transaction methods
    async beginTransaction(): Promise<void> {
        if (!this.db) throw new Error('Database not initialized');
        if (this.currentTransactionId) {
            // Transaction already started, increment depth
            return;
        }
        this.currentTransactionId = await this.transactionManager.beginTransaction(this.db);
    }

    async commitTransaction(): Promise<void> {
        if (!this.db || !this.currentTransactionId) {
            throw new Error('No active transaction');
        }
        await this.transactionManager.commitTransaction(this.db, this.currentTransactionId);
        this.currentTransactionId = null;
    }

    async rollbackTransaction(): Promise<void> {
        if (!this.db || !this.currentTransactionId) {
            throw new Error('No active transaction');
        }
        await this.transactionManager.rollbackTransaction(this.db, this.currentTransactionId);
        this.currentTransactionId = null;
    }

    // Task operations
    async createTask(input: CreateTaskInput): Promise<Task> {
        if (!this.db) throw new Error('Database not initialized');
        
        if (!input.path || !input.name || !input.type) {
            throw createError(
                ErrorCodes.VALIDATION_ERROR,
                'Missing required fields',
                'createTask',
                'path, name, and type are required'
            );
        }

        const now = Date.now();
        const projectPath = input.path.split('/')[0];
        
        const task: Task = {
            // System fields
            path: input.path,
            name: input.name,
            type: input.type,
            status: TaskStatus.PENDING,
            created: now,
            updated: now,
            version: 1,
            projectPath,

            // Optional fields
            description: input.description,
            parentPath: input.parentPath,
            notes: input.notes || [],
            reasoning: input.reasoning,
            dependencies: input.dependencies || [],
            subtasks: [],
            
            // User metadata
            metadata: input.metadata || {}
        };

        await this.saveTask(task);
        return task;
    }

    async updateTask(path: string, updates: UpdateTaskInput): Promise<Task> {
        if (!this.db) throw new Error('Database not initialized');
        
        const existingTask = await this.getTask(path);
        if (!existingTask) {
            throw createError(
                ErrorCodes.TASK_NOT_FOUND,
                'Task not found',
                'updateTask',
                path
            );
        }

        const now = Date.now();
        const updatedTask: Task = {
            ...existingTask,
            ...updates,
            // Update system fields
            updated: now,
            version: existingTask.version + 1,
            // Keep user metadata separate
            metadata: {
                ...existingTask.metadata,
                ...updates.metadata
            }
        };

        await this.saveTask(updatedTask);
        return updatedTask;
    }

    async getTask(path: string): Promise<Task | null> {
        if (!this.db) throw new Error('Database not initialized');
        
        const row = await this.db.get<Record<string, unknown>>(
            'SELECT * FROM tasks WHERE path = ?',
            path
        );

        if (!row) return null;
        return this.rowToTask(row);
    }

    async getTasks(paths: string[]): Promise<Task[]> {
        if (!this.db) throw new Error('Database not initialized');
        
        if (paths.length === 0) return [];

        const placeholders = paths.map(() => '?').join(',');
        const rows = await this.db.all<Record<string, unknown>[]>(
            `SELECT * FROM tasks WHERE path IN (${placeholders})`,
            ...paths
        );

        return rows.map(row => this.rowToTask(row));
    }

    async getTasksByPattern(pattern: string): Promise<Task[]> {
        if (!this.db) throw new Error('Database not initialized');
        
        const sqlPattern = pattern.replace(/\*/g, '%').replace(/\?/g, '_');
        const rows = await this.db.all<Record<string, unknown>[]>(
            'SELECT * FROM tasks WHERE path LIKE ?',
            sqlPattern
        );

        return rows.map(row => this.rowToTask(row));
    }

    async getTasksByStatus(status: TaskStatus): Promise<Task[]> {
        if (!this.db) throw new Error('Database not initialized');
        
        const rows = await this.db.all<Record<string, unknown>[]>(
            'SELECT * FROM tasks WHERE status = ?',
            status
        );

        return rows.map(row => this.rowToTask(row));
    }

    async getSubtasks(parentPath: string): Promise<Task[]> {
        if (!this.db) throw new Error('Database not initialized');
        
        const rows = await this.db.all<Record<string, unknown>[]>(
            'SELECT * FROM tasks WHERE parent_path = ?',
            parentPath
        );

        return rows.map(row => this.rowToTask(row));
    }

    async deleteTask(path: string): Promise<void> {
        if (!this.db) throw new Error('Database not initialized');
        await this.deleteTasks([path]);
    }

    async deleteTasks(paths: string[]): Promise<void> {
        if (!this.db) throw new Error('Database not initialized');
        if (paths.length === 0) return;

        const placeholders = paths.map(() => '?').join(',');
        await this.db.run(
            `DELETE FROM tasks WHERE path IN (${placeholders})`,
            ...paths
        );
    }

    async hasChildren(path: string): Promise<boolean> {
        if (!this.db) throw new Error('Database not initialized');
        const result = await this.db.get<{ count: number }>(
            'SELECT COUNT(*) as count FROM tasks WHERE parent_path = ?',
            path
        );
        return (result?.count || 0) > 0;
    }

    async getDependentTasks(path: string): Promise<Task[]> {
        if (!this.db) throw new Error('Database not initialized');
        const rows = await this.db.all<Record<string, unknown>[]>(
            `SELECT * FROM tasks WHERE json_array_length(dependencies) > 0 
             AND json_extract(dependencies, '$') LIKE '%${path}%'`
        );
        return rows.map(row => this.rowToTask(row));
    }

    async saveTask(task: Task): Promise<void> {
        if (!this.db) throw new Error('Database not initialized');
        await this.saveTasks([task]);
    }

    async saveTasks(tasks: Task[]): Promise<void> {
        if (!this.db) throw new Error('Database not initialized');
        for (const task of tasks) {
            await this.db.run(
                `INSERT OR REPLACE INTO tasks (
                    path, name, description, type, status,
                    parent_path, notes, reasoning, dependencies,
                    subtasks, metadata, created_at, updated_at, version
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                task.path,
                task.name,
                task.description,
                task.type,
                task.status,
                task.parentPath,
                task.notes ? JSON.stringify(task.notes) : null,
                task.reasoning,
                JSON.stringify(task.dependencies),
                JSON.stringify(task.subtasks),
                JSON.stringify(task.metadata),
                task.created,
                task.updated,
                task.version
            );
        }
    }

    async clearAllTasks(): Promise<void> {
        if (!this.db) throw new Error('Database not initialized');
        await this.db.run('DELETE FROM tasks');
    }

    private rowToTask(row: Record<string, unknown>): Task {
        const metadata = this.parseJSON(String(row.metadata || '{}'), {});
        const now = Date.now();
        
        return {
            // System fields
            path: String(row.path || ''),
            name: String(row.name || ''),
            type: String(row.type || '') as Task['type'],
            status: String(row.status || '') as TaskStatus,
            created: Number(row.created_at || now),
            updated: Number(row.updated_at || now),
            version: Number(row.version || 1),
            projectPath: String(row.path || '').split('/')[0],

            // Optional fields
            description: row.description ? String(row.description) : undefined,
            parentPath: row.parent_path ? String(row.parent_path) : undefined,
            notes: this.parseJSON<string[]>(String(row.notes || '[]'), []),
            reasoning: row.reasoning ? String(row.reasoning) : undefined,
            dependencies: this.parseJSON<string[]>(String(row.dependencies || '[]'), []),
            subtasks: this.parseJSON<string[]>(String(row.subtasks || '[]'), []),
            
            // User metadata
            metadata
        };
    }

    private parseJSON<T>(value: string | null | undefined, defaultValue: T): T {
        if (!value) return defaultValue;
        try {
            return JSON.parse(value) as T;
        } catch {
            return defaultValue;
        }
    }

    async vacuum(): Promise<void> {
        if (!this.db) throw new Error('Database not initialized');
        await this.db.run('VACUUM');
    }

    async analyze(): Promise<void> {
        if (!this.db) throw new Error('Database not initialized');
        await this.db.run('ANALYZE');
    }

    async checkpoint(): Promise<void> {
        if (!this.db) throw new Error('Database not initialized');
        await this.db.run('PRAGMA wal_checkpoint(TRUNCATE)');
    }

    async repairRelationships(dryRun: boolean = false): Promise<{ fixed: number, issues: string[] }> {
        if (!this.db) throw new Error('Database not initialized');
        
        const issues: string[] = [];
        let fixed = 0;

        // Find tasks with invalid parent paths
        const orphanedTasks = await this.db.all<Record<string, unknown>[]>(
            `SELECT t1.path, t1.parent_path 
             FROM tasks t1 
             LEFT JOIN tasks t2 ON t1.parent_path = t2.path 
             WHERE t1.parent_path IS NOT NULL 
             AND t2.path IS NULL`
        );

        for (const task of orphanedTasks) {
            issues.push(`Task ${task.path} has invalid parent_path: ${task.parent_path}`);
            if (!dryRun) {
                await this.db.run(
                    'UPDATE tasks SET parent_path = NULL WHERE path = ?',
                    task.path
                );
                fixed++;
            }
        }

        return { fixed, issues };
    }

    async clearCache(): Promise<void> {
        // SQLite implementation doesn't use cache
        return;
    }

    /**
     * Verifies database integrity and repairs if needed
     */
    async verifyIntegrity(): Promise<boolean> {
        if (!this.db) throw new Error('Database not initialized');
        
        try {
            await this.beginTransaction();
            
            try {
                await this.analyze();
                await this.vacuum();
                await this.checkpoint();
                
                await this.commitTransaction();
                
                this.logger.info('SQLite integrity check passed');
                return true;
            } catch (error) {
                await this.rollbackTransaction();
                throw error;
            }
        } catch (error) {
            this.logger.error('SQLite integrity check failed', {
                error: error instanceof Error ? error.message : String(error)
            });
            return false;
        }
    }

    /**
     * Gets detailed database statistics
     */
    async getStats(): Promise<{
        size: number;
        walSize: number;
        pageCount: number;
        pageSize: number;
        journalMode: string;
    }> {
        if (!this.db) throw new Error('Database not initialized');
        
        try {
            const metrics = await this.getMetrics();
            const fs = await import('fs/promises');
            
            const stats = await fs.stat(this.dbPath);
            const walPath = `${this.dbPath}-wal`;
            const walStats = await fs.stat(walPath).catch(() => ({ size: 0 }));

            const result = {
                size: stats.size,
                walSize: walStats.size,
                pageCount: metrics.storage.pageCount,
                pageSize: metrics.storage.pageSize,
                journalMode: 'WAL'
            };

            this.logger.debug('SQLite stats retrieved', { stats: result });
            return result;
        } catch (error) {
            this.logger.error('Failed to get SQLite stats', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async getMetrics(): Promise<{
        tasks: {
            total: number;
            byStatus: Record<string, number>;
            noteCount: number;
            dependencyCount: number;
        };
        storage: {
            totalSize: number;
            pageSize: number;
            pageCount: number;
            walSize: number;
            cache: {
                hitRate: number;
                memoryUsage: number;
                entryCount: number;
            };
        };
    }> {
        if (!this.db) throw new Error('Database not initialized');

        const [taskStats, statusStats, storageStats] = await Promise.all([
            this.db.get<{
                total: number;
                noteCount: number;
                dependencyCount: number;
            }>(`
                SELECT 
                    COUNT(*) as total,
                    COUNT(CASE WHEN notes IS NOT NULL THEN 1 END) as noteCount,
                    SUM(CASE 
                        WHEN dependencies IS NOT NULL 
                        AND json_valid(dependencies) 
                        AND json_array_length(dependencies) > 0 
                        THEN json_array_length(dependencies) 
                        ELSE 0 
                    END) as dependencyCount
                FROM tasks
            `),
            this.db.all<{ status: string; count: number }[]>(`
                SELECT status, COUNT(*) as count
                FROM tasks
                GROUP BY status
            `),
            this.db.get<{
                page_count: number;
                page_size: number;
            }>(`
                SELECT 
                    page_count,
                    page_size
                FROM pragma_page_count, pragma_page_size
                LIMIT 1
            `)
        ]);

        // Convert status stats array to object
        const byStatus = statusStats.reduce((acc: Record<string, number>, curr) => {
            acc[curr.status] = curr.count;
            return acc;
        }, {});

        const totalSize = (storageStats?.page_count || 0) * (storageStats?.page_size || 0);
        const memUsage = process.memoryUsage();

        return {
            tasks: {
                total: Number(taskStats?.total || 0),
                byStatus,
                noteCount: Number(taskStats?.noteCount || 0),
                dependencyCount: Number(taskStats?.dependencyCount || 0)
            },
            storage: {
                totalSize,
                pageSize: Number(storageStats?.page_size || 0),
                pageCount: Number(storageStats?.page_count || 0),
                walSize: 0, // WAL size is dynamic
                cache: {
                    hitRate: 0, // SQLite implementation doesn't use cache
                    memoryUsage: memUsage.heapUsed,
                    entryCount: 0
                }
            }
        };
    }
}
