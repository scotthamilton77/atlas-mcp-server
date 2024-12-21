/**
 * SQLite storage implementation
 */
import { Database, open } from 'sqlite';
import { Task, TaskStatus } from '../types/task.js';
import { StorageConfig, TaskStorage, StorageMetrics } from '../types/storage.js';
import { Logger } from '../logging/index.js';
import { ErrorCodes, createError } from '../errors/index.js';
import { ConnectionManager } from './connection-manager.js';

export class SqliteStorage implements TaskStorage {
    private db: Database | null = null;
    private readonly logger: Logger;
    private readonly config: StorageConfig;
    private readonly connectionManager: ConnectionManager;

    constructor(config: StorageConfig) {
        this.config = config;
        this.logger = Logger.getInstance().child({ component: 'SqliteStorage' });
        this.connectionManager = new ConnectionManager(config.connection);
    }

    async initialize(): Promise<void> {
        const dbPath = `${this.config.baseDir}/${this.config.name}.db`;
        this.logger.debug('Opening SQLite database', { dbPath });

        try {
            // Import required modules
            const fs = await import('fs/promises');
            const path = await import('path');
            
            // Ensure storage directory exists with proper permissions
            await fs.mkdir(path.dirname(dbPath), { recursive: true, mode: 0o750 });
            this.logger.debug('Storage directory created/verified', { path: path.dirname(dbPath) });

            // Import sqlite3 with verbose mode for better error messages
            const sqlite3 = (await import('sqlite3')).default;
            this.logger.debug('SQLite3 module imported');

            // Initialize database with retry support
            await this.connectionManager.executeWithRetry(async () => {
                try {
                    // Initialize database with promise interface
                    this.db = await open({
                        filename: dbPath,
                        driver: sqlite3.Database,
                        mode: sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE
                    });
                    this.logger.debug('Database opened successfully');
                } catch (err) {
                    this.logger.error('Failed to open database', {
                        error: err instanceof Error ? {
                            name: err.name,
                            message: err.message,
                            stack: err.stack,
                            code: (err as any).code,
                            errno: (err as any).errno
                        } : err
                    });
                    throw err;
                }

                // Set busy timeout
                await this.db.run(`PRAGMA busy_timeout = ${this.config.connection?.busyTimeout || 5000}`);

                // Enable extended error codes
                await this.db.run('PRAGMA extended_result_codes = ON');

                // Configure database
                if (this.config.performance) {
                    await this.db.exec(`
                        PRAGMA cache_size=${this.config.performance.cacheSize || 2000};
                        PRAGMA mmap_size=${this.config.performance.mmapSize || 30000000000};
                        PRAGMA page_size=${this.config.performance.pageSize || 4096};
                        PRAGMA journal_mode=WAL;
                        PRAGMA synchronous=NORMAL;
                        PRAGMA temp_store=MEMORY;
                        PRAGMA foreign_keys=ON;
                        PRAGMA busy_timeout=${this.config.connection?.busyTimeout || 5000};
                    `);
                }
            }, 'initialize');

            await this.setupDatabase();
            this.logger.info('SQLite storage initialized', { path: this.config.baseDir });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const errorDetails = {
                error: error instanceof Error ? {
                    stack: error.stack,
                    ...error,
                    // Ensure custom properties don't get overwritten
                    customProps: Object.getOwnPropertyNames(error).reduce((acc, key) => {
                        if (key !== 'name' && key !== 'message' && key !== 'stack') {
                            acc[key] = (error as any)[key];
                        }
                        return acc;
                    }, {} as Record<string, unknown>)
                } : error,
                config: {
                    baseDir: this.config.baseDir,
                    name: this.config.name,
                    dbPath: `${this.config.baseDir}/${this.config.name}.db`
                }
            };
            
            this.logger.error('Failed to initialize SQLite storage', errorDetails);
            
            // Try to get more details about the SQLite error
            if (error instanceof Error && 'code' in error) {
                this.logger.error('SQLite error details', {
                    code: (error as any).code,
                    errno: (error as any).errno,
                    syscall: (error as any).syscall
                });
            }
            
            throw createError(
                ErrorCodes.STORAGE_INIT,
                'Failed to initialize SQLite storage',
                `${errorMessage} - Details: ${JSON.stringify(errorDetails, null, 2)}`
            );
        }
    }

