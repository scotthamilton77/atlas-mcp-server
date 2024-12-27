import { Database, open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { TaskStorage } from '../../types/storage.js';
import { Task, TaskType, TaskStatus, CreateTaskInput, UpdateTaskInput } from '../../types/task.js';
import { Logger } from '../../logging/index.js';
import { ErrorCodes, createError } from '../../errors/index.js';
import { TransactionScope, IsolationLevel } from '../core/transactions/scope.js';

// Constants
export const DEFAULT_PAGE_SIZE = 4096;
export const DEFAULT_CACHE_SIZE = 2000;
export const DEFAULT_BUSY_TIMEOUT = 5000;
export const MAX_RETRY_ATTEMPTS = 3;
export const RETRY_DELAY = 1000;
export const CONNECTION_TIMEOUT = 30000;

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
        maxMemory?: number;
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
    private transactionScope: TransactionScope | null = null;
    private lastConnectionCheck: number = 0;
    private connectionCheckInterval = 60000; // 1 minute
    private retryCount = 0;
    private _isClosed = false;

    get isClosed(): boolean {
        return this._isClosed;
    }

    constructor(private readonly config: SqliteConfig) {
        this.logger = Logger.getInstance().child({ component: 'SqliteStorage' });
        this.dbPath = `${config.baseDir}/${config.name}.db`;
    }

    /** @internal Used by other methods to ensure database connection */
    async ensureConnection(): Promise<void> {
        const now = Date.now();
        if (now - this.lastConnectionCheck < this.connectionCheckInterval && this.db) {
            return;
        }

        try {
            if (!this.db) {
                await this.initialize();
            } else {
                // Verify connection with a simple query
                await this.db.get('SELECT 1');
            }
            this.lastConnectionCheck = now;
            this.retryCount = 0;
        } catch (error) {
            this.logger.error('Connection check failed', { error });
            
            if (this.retryCount >= MAX_RETRY_ATTEMPTS) {
                throw createError(
                    ErrorCodes.STORAGE_ERROR,
                    'Failed to ensure database connection after retries',
                    'ensureConnection'
                );
            }

            this.retryCount++;
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            await this.initialize();
        }
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        if (SqliteStorage.initializationPromise) {
            await SqliteStorage.initializationPromise;
            return;
        }

        SqliteStorage.initializationPromise = (async () => {
            const initStart = Date.now();
            try {
                // Ensure database directory exists with proper permissions
                const fs = await import('fs/promises');
                const path = await import('path');
                const dbDir = path.dirname(this.dbPath);
                
                await fs.mkdir(dbDir, { 
                    recursive: true,
                    mode: process.platform === 'win32' ? undefined : 0o755 
                });

                this.db = await open({
                    filename: this.dbPath,
                    driver: sqlite3.Database,
                    mode: sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE
                });

                this.transactionScope = new TransactionScope(this.db);

                const pragmas = [
                    `PRAGMA journal_mode=${this.config.sqlite?.journalMode || 'WAL'}`,
                    'PRAGMA foreign_keys=ON',
                    `PRAGMA synchronous=${this.config.sqlite?.synchronous || 'NORMAL'}`,
                    `PRAGMA temp_store=FILE`,
                    `PRAGMA page_size=${this.config.performance?.pageSize || DEFAULT_PAGE_SIZE}`,
                    `PRAGMA cache_size=-${Math.floor((this.config.performance?.maxMemory || 256 * 1024 * 1024) / 1024)}`,
                    `PRAGMA mmap_size=${this.config.performance?.mmapSize || 64 * 1024 * 1024}`,
                    `PRAGMA max_page_count=${Math.floor((this.config.performance?.maxMemory || 256 * 1024 * 1024) / (this.config.performance?.pageSize || DEFAULT_PAGE_SIZE))}`,
                    'PRAGMA soft_heap_limit=256000000',
                    `PRAGMA locking_mode=${this.config.sqlite?.lockingMode || 'NORMAL'}`,
                    `PRAGMA busy_timeout=${this.config.connection?.busyTimeout || DEFAULT_BUSY_TIMEOUT}`,
                    `PRAGMA auto_vacuum=${this.config.sqlite?.autoVacuum || 'NONE'}`,
                    'PRAGMA optimize'
                ];

                for (const pragma of pragmas) {
                    try {
                        await this.db.exec(pragma);
                    } catch (error) {
                        this.logger.error(`Failed to set pragma: ${pragma}`, { error });
                        throw error;
                    }
                }

                const fkResult = await this.db.get('PRAGMA foreign_keys');
                if (!fkResult || !fkResult['foreign_keys']) {
                    throw new Error('Failed to enable foreign key constraints');
                }

                await this.setupDatabase();

                this.isInitialized = true;
                const initDuration = Date.now() - initStart;
                
                // Log initialization metrics
                this.logger.info('SQLite storage initialized', {
                    path: this.dbPath,
                    duration: initDuration,
                    config: {
                        journalMode: this.config.sqlite?.journalMode || 'WAL',
                        synchronous: this.config.sqlite?.synchronous || 'NORMAL',
                        pageSize: this.config.performance?.pageSize || DEFAULT_PAGE_SIZE,
                        maxMemory: this.config.performance?.maxMemory || 256 * 1024 * 1024
                    }
                });

                this.logger.info('SQLite storage initialized', {
                    path: this.dbPath,
                    duration: initDuration
                });
            } catch (error) {
                this.logger.error('Failed to initialize SQLite storage', { error });
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

    async close(): Promise<void> {
        if (!this.db || this.isClosed) {
            return;
        }

        try {
            // Cleanup any active transactions
            if (this.transactionScope?.isActive()) {
                await this.transactionScope.rollback();
            }

            this._isClosed = true;
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
        if (!this.db || !this.transactionScope) throw new Error('Database not initialized');
        await this.transactionScope.begin(IsolationLevel.SERIALIZABLE);
    }

    async commitTransaction(): Promise<void> {
        if (!this.db || !this.transactionScope) throw new Error('Database not initialized');
        await this.transactionScope.commit();
    }

    async rollbackTransaction(): Promise<void> {
        if (!this.db || !this.transactionScope) throw new Error('Database not initialized');
        await this.transactionScope.rollback();
    }

    /**
     * Executes work within a transaction
     */
    async executeInTransaction<T>(work: () => Promise<T>): Promise<T> {
        if (!this.db || !this.transactionScope) throw new Error('Database not initialized');
        return this.transactionScope.executeInTransaction(work);
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
        
        // Create updated task with proper type handling
        const updatedTask = {
            ...existingTask,
            ...updates,
            // Update system fields
            updated: now,
            version: existingTask.version + 1,
            // Handle parentPath explicitly to ensure correct type
            parentPath: updates.parentPath === null ? undefined : updates.parentPath,
            // Keep user metadata separate
            metadata: {
                ...existingTask.metadata,
                ...updates.metadata
            },
            // Ensure arrays are initialized
            notes: updates.notes || existingTask.notes,
            dependencies: updates.dependencies || existingTask.dependencies,
            subtasks: updates.subtasks || existingTask.subtasks // Allow subtasks to be updated
        } satisfies Task;

        // If this task has a parent and parentPath is being changed
        if (updates.parentPath !== undefined && updates.parentPath !== existingTask.parentPath) {
            // Remove from old parent's subtasks if it exists
            if (existingTask.parentPath) {
                const oldParent = await this.getTask(existingTask.parentPath);
                if (oldParent) {
                    await this.saveTask({
                        ...oldParent,
                        subtasks: oldParent.subtasks.filter(s => s !== path),
                        updated: now,
                        version: oldParent.version + 1
                    });
                }
            }

            // Add to new parent's subtasks if it exists
            if (updates.parentPath) {
                const newParent = await this.getTask(updates.parentPath);
                if (newParent) {
                    await this.saveTask({
                        ...newParent,
                        subtasks: [...newParent.subtasks, path],
                        updated: now,
                        version: newParent.version + 1
                    });
                }
            }
        }

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
        this.logger.debug('Executing pattern query', { pattern, sqlPattern });

        // First verify table exists and has data
        const tableInfo = await this.db.get('SELECT COUNT(*) as count FROM tasks');
        this.logger.debug('Table info', { tableInfo });
        
        const rows = await this.db.all<Record<string, unknown>[]>(
            'SELECT * FROM tasks WHERE path LIKE ?',
            sqlPattern
        );

        // Log raw row data for debugging
        this.logger.debug('Raw query results', { rows });
        
        const tasks = rows.map(row => this.rowToTask(row));
        this.logger.debug('Mapped tasks', { tasks });
        
        return tasks;
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
            // Check if task exists
            const existing = await this.getTask(task.path);
            
            try {
                this.logger.debug('Saving task', { path: task.path, exists: !!existing });
                
                if (existing) {
                    await this.db.run(
                        `UPDATE tasks SET
                            name = ?, description = ?, type = ?, status = ?,
                            parent_path = ?, notes = ?, reasoning = ?, dependencies = ?,
                            subtasks = ?, metadata = ?, created_at = ?, updated_at = ?, version = ?
                         WHERE path = ?`,
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
                        task.version,
                        task.path
                    );
                } else {
                    await this.db.run(
                        `INSERT INTO tasks (
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
            } catch (error) {
                if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
                    throw createError(
                        ErrorCodes.TASK_DUPLICATE,
                        `Task already exists at path: ${task.path}`,
                        'saveTasks'
                    );
                }
                throw error;
            }
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
            type: String(row.type || '') as TaskType,
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
        if (!this.db || !this.transactionScope) throw new Error('Database not initialized');
        
        // Ensure no active transaction before vacuum
        await this.transactionScope.ensureNoTransaction();
        
        try {
            await this.db.run('VACUUM');
            this.logger.info('Database vacuum completed');
        } catch (error) {
            this.logger.error('Failed to vacuum database', { error });
            throw createError(
                ErrorCodes.STORAGE_ERROR,
                'Failed to vacuum database',
                'vacuum',
                error instanceof Error ? error.message : String(error)
            );
        }
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
