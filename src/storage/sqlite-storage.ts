/**
 * SQLite storage implementation
 */
import { Database, open } from 'sqlite';
import { Task, TaskStatus, CreateTaskInput, UpdateTaskInput } from '../types/task.js';
import { 
    StorageConfig, 
    TaskStorage, 
    StorageMetrics, 
    CacheStats
} from '../types/storage.js';
import { Logger } from '../logging/index.js';
import { ErrorCodes, createError } from '../errors/index.js';
import { ConnectionManager } from './connection-manager.js';
import { globToSqlPattern } from '../utils/pattern-matcher.js';

interface TaskCacheEntry {
    task: Task;
    timestamp: number;
    hits: number;
}

export class SqliteStorage implements TaskStorage {
    private db: Database | null = null;
    private readonly logger: Logger;
    private readonly config: StorageConfig;
    private readonly connectionManager: ConnectionManager;
    private readonly cache: Map<string, TaskCacheEntry> = new Map();
    private readonly MAX_CACHE_SIZE = 1000;
    private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    private cacheHits = 0;
    private cacheMisses = 0;

    constructor(config: StorageConfig) {
        this.config = config;
        this.logger = Logger.getInstance().child({ component: 'SqliteStorage' });
        this.connectionManager = new ConnectionManager(config.connection);
    }