    private async setupDatabase(): Promise<void> {
        if (!this.db) {
            throw createError(
                ErrorCodes.STORAGE_ERROR,
                'Database not initialized'
            );
        }

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
                updated_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_path);
            CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
            CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);
        `);
    }

    async saveTask(task: Task): Promise<void> {
        await this.saveTasks([task]);
    }

    async saveTasks(tasks: Task[]): Promise<void> {
        if (!this.db) {
            throw createError(
                ErrorCodes.STORAGE_ERROR,
                'Database not initialized'
            );
        }

        try {
            await this.db.run('BEGIN TRANSACTION');

            for (const task of tasks) {
                await this.db.run(
                    `INSERT OR REPLACE INTO tasks (
                        path, name, description, type, status,
                        parent_path, notes, reasoning, dependencies,
                        subtasks, metadata, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
                    task.metadata.created,
                    task.metadata.updated
                );
            }

            await this.db.run('COMMIT');
        } catch (error) {
            await this.db.run('ROLLBACK');
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('Failed to save tasks', { error: errorMessage, tasks });
            throw createError(
                ErrorCodes.STORAGE_WRITE,
                'Failed to save tasks',
                errorMessage
            );
        }
    }

    async getTask(path: string): Promise<Task | null> {
        if (!this.db) {
            throw createError(
                ErrorCodes.STORAGE_ERROR,
                'Database not initialized'
            );
        }

        try {
            const row = await this.db.get<Record<string, unknown>>(
                'SELECT * FROM tasks WHERE path = ?',
                path
            );

            if (!row) {
                return null;
            }

            return this.rowToTask(row);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('Failed to get task', { error: errorMessage, path });
            throw createError(
                ErrorCodes.STORAGE_READ,
                'Failed to get task',
                errorMessage
            );
        }
    }

    async getTasks(paths: string[]): Promise<Task[]> {
        if (!this.db) {
            throw createError(
                ErrorCodes.STORAGE_ERROR,
                'Database not initialized'
            );
        }

        try {
            const placeholders = paths.map(() => '?').join(',');
            const rows = await this.db.all<Record<string, unknown>[]>(
                `SELECT * FROM tasks WHERE path IN (${placeholders})`,
                ...paths
            );

            return rows.map(row => this.rowToTask(row));
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('Failed to get tasks', { error: errorMessage, paths });
            throw createError(
                ErrorCodes.STORAGE_READ,
                'Failed to get tasks',
                errorMessage
            );
        }
    }

    async getTasksByPattern(pattern: string): Promise<Task[]> {
        if (!this.db) {
            throw createError(
                ErrorCodes.STORAGE_ERROR,
                'Database not initialized'
            );
        }

        try {
            // Convert glob pattern to SQL LIKE pattern
            const sqlPattern = pattern
                .replace(/\*/g, '%') // * becomes %
                .replace(/\?/g, '_') // ? becomes _
                .replace(/\[!/g, '[^') // [!a-z] becomes [^a-z]
                .replace(/\[([^\]]+)]/g, (_match, chars) => 
                    // Handle character classes [a-z] -> [a-z]
                    `[${chars.replace(/\\([*?[])/g, '$1')}]`
                );

            this.logger.debug('Converting glob pattern to SQL', {
                original: pattern,
                sql: sqlPattern
            });

            const rows = await this.db.all<Record<string, unknown>[]>(
                'SELECT * FROM tasks WHERE path GLOB ?',
                sqlPattern
            );

            return rows.map(row => this.rowToTask(row));
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('Failed to get tasks by pattern', { error: errorMessage, pattern });
            throw createError(
                ErrorCodes.STORAGE_READ,
                'Failed to get tasks by pattern',
                errorMessage
            );
        }
    }

    async getTasksByStatus(status: TaskStatus): Promise<Task[]> {
        if (!this.db) {
            throw createError(
                ErrorCodes.STORAGE_ERROR,
                'Database not initialized'
            );
        }

        try {
            const rows = await this.db.all<Record<string, unknown>[]>(
                'SELECT * FROM tasks WHERE status = ?',
                status
            );

            return rows.map(row => this.rowToTask(row));
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('Failed to get tasks by status', { error: errorMessage, status });
            throw createError(
                ErrorCodes.STORAGE_READ,
                'Failed to get tasks by status',
                errorMessage
            );
        }
    }

    async getSubtasks(parentPath: string): Promise<Task[]> {
        if (!this.db) {
            throw createError(
                ErrorCodes.STORAGE_ERROR,
                'Database not initialized'
            );
        }

        try {
            const rows = await this.db.all<Record<string, unknown>[]>(
                'SELECT * FROM tasks WHERE parent_path = ?',
                parentPath
            );

            return rows.map(row => this.rowToTask(row));
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('Failed to get subtasks', { error: errorMessage, parentPath });
            throw createError(
                ErrorCodes.STORAGE_READ,
                'Failed to get subtasks',
                errorMessage
            );
        }
    }

    async deleteTask(path: string): Promise<void> {
        await this.deleteTasks([path]);
    }

    async deleteTasks(paths: string[]): Promise<void> {
        if (!this.db) {
            throw createError(
                ErrorCodes.STORAGE_ERROR,
                'Database not initialized'
            );
        }

        try {
            await this.db.run('BEGIN TRANSACTION');

            for (const path of paths) {
                await this.db.run('DELETE FROM tasks WHERE path = ?', path);
            }

            await this.db.run('COMMIT');
        } catch (error) {
            await this.db.run('ROLLBACK');
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('Failed to delete tasks', { error: errorMessage, paths });
            throw createError(
                ErrorCodes.STORAGE_DELETE,
                'Failed to delete tasks',
                errorMessage
            );
        }
    }

    async vacuum(): Promise<void> {
        if (!this.db) {
            throw createError(
                ErrorCodes.STORAGE_ERROR,
                'Database not initialized'
            );
        }

        try {
            await this.db.run('VACUUM');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('Failed to vacuum database', { error: errorMessage });
            throw createError(
                ErrorCodes.STORAGE_ERROR,
                'Failed to vacuum database',
                errorMessage
            );
        }
    }

    async analyze(): Promise<void> {
        if (!this.db) {
            throw createError(
                ErrorCodes.STORAGE_ERROR,
                'Database not initialized'
            );
        }

        try {
            await this.db.run('ANALYZE');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('Failed to analyze database', { error: errorMessage });
            throw createError(
                ErrorCodes.STORAGE_ERROR,
                'Failed to analyze database',
                errorMessage
            );
        }
    }

    async checkpoint(): Promise<void> {
        if (!this.db) {
            throw createError(
                ErrorCodes.STORAGE_ERROR,
                'Database not initialized'
            );
        }

        try {
            await this.db.run('PRAGMA wal_checkpoint(TRUNCATE)');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('Failed to checkpoint database', { error: errorMessage });
            throw createError(
                ErrorCodes.STORAGE_ERROR,
                'Failed to checkpoint database',
                errorMessage
            );
        }
    }

    async getMetrics(): Promise<StorageMetrics> {
        if (!this.db) {
            throw createError(
                ErrorCodes.STORAGE_ERROR,
                'Database not initialized'
            );
        }

        try {
            const [taskStats, storageStats] = await Promise.all([
                this.db.get<Record<string, unknown>>(`
                    SELECT 
                        COUNT(*) as total,
                        SUM(CASE WHEN notes IS NOT NULL THEN 1 ELSE 0 END) as noteCount,
                        SUM(CASE WHEN dependencies IS NOT NULL THEN json_array_length(dependencies) ELSE 0 END) as dependencyCount,
                        json_group_object(status, COUNT(*)) as byStatus
                    FROM tasks
                `),
                this.db.get<Record<string, unknown>>(`
                    SELECT 
                        page_count * page_size as totalSize,
                        page_size,
                        page_count,
                        (SELECT page_count * page_size FROM pragma_wal_checkpoint) as wal_size
                    FROM pragma_page_count, pragma_page_size
                `)
            ]);

            return {
                tasks: {
                    total: Number(taskStats?.total || 0),
                    byStatus: this.parseJSON(String(taskStats?.byStatus || '{}'), {}),
                    noteCount: Number(taskStats?.noteCount || 0),
                    dependencyCount: Number(taskStats?.dependencyCount || 0)
                },
                storage: {
                    totalSize: Number(storageStats?.totalSize || 0),
                    pageSize: Number(storageStats?.page_size || 0),
                    pageCount: Number(storageStats?.page_count || 0),
                    walSize: Number(storageStats?.wal_size || 0)
                }
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('Failed to get storage metrics', { error: errorMessage });
            throw createError(
                ErrorCodes.STORAGE_ERROR,
                'Failed to get storage metrics',
                errorMessage
            );
        }
    }

    private parseJSON<T>(value: string | null | undefined, defaultValue: T): T {
        if (!value) return defaultValue;
        try {
            return JSON.parse(value) as T;
        } catch {
            return defaultValue;
        }
    }

    private rowToTask(row: Record<string, unknown>): Task {
        return {
            path: String(row.path || ''),
            name: String(row.name || ''),
            description: row.description ? String(row.description) : undefined,
            type: String(row.type || '') as Task['type'],
            status: String(row.status || '') as Task['status'],
            parentPath: row.parent_path ? String(row.parent_path) : undefined,
            notes: this.parseJSON<string[]>(String(row.notes || '[]'), []),
            reasoning: row.reasoning ? String(row.reasoning) : undefined,
            dependencies: this.parseJSON<string[]>(String(row.dependencies || '[]'), []),
            subtasks: this.parseJSON<string[]>(String(row.subtasks || '[]'), []),
            metadata: this.parseJSON(String(row.metadata || '{}'), {
                created: Date.now(),
                updated: Date.now(),
                projectPath: String(row.path || '').split('/')[0],
                version: 1
            })
        };
    }

    async close(): Promise<void> {
        if (this.db) {
            await this.db.close();
            this.db = null;
        }
    }
}