    async initialize(): Promise<void> {
        const path = await import('path');
const dbPath = path.join(this.config.baseDir, `${this.config.name}.db`);
        this.logger.info('Opening SQLite database', { 
            dbPath,
            baseDir: this.config.baseDir,
            name: this.config.name,
            fullPath: (await import('path')).resolve(dbPath)
        });

        try {
            // Import required modules
            const fs = await import('fs/promises');
            const path = await import('path');
            
            // Ensure storage directory exists and is writable
            const dirPath = path.dirname(dbPath);
            try {
                // Create directory with proper permissions
                await fs.mkdir(dirPath, { 
                    recursive: true, 
                    // Use portable permissions
                    mode: process.platform === 'win32' ? undefined : 0o755
                });

                // Verify directory is writable
                await fs.access(dirPath, fs.constants.W_OK);
                
                // Log directory contents
                const dirContents = await fs.readdir(dirPath);
                this.logger.info('Storage directory ready:', { 
                    path: dirPath,
                    contents: dirContents,
                    writable: true
                });
            } catch (err) {
                const error = err as NodeJS.ErrnoException;
                this.logger.error('Storage directory error', {
                    path: dirPath,
                    code: error.code,
                    errno: error.errno,
                    syscall: error.syscall
                });
                throw createError(
                    ErrorCodes.STORAGE_INIT,
                    'Storage directory not writable',
                    `Failed to access ${dirPath}: ${error.message}`
                );
            }

            // Import sqlite3 with verbose mode for better error messages
            const sqlite3 = await import('sqlite3');
            this.logger.info('SQLite3 module imported', {
                sqlite3: typeof sqlite3.default,
                modes: Object.keys(sqlite3.default)
            });

            // Initialize database with retry support
            await this.connectionManager.executeWithRetry(async () => {
                try {
                    // Open database with retry for locked files
                    await this.connectionManager.handleBusy(async () => {
                        this.db = await open({
                            filename: dbPath,
                            driver: sqlite3.default.Database,
                            mode: sqlite3.default.OPEN_READWRITE | sqlite3.default.OPEN_CREATE
                        });
                        this.logger.debug('Database opened successfully');
                    }, 'open_database');

                    return this.withDb(async (db) => {
                        // Set basic PRAGMAs first
                        await db.exec(`
                            PRAGMA busy_timeout=${this.config.connection?.busyTimeout || 5000};
                            PRAGMA temp_store=MEMORY;
                            PRAGMA foreign_keys=ON;
                            PRAGMA locking_mode=EXCLUSIVE;
                        `);

                        // Check and enable WAL mode with exclusive lock
                        await this.connectionManager.handleBusy(async () => {
                            const currentMode = await db.get<{value: string}>('PRAGMA journal_mode');
                            this.logger.info('Current journal mode:', { mode: currentMode?.value });

                            if (currentMode?.value !== 'wal') {
                                await db.exec(`
                                    PRAGMA locking_mode=EXCLUSIVE;
                                    PRAGMA journal_mode=WAL;
                                `);
                                const walMode = await db.get<{value: string}>('PRAGMA journal_mode');
                                if (walMode?.value !== 'wal') {
                                    this.logger.error('Failed to set WAL mode', {
                                        requested: 'wal',
                                        actual: walMode?.value,
                                        currentMode: currentMode?.value
                                    });
                                    throw new Error(`Failed to enable WAL mode: got ${walMode?.value}`);
                                }
                                this.logger.info('WAL mode enabled successfully');
                            } else {
                                this.logger.info('Database already in WAL mode');
                            }
                        }, 'enable_wal');

                        // Set other PRAGMAs after WAL mode is confirmed
                        await db.exec(`
                            PRAGMA synchronous=NORMAL;
                            PRAGMA wal_autocheckpoint=1000;
                            PRAGMA cache_size=${this.config.performance?.cacheSize || 2000};
                            PRAGMA mmap_size=${this.config.performance?.mmapSize || 30000000000};
                            PRAGMA page_size=${this.config.performance?.pageSize || 4096};
                        `);

                        // Create schema and set up database
                        await this.setupDatabase();

                        // Force a write to create WAL files
                        await db.exec(`
                            BEGIN IMMEDIATE;
                            CREATE TABLE IF NOT EXISTS _wal_test (id INTEGER PRIMARY KEY);
                            INSERT OR REPLACE INTO _wal_test (id) VALUES (1);
                            COMMIT;
                        `);

                        // Ensure WAL mode persisted after write
                        const journalMode = await db.get<{value: string}>('PRAGMA journal_mode');
                        this.logger.info('Journal mode confirmed:', { mode: journalMode?.value });

                        if (journalMode?.value !== 'wal') {
                            throw new Error('WAL mode not persisted after write');
                        }

                        // Log WAL status
                        const fs = await import('fs/promises');
                        const walPath = `${dbPath}-wal`;
                        const shmPath = `${dbPath}-shm`;
                        
                        try {
                            await Promise.all([
                                fs.access(walPath),
                                fs.access(shmPath)
                            ]);
                            this.logger.info('WAL files present', {
                                wal: walPath,
                                shm: shmPath
                            });
                        } catch (err) {
                            this.logger.warn('WAL files not immediately visible', {
                                error: err,
                                note: 'This may be normal if files are being created'
                            });
                        }

                        this.logger.info('SQLite storage initialized', { 
                            path: this.config.baseDir,
                            journalMode: journalMode?.value
                        });
                    });
                } catch (err) {
                    this.logger.error('Failed to initialize database', {
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
            }, 'initialize');
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
        return this.withDb(async (db) => {
            // Create tables and indexes
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
        });
    }

    async createTask(input: CreateTaskInput): Promise<Task> {
        if (!input.path) {
            throw createError(
                ErrorCodes.INVALID_INPUT,
                'Task path is required',
                'createTask'
            );
        }

        if (!input.type) {
            throw createError(
                ErrorCodes.INVALID_INPUT,
                'Task type is required',
                'createTask'
            );
        }

        const task: Task = {
            path: input.path,
            name: input.name,
            type: input.type,
            status: TaskStatus.PENDING,
            description: input.description || undefined,
            parentPath: input.parentPath || undefined,
            notes: input.notes || [],
            reasoning: input.reasoning || undefined,
            dependencies: input.dependencies || [],
            subtasks: [],
            metadata: {
                ...input.metadata,
                created: Date.now(),
                updated: Date.now(),
                projectPath: input.path.split('/')[0],
                version: 1
            }
        };

        await this.saveTask(task);
        return task;
    }

    async updateTask(path: string, updates: UpdateTaskInput): Promise<Task> {
        const existingTask = await this.getTask(path);
        if (!existingTask) {
            throw createError(
                ErrorCodes.TASK_NOT_FOUND,
                'Task not found',
                'updateTask',
                path
            );
        }

        const updatedTask: Task = {
            ...existingTask,
            ...updates,
            metadata: {
                ...existingTask.metadata,
                ...updates.metadata,
                updated: Date.now(),
                version: existingTask.metadata.version + 1
            }
        };

        await this.saveTask(updatedTask);
        return updatedTask;
    }

    async hasChildren(path: string): Promise<boolean> {
        return this.withDb(async (db) => {
            const result = await db.get<{ count: number }>(
                'SELECT COUNT(*) as count FROM tasks WHERE parent_path = ?',
                path
            );
            return (result?.count || 0) > 0;
        });
    }

    async getDependentTasks(path: string): Promise<Task[]> {
        return this.withDb(async (db) => {
            const rows = await db.all<Record<string, unknown>[]>(
                `SELECT * FROM tasks WHERE json_array_length(dependencies) > 0 
                 AND json_extract(dependencies, '$') LIKE '%${path}%'`
            );
            return rows.map(row => this.rowToTask(row));
        });
    }

    async saveTask(task: Task): Promise<void> {
        await this.saveTasks([task]);
    }

    private async withDb<T>(operation: (db: Database) => Promise<T>): Promise<T> {
        if (!this.db) {
            throw createError(
                ErrorCodes.STORAGE_ERROR,
                'Database not initialized'
            );
        }
        return operation(this.db);
    }

    private transactionDepth = 0;

    private async inTransaction<T>(operation: () => Promise<T>): Promise<T> {
        return this.withDb(async (db) => {
            // If we're already in a transaction, just execute the operation
            if (this.transactionDepth > 0) {
                this.transactionDepth++;
                try {
                    return await operation();
                } finally {
                    this.transactionDepth--;
                }
            }

            // Start a new transaction
            this.transactionDepth = 1;
            try {
                await db.run('BEGIN IMMEDIATE');
                this.logger.debug('Started new transaction');
                
                const result = await operation();
                
                // Only commit if we haven't already committed
                if (this.transactionDepth === 1) {
                    await db.run('COMMIT');
                    this.logger.debug('Committed transaction');
                }
                
                return result;
            } catch (error) {
                // Only rollback if we haven't already rolled back
                if (this.transactionDepth === 1) {
                    try {
                        await db.run('ROLLBACK');
                        this.logger.debug('Rolled back transaction');
                    } catch (rollbackError) {
                        this.logger.error('Failed to rollback transaction', {
                            error: rollbackError,
                            originalError: error
                        });
                    }
                }
                throw error;
            } finally {
                this.transactionDepth = 0;
            }
        });
    }

    async saveTasks(tasks: Task[]): Promise<void> {
        await this.inTransaction(async () => {
            return this.withDb(async (db) => {

                // First pass: collect all parent paths to load existing parents
                const parentPaths = new Set<string>();
                for (const task of tasks) {
                    if (task.parentPath) {
                        parentPaths.add(task.parentPath);
                    }
                }

                // Load existing parents
                const existingParents = new Map<string, Task>();
                if (parentPaths.size > 0) {
                    const placeholders = Array(parentPaths.size).fill('?').join(',');
                    const rows = await db.all<Record<string, unknown>[]>(
                        `SELECT * FROM tasks WHERE path IN (${placeholders})`,
                        Array.from(parentPaths)
                    );
                    for (const row of rows) {
                        const parent = this.rowToTask(row);
                        existingParents.set(parent.path, parent);
                    }
                }

                // Second pass: update parent-child relationships
                for (const task of tasks) {
                    if (task.parentPath) {
                        let parent = existingParents.get(task.parentPath);
                        if (parent) {
                            // Update parent's subtasks array if needed
                            if (!parent.subtasks.includes(task.path)) {
                                parent.subtasks = [...parent.subtasks, task.path];
                                existingParents.set(parent.path, parent);
                                tasks.push(parent); // Add parent to tasks to be saved
                            }
                        }
                    }
                }

                // Save all tasks with updated relationships
                for (const task of tasks) {
                    this.logger.info('Saving task:', { task });
                    await db.run(
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
            });
        });
    }

    /**
     * Implements CacheManager.clearCache
     */
    async clearCache(): Promise<void> {
        this.cache.clear();
        this.cacheHits = 0;
        this.cacheMisses = 0;
        this.logger.debug('Cache cleared');
    }

    /**
     * Implements CacheManager.getCacheStats
     */
    async getCacheStats(): Promise<CacheStats> {
        const totalRequests = this.cacheHits + this.cacheMisses;
        return {
            size: this.cache.size,
            hits: this.cacheHits,
            misses: this.cacheMisses,
            hitRate: totalRequests > 0 ? this.cacheHits / totalRequests : 0,
            memoryUsage: process.memoryUsage().heapUsed
        };
    }

    /**
     * Gets a task from cache or database
     */
    async getTask(path: string): Promise<Task | null> {
        // Check cache first
        const cached = this.cache.get(path);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            cached.hits++;
            this.cacheHits++;
            return cached.task;
        }
        this.cacheMisses++;

        return this.withDb(async (db) => {
            try {
                const row = await db.get<Record<string, unknown>>(
                    'SELECT * FROM tasks WHERE path = ?',
                    path
                );

                if (!row) {
                    return null;
                }

                const task = this.rowToTask(row);
                
                // Add to cache with LRU eviction
                if (this.cache.size >= this.MAX_CACHE_SIZE) {
                    // Find least recently used entry
                    let oldestTime = Date.now();
                    let oldestKey = '';
                    for (const [key, entry] of this.cache.entries()) {
                        if (entry.timestamp < oldestTime) {
                            oldestTime = entry.timestamp;
                            oldestKey = key;
                        }
                    }
                    this.cache.delete(oldestKey);
                }
                
                this.cache.set(path, {
                    task,
                    timestamp: Date.now(),
                    hits: 1
                });

                return task;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error('Failed to get task', { error: errorMessage, path });
                throw createError(
                    ErrorCodes.STORAGE_READ,
                    'Failed to get task',
                    errorMessage
                );
            }
        });
    }

    async getTasks(paths: string[]): Promise<Task[]> {
        return this.withDb(async (db) => {
            try {
                const placeholders = paths.map(() => '?').join(',');
                const rows = await db.all<Record<string, unknown>[]>(
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
        });
    }

    async getTasksByPattern(pattern: string): Promise<Task[]> {
        return this.withDb(async (db) => {
            try {
                // Convert glob pattern to SQL pattern
                const sqlPattern = globToSqlPattern(pattern);

                this.logger.debug('Converting glob pattern to SQL', {
                    original: pattern,
                    sql: sqlPattern
                });

                // Use both GLOB and LIKE for better pattern matching
                const rows = await db.all<Record<string, unknown>[]>(
                    `SELECT * FROM tasks WHERE 
                     path GLOB ? OR 
                     path LIKE ? OR
                     path LIKE ?`,
                    sqlPattern,
                    sqlPattern,
                    // Add recursive matching for **
                    pattern.includes('**') ? `${sqlPattern}/%` : sqlPattern
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
        });
    }

    async getTasksByStatus(status: TaskStatus): Promise<Task[]> {
        return this.withDb(async (db) => {
            try {
                const rows = await db.all<Record<string, unknown>[]>(
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
        });
    }

    async getSubtasks(parentPath: string): Promise<Task[]> {
        return this.withDb(async (db) => {
            try {
                // Get the parent task first
                const parent = await this.getTask(parentPath);
                if (!parent) {
                    return [];
                }

                // Get all tasks that have this parent path
                const rows = await db.all<Record<string, unknown>[]>(
                    `SELECT * FROM tasks WHERE parent_path = ?`,
                    parentPath
                );

                // Convert rows to tasks
                const tasks = rows.map(row => this.rowToTask(row));

                // Ensure consistency - update any tasks that have this parent
                // but aren't in the parent's subtasks array
                const needsUpdate = tasks.some(task => 
                    task.parentPath === parentPath && !parent.subtasks.includes(task.path)
                );

                if (needsUpdate) {
                    parent.subtasks = Array.from(new Set([
                        ...parent.subtasks,
                        ...tasks.filter(t => t.parentPath === parentPath).map(t => t.path)
                    ]));
                    await this.saveTask(parent);
                }

                return tasks;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error('Failed to get subtasks', { error: errorMessage, parentPath });
                throw createError(
                    ErrorCodes.STORAGE_READ,
                    'Failed to get subtasks',
                    errorMessage
                );
            }
        });
    }

    async deleteTask(path: string): Promise<void> {
        await this.deleteTasks([path]);
    }

    async deleteTasks(paths: string[]): Promise<void> {
        await this.inTransaction(async () => {
            return this.withDb(async (db) => {
                // Get all tasks that need to be deleted using recursive CTE
                const placeholders = paths.map(() => '?').join(',');
                const rows = await db.all<Record<string, unknown>[]>(
                    `WITH RECURSIVE task_tree AS (
                        -- Base case: tasks with paths in the input list
                        SELECT path, parent_path, json_extract(subtasks, '$') as subtasks
                        FROM tasks 
                        WHERE path IN (${placeholders})
                        
                        UNION ALL
                        
                        -- Recursive case 1: tasks with parent_path matching any task in tree
                        SELECT t.path, t.parent_path, json_extract(t.subtasks, '$')
                        FROM tasks t
                        JOIN task_tree tt ON t.parent_path = tt.path
                        
                        UNION ALL
                        
                        -- Recursive case 2: tasks listed in subtasks array of any task in tree
                        SELECT t.path, t.parent_path, json_extract(t.subtasks, '$')
                        FROM tasks t
                        JOIN task_tree tt ON json_each.value = t.path
                        JOIN json_each(tt.subtasks)
                    )
                    SELECT DISTINCT path FROM task_tree`,
                    ...paths
                );

                const allPaths = rows.map(row => String(row.path));
                this.logger.debug('Found tasks to delete', { 
                    inputPaths: paths,
                    foundPaths: allPaths 
                });

                // Get all tasks before deletion for proper cleanup
                const tasksToDelete = await Promise.all(
                    allPaths.map(path => this.getTask(path))
                );
                const validTasksToDelete = tasksToDelete.filter((t): t is Task => t !== null);

                // Find all parent paths that need updating
                const parentsToUpdate = new Set(
                    validTasksToDelete
                        .filter(t => t.parentPath)
                        .map(t => t.parentPath as string)
                );

                // Update parent tasks' subtasks arrays
                for (const parentPath of parentsToUpdate) {
                    const parent = await this.getTask(parentPath);
                    if (parent && !allPaths.includes(parent.path)) {
                        parent.subtasks = parent.subtasks.filter(p => !allPaths.includes(p));
                        await this.saveTask(parent);
                    }
                }

                // Delete all tasks and their descendants
                if (allPaths.length > 0) {
                    const deletePlaceholders = allPaths.map(() => '?').join(',');
                    await db.run(
                        `DELETE FROM tasks WHERE path IN (${deletePlaceholders})`,
                        ...allPaths
                    );
                }

                this.logger.debug('Tasks deleted with descendants', {
                    inputPaths: paths,
                    deletedPaths: allPaths
                });
            });
        });
    }

    async vacuum(): Promise<void> {
        return this.withDb(async (db) => {
            try {
                await db.run('VACUUM');
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error('Failed to vacuum database', { error: errorMessage });
                throw createError(
                    ErrorCodes.STORAGE_ERROR,
                    'Failed to vacuum database',
                    errorMessage
                );
            }
        });
    }

    async analyze(): Promise<void> {
        return this.withDb(async (db) => {
            try {
                await db.run('ANALYZE');
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error('Failed to analyze database', { error: errorMessage });
                throw createError(
                    ErrorCodes.STORAGE_ERROR,
                    'Failed to analyze database',
                    errorMessage
                );
            }
        });
    }

    async checkpoint(): Promise<void> {
        return this.withDb(async (db) => {
            try {
                await db.run('PRAGMA wal_checkpoint(TRUNCATE)');
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error('Failed to checkpoint database', { error: errorMessage });
                throw createError(
                    ErrorCodes.STORAGE_ERROR,
                    'Failed to checkpoint database',
                    errorMessage
                );
            }
        });
    }

    async getMetrics(): Promise<StorageMetrics & {
        cache?: CacheStats;
        memory?: {
            heapUsed: number;
            heapTotal: number;
            rss: number;
        };
    }> {
        return this.withDb(async (db) => {
            try {
                interface TaskStats {
                    total: number;
                    noteCount: number;
                    dependencyCount: number;
                }

                const [taskStats, statusStats, storageStats] = await Promise.all([
                    db.get<TaskStats>(`
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
                    db.all(`
                        SELECT status, COUNT(*) as count
                        FROM tasks
                        GROUP BY status
                    `),
                    db.get<Record<string, unknown>>(`
                        SELECT 
                            page_count * page_size as totalSize,
                            page_size,
                            page_count,
                            0 as wal_size
                        FROM pragma_page_count, pragma_page_size LIMIT 1
                    `)
                ]);

                const memUsage = process.memoryUsage();
                const cacheStats = await this.getCacheStats();

                // Convert status stats array to object
                const byStatus = (statusStats as { status: string; count: number }[]).reduce((acc: Record<string, number>, curr) => {
                    acc[curr.status] = curr.count;
                    return acc;
                }, {});

                return {
                    tasks: {
                        total: Number(taskStats?.total || 0),
                        byStatus,
                        noteCount: Number(taskStats?.noteCount || 0),
                        dependencyCount: Number(taskStats?.dependencyCount || 0)
                    },
                    storage: {
                        totalSize: Number(storageStats?.totalSize || 0),
                        pageSize: Number(storageStats?.page_size || 0),
                        pageCount: Number(storageStats?.page_count || 0),
                        walSize: Number(storageStats?.wal_size || 0),
                        cache: {
                            hitRate: cacheStats.hitRate,
                            memoryUsage: cacheStats.memoryUsage,
                            entryCount: this.cache.size
                        }
                    },
                    cache: cacheStats,
                    memory: {
                        heapUsed: memUsage.heapUsed,
                        heapTotal: memUsage.heapTotal,
                        rss: memUsage.rss
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
        });
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

    /**
     * Clears all tasks from the database and recreates tables
     */
    async clearAllTasks(): Promise<void> {
        return this.withDb(async (db) => {
            try {
                // Drop existing tables
                await db.run('DROP TABLE IF EXISTS tasks');
                
                // Clear cache and indexes
                await this.clearCache();
                
                // Recreate tables
                await this.setupDatabase();
                
                // Vacuum database outside of transaction
                await db.run('VACUUM');
                
                // Analyze the new empty tables
                await db.run('ANALYZE');
                
                // Checkpoint WAL
                await db.run('PRAGMA wal_checkpoint(TRUNCATE)');
                
                this.logger.info('Database reset: tables dropped, recreated, and optimized');
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error('Failed to clear tasks', { error: errorMessage });
                throw createError(
                    ErrorCodes.STORAGE_ERROR,
                    'Failed to clear tasks',
                    errorMessage
                );
            }
        });
    }

    /**
     * Repairs parent-child relationships
     */
    async repairRelationships(dryRun: boolean = false): Promise<{ fixed: number, issues: string[] }> {
        return this.inTransaction(async () => {
            return this.withDb(async (db) => {
                const issues: string[] = [];
                let fixCount = 0;

                try {
                    // Find tasks with invalid parent paths
                    const orphanedTasks = await db.all<Record<string, unknown>[]>(
                        `SELECT t1.path, t1.parent_path 
                         FROM tasks t1 
                         LEFT JOIN tasks t2 ON t1.parent_path = t2.path 
                         WHERE t1.parent_path IS NOT NULL 
                         AND t2.path IS NULL`
                    );

                    for (const task of orphanedTasks) {
                        issues.push(`Task ${task.path} has invalid parent_path: ${task.parent_path}`);
                        if (!dryRun) {
                            await db.run(
                                'UPDATE tasks SET parent_path = NULL WHERE path = ?',
                                task.path
                            );
                            fixCount++;
                        }
                    }

                    // Find inconsistencies between parent_path and subtasks
                    const rows = await db.all<Record<string, unknown>[]>(
                        'SELECT * FROM tasks WHERE parent_path IS NOT NULL OR subtasks IS NOT NULL'
                    );

                    for (const row of rows) {
                        const task = this.rowToTask(row);
                        const subtaskRefs = new Set(task.subtasks);
                        
                        // Check if all subtasks exist and reference this task as parent
                        if (subtaskRefs.size > 0) {
                            const subtasks = await db.all<Record<string, unknown>[]>(
                                `SELECT * FROM tasks WHERE path IN (${Array(subtaskRefs.size).fill('?').join(',')})`,
                                ...Array.from(subtaskRefs)
                            );

                            for (const subtask of subtasks.map(r => this.rowToTask(r))) {
                                if (subtask.parentPath !== task.path) {
                                    issues.push(`Task ${task.path} lists ${subtask.path} as subtask but parent_path mismatch`);
                                    if (!dryRun) {
                                        subtask.parentPath = task.path;
                                        await this.saveTask(subtask);
                                        fixCount++;
                                    }
                                }
                            }
                        }
                    }

                    return { fixed: fixCount, issues };
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    this.logger.error('Failed to repair relationships', { error: errorMessage });
                    throw createError(
                        ErrorCodes.STORAGE_ERROR,
                        'Failed to repair relationships',
                        errorMessage
                    );
                }
            });
        });
    }

    /**
     * Begins a new transaction
     */
    async beginTransaction(): Promise<void> {
        if (this.transactionDepth > 0) {
            this.transactionDepth++;
            this.logger.debug('Nested transaction started', { depth: this.transactionDepth });
            return;
        }

        return this.withDb(async (db) => {
            try {
                await db.run('BEGIN IMMEDIATE');
                this.transactionDepth = 1;
                this.logger.debug('Transaction started');
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error('Failed to begin transaction', { error: errorMessage });
                throw createError(
                    ErrorCodes.STORAGE_ERROR,
                    'Failed to begin transaction',
                    errorMessage
                );
            }
        });
    }

    /**
     * Commits the current transaction
     */
    async commitTransaction(): Promise<void> {
        if (this.transactionDepth > 1) {
            this.transactionDepth--;
            this.logger.debug('Nested transaction committed', { depth: this.transactionDepth });
            return;
        }

        return this.withDb(async (db) => {
            try {
                await db.run('COMMIT');
                this.transactionDepth = 0;
                this.logger.debug('Transaction committed');
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error('Failed to commit transaction', { error: errorMessage });
                throw createError(
                    ErrorCodes.STORAGE_ERROR,
                    'Failed to commit transaction',
                    errorMessage
                );
            }
        });
    }

    /**
     * Rolls back the current transaction
     */
    async rollbackTransaction(): Promise<void> {
        if (this.transactionDepth > 1) {
            this.transactionDepth--;
            this.logger.debug('Nested transaction rolled back', { depth: this.transactionDepth });
            return;
        }

        return this.withDb(async (db) => {
            try {
                await db.run('ROLLBACK');
                this.transactionDepth = 0;
                this.logger.debug('Transaction rolled back');
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error('Failed to rollback transaction', { error: errorMessage });
                throw createError(
                    ErrorCodes.STORAGE_ERROR,
                    'Failed to rollback transaction',
                    errorMessage
                );
            }
        });
    }

    /**
     * Closes the database connection and cleans up resources
     */
    async close(): Promise<void> {
        try {
            await this.clearCache();
            if (this.db) {
                await this.db.close();
                this.db = null;
                this.logger.info('Database connection closed');
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('Failed to close database', { error: errorMessage });
            throw createError(
                ErrorCodes.STORAGE_ERROR,
                'Failed to close database',
                errorMessage
            );
        }
    }
}
