/**
 * SQLite storage implementation with enhanced transaction and WAL management
 */
import { Database } from 'sqlite';
import { Task, TaskStatus, TaskType, CreateTaskInput, UpdateTaskInput } from '../../types/task.js';
import { TaskStorage } from '../../types/storage.js';
import { Logger } from '../../logging/index.js';
import { ErrorCodes, createError } from '../../errors/index.js';
import { ConnectionPool } from '../core/connection/pool.js';
import { ConnectionStateManager } from '../core/connection/state.js';
import { WALManager } from '../core/wal/manager.js';
import { TransactionManager } from '../core/transactions/manager.js';
import { 
    MetricsCollector, 
    HealthMonitor
} from '../monitoring/index.js';
import { globToSqlPattern } from '../../utils/pattern-matcher.js';
import { join } from 'path';
import { SqliteConfig, SqliteMetrics, initializeSqliteStorage } from './index.js';

interface TaskCacheEntry {
    task: Task;
    timestamp: number;
    hits: number;
}

interface TransactionContext {
    id: string;
    connectionId: string;
    startTime: number;
    db: Database;
}

export class SqliteStorage implements TaskStorage {
    private readonly logger: Logger;
    private readonly _config: SqliteConfig;
    
    private get config(): SqliteConfig {
        return this._config;
    }
    private readonly connectionPool: ConnectionPool;
    private readonly stateManager: ConnectionStateManager;
    private readonly walManager: WALManager;
    private readonly transactionManager: TransactionManager;
    private readonly metricsCollector?: MetricsCollector;
    private readonly healthMonitor?: HealthMonitor;
    private readonly cache: Map<string, TaskCacheEntry> = new Map();
    private readonly activeTransactions = new Map<string, TransactionContext>();
    private readonly MAX_CACHE_SIZE = 500;
    private readonly CACHE_TTL = 60 * 1000; // 1 minute
    private readonly MAX_CACHE_MEMORY = 100 * 1024 * 1024; // 100MB max cache memory
    private currentCacheMemory = 0;
    private cacheHits = 0;
    private cacheMisses = 0;
    private readonly dbPath: string;

    constructor(config: SqliteConfig) {
        this._config = config;
        this.logger = Logger.getInstance().child({ component: 'SqliteStorage' });
        this.dbPath = join(config.baseDir, `${config.name}.db`);

        // Initialize core components with optimized connection pool settings
        this.connectionPool = new ConnectionPool(config, {
            minConnections: 1,
            maxConnections: 5,
            idleTimeout: 30000
        });
        this.stateManager = ConnectionStateManager.getInstance();
        this.walManager = WALManager.getInstance(this.dbPath);
        this.transactionManager = TransactionManager.getInstance();

        // Initialize monitoring if enabled
        if (this.config.monitoring?.enabled !== false) {
            if (this.config.monitoring?.metrics?.enabled !== false) {
                this.metricsCollector = new MetricsCollector({
                    checkInterval: this.config.monitoring?.metrics?.interval,
                    errorThreshold: this.config.monitoring?.metrics?.errorThreshold,
                    responseTimeThreshold: this.config.monitoring?.metrics?.responseTimeThreshold,
                    metricsInterval: this.config.monitoring?.metrics?.interval
                });
            }

            if (this.config.monitoring?.healthCheck?.enabled !== false) {
                this.healthMonitor = new HealthMonitor({
                    checkInterval: this.config.monitoring?.healthCheck?.interval,
                    errorThreshold: this.config.monitoring?.healthCheck?.errorThreshold,
                    responseTimeThreshold: this.config.monitoring?.healthCheck?.responseTimeThreshold
                });
            }
        }
    }

    async initialize(): Promise<void> {
        try {
            // Initialize SQLite database first
            await initializeSqliteStorage(this.dbPath);
            
            // Then initialize connection pool
            await this.connectionPool.initialize();
            
            // Start monitoring if enabled
            if (this.healthMonitor) {
                this.healthMonitor.start();
            }
            if (this.metricsCollector) {
                this.metricsCollector.start();
            }

            this.logger.info('Storage initialized at:', {
                path: this.dbPath
            });
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.logger.error('Failed to initialize storage', { error: msg });
            throw error;
        }
    }

    async close(): Promise<void> {
        try {
            // Only stop monitoring if we're shutting down completely
            if (process.exitCode !== undefined) {
                if (this.healthMonitor) {
                    this.healthMonitor.stop();
                }
                if (this.metricsCollector) {
                    this.metricsCollector.stop();
                }
            }

            // Clear active transactions
            this.activeTransactions.clear();

            // Close connection pool but preserve WAL mode
            await this.connectionPool.close();

            this.logger.info('Storage closed successfully');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('Failed to close storage', { error: errorMessage });
            throw createError(
                ErrorCodes.STORAGE_ERROR,
                'Failed to close storage',
                errorMessage
            );
        }
    }

    // Transaction management
    async beginTransaction(): Promise<void> {
        const db = await this.connectionPool.getConnection();
        const connectionId = this.connectionPool.getConnectionId(db);

        try {
            const txId = await this.transactionManager.beginTransaction(db, connectionId);
            this.activeTransactions.set(txId, {
                id: txId,
                connectionId,
                startTime: Date.now(),
                db
            });
            this.stateManager.startTransaction(connectionId);
        } catch (error) {
            this.connectionPool.releaseConnection(db);
            throw error;
        }
    }

    async commitTransaction(): Promise<void> {
        const currentTx = this.getCurrentTransaction();
        if (!currentTx) {
            throw createError(
                ErrorCodes.TRANSACTION_ERROR,
                'No active transaction found'
            );
        }

        try {
            await this.transactionManager.commitTransaction(
                currentTx.db,
                currentTx.id,
                currentTx.connectionId
            );
            this.activeTransactions.delete(currentTx.id);
            this.stateManager.endTransaction(currentTx.connectionId);
        } finally {
            this.connectionPool.releaseConnection(currentTx.db);
        }
    }

    async rollbackTransaction(): Promise<void> {
        const currentTx = this.getCurrentTransaction();
        if (!currentTx) {
            throw createError(
                ErrorCodes.TRANSACTION_ERROR,
                'No active transaction found'
            );
        }

        try {
            await this.transactionManager.rollbackTransaction(
                currentTx.db,
                currentTx.id,
                currentTx.connectionId
            );
            this.activeTransactions.delete(currentTx.id);
            this.stateManager.endTransaction(currentTx.connectionId);
        } finally {
            this.connectionPool.releaseConnection(currentTx.db);
        }
    }

    private getCurrentTransaction(): TransactionContext | undefined {
        // Get the most recently started transaction
        let mostRecent: TransactionContext | undefined;
        let mostRecentTime = 0;

        for (const tx of this.activeTransactions.values()) {
            if (tx.startTime > mostRecentTime) {
                mostRecent = tx;
                mostRecentTime = tx.startTime;
            }
        }

        return mostRecent;
    }

    // Task operations
    async createTask(input: CreateTaskInput): Promise<Task> {
        if (!input.path) {
            throw createError(
                ErrorCodes.INVALID_INPUT,
                'Task path is required'
            );
        }

        const task: Task = {
            path: input.path,
            name: input.name,
            type: input.type || TaskType.TASK,
            status: TaskStatus.PENDING,
            description: input.description,
            parentPath: input.parentPath,
            notes: input.notes || [],
            reasoning: input.reasoning,
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
                version: (existingTask.metadata.version || 0) + 1
            }
        };

        await this.saveTask(updatedTask);
        return updatedTask;
    }

    async deleteTask(path: string): Promise<void> {
        const db = await this.connectionPool.getConnection();
        try {
            await db.run('DELETE FROM tasks WHERE path = ?', path);
            this.cache.delete(path);
        } finally {
            this.connectionPool.releaseConnection(db);
        }
    }

    async getTask(path: string): Promise<Task | null> {
        // Check cache first
        const cached = this.cache.get(path);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            cached.hits++;
            this.cacheHits++;
            return cached.task;
        }
        this.cacheMisses++;

        const db = await this.connectionPool.getConnection();
        try {
            const row = await db.get<Record<string, unknown>>(
                'SELECT * FROM tasks WHERE path = ?',
                path
            );

            if (!row) {
                return null;
            }

            const task = this.rowToTask(row);
            
            // Calculate entry size
            const entrySize = JSON.stringify(task).length * 2; // Approximate memory size in bytes
            
            // Check memory limits and evict if necessary
            while ((this.currentCacheMemory + entrySize > this.MAX_CACHE_MEMORY || this.cache.size >= this.MAX_CACHE_SIZE) 
                   && this.cache.size > 0) {
                // Find entry to evict (least recently used with lowest hits)
                let lowestScore = Infinity;
                let entryToEvict: string | null = null;
                const now = Date.now();
                
                for (const [key, entry] of this.cache.entries()) {
                    // Score based on recency and hits
                    const age = now - entry.timestamp;
                    const score = (entry.hits / age) * 1000; // Normalize
                    
                    if (score < lowestScore) {
                        lowestScore = score;
                        entryToEvict = key;
                    }
                }
                
                if (entryToEvict) {
                    const evictedEntry = this.cache.get(entryToEvict);
                    if (evictedEntry) {
                        this.currentCacheMemory -= JSON.stringify(evictedEntry.task).length * 2;
                        this.cache.delete(entryToEvict);
                    }
                }
            }
            
            // Add new entry to cache
            this.cache.set(path, {
                task,
                timestamp: Date.now(),
                hits: 1
            });
            this.currentCacheMemory += entrySize;

            return task;
        } finally {
            this.connectionPool.releaseConnection(db);
        }
    }

    async getTasks(paths: string[]): Promise<Task[]> {
        const db = await this.connectionPool.getConnection();
        try {
            const placeholders = paths.map(() => '?').join(',');
            const rows = await db.all<Record<string, unknown>[]>(
                `SELECT * FROM tasks WHERE path IN (${placeholders})`,
                ...paths
            );

            return rows.map(row => this.rowToTask(row));
        } finally {
            this.connectionPool.releaseConnection(db);
        }
    }

    async getTasksByPattern(pattern: string): Promise<Task[]> {
        const db = await this.connectionPool.getConnection();
        try {
            const sqlPattern = globToSqlPattern(pattern);
            const rows = await db.all<Record<string, unknown>[]>(
                'SELECT * FROM tasks WHERE path GLOB ?',
                sqlPattern
            );

            return rows.map(row => this.rowToTask(row));
        } finally {
            this.connectionPool.releaseConnection(db);
        }
    }

    async getTasksByStatus(status: TaskStatus): Promise<Task[]> {
        const db = await this.connectionPool.getConnection();
        try {
            const rows = await db.all<Record<string, unknown>[]>(
                'SELECT * FROM tasks WHERE status = ?',
                status
            );

            return rows.map(row => this.rowToTask(row));
        } finally {
            this.connectionPool.releaseConnection(db);
        }
    }

    async getSubtasks(parentPath: string): Promise<Task[]> {
        const db = await this.connectionPool.getConnection();
        try {
            const rows = await db.all<Record<string, unknown>[]>(
                'SELECT * FROM tasks WHERE parent_path = ?',
                parentPath
            );

            return rows.map(row => this.rowToTask(row));
        } finally {
            this.connectionPool.releaseConnection(db);
        }
    }

    async saveTask(task: Task): Promise<void> {
        const db = await this.connectionPool.getConnection();
        try {
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
                JSON.stringify(task.notes),
                task.reasoning,
                JSON.stringify(task.dependencies),
                JSON.stringify(task.subtasks),
                JSON.stringify(task.metadata),
                task.metadata.created,
                task.metadata.updated
            );

            // Update cache
            this.cache.set(task.path, {
                task,
                timestamp: Date.now(),
                hits: 0
            });
        } finally {
            this.connectionPool.releaseConnection(db);
        }
    }

    async clearAllTasks(): Promise<void> {
        const db = await this.connectionPool.getConnection();
        try {
            await db.run('DELETE FROM tasks');
            await this.clearCache();
        } finally {
            this.connectionPool.releaseConnection(db);
        }
    }

    async clearCache(): Promise<void> {
        this.cache.clear();
        this.cacheHits = 0;
        this.cacheMisses = 0;
        this.currentCacheMemory = 0;
    }

    private rowToTask(row: Record<string, unknown>): Task {
        return {
            path: String(row.path || ''),
            name: String(row.name || ''),
            description: row.description ? String(row.description) : undefined,
            type: String(row.type || '') as Task['type'],
            status: String(row.status || '') as TaskStatus,
            parentPath: row.parent_path ? String(row.parent_path) : undefined,
            notes: this.parseJSON<string[]>(row.notes ? String(row.notes) : '[]', []),
            reasoning: row.reasoning ? String(row.reasoning) : undefined,
            dependencies: this.parseJSON<string[]>(row.dependencies ? String(row.dependencies) : '[]', []),
            subtasks: this.parseJSON<string[]>(row.subtasks ? String(row.subtasks) : '[]', []),
            metadata: this.parseJSON(row.metadata ? String(row.metadata) : '{}', {
                created: Number(row.created_at || Date.now()),
                updated: Number(row.updated_at || Date.now()),
                projectPath: String(row.path || '').split('/')[0],
                version: 1
            })
        };
    }

    private parseJSON<T>(value: string, defaultValue: T): T {
        try {
            return JSON.parse(value) as T;
        } catch {
            return defaultValue;
        }
    }

    async hasChildren(path: string): Promise<boolean> {
        const db = await this.connectionPool.getConnection();
        try {
            const result = await db.get<{ count: number }>(
                'SELECT COUNT(*) as count FROM tasks WHERE parent_path = ?',
                path
            );
            return (result?.count || 0) > 0;
        } finally {
            this.connectionPool.releaseConnection(db);
        }
    }

    async getDependentTasks(path: string): Promise<Task[]> {
        const db = await this.connectionPool.getConnection();
        try {
            const rows = await db.all<Record<string, unknown>[]>(
                `SELECT * FROM tasks WHERE json_array_length(dependencies) > 0 
                 AND json_extract(dependencies, '$') LIKE '%${path}%'`
            );
            return rows.map(row => this.rowToTask(row));
        } finally {
            this.connectionPool.releaseConnection(db);
        }
    }

    async saveTasks(tasks: Task[]): Promise<void> {
        const db = await this.connectionPool.getConnection();
        try {
            await db.run('BEGIN IMMEDIATE');

            for (const task of tasks) {
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
                    JSON.stringify(task.notes),
                    task.reasoning,
                    JSON.stringify(task.dependencies),
                    JSON.stringify(task.subtasks),
                    JSON.stringify(task.metadata),
                    task.metadata.created,
                    task.metadata.updated
                );

                // Update cache
                this.cache.set(task.path, {
                    task,
                    timestamp: Date.now(),
                    hits: 0
                });
            }

            await db.run('COMMIT');
        } catch (error) {
            await db.run('ROLLBACK');
            throw error;
        } finally {
            this.connectionPool.releaseConnection(db);
        }
    }

    async deleteTasks(paths: string[]): Promise<void> {
        const db = await this.connectionPool.getConnection();
        try {
            const placeholders = paths.map(() => '?').join(',');
            await db.run(
                `DELETE FROM tasks WHERE path IN (${placeholders})`,
                ...paths
            );
            paths.forEach(path => this.cache.delete(path));
        } finally {
            this.connectionPool.releaseConnection(db);
        }
    }

    async vacuum(): Promise<void> {
        const db = await this.connectionPool.getConnection();
        try {
            await db.run('VACUUM');
        } finally {
            this.connectionPool.releaseConnection(db);
        }
    }

    async analyze(): Promise<void> {
        const db = await this.connectionPool.getConnection();
        try {
            await db.run('ANALYZE');
        } finally {
            this.connectionPool.releaseConnection(db);
        }
    }

    async checkpoint(): Promise<void> {
        const db = await this.connectionPool.getConnection();
        try {
            await this.walManager.checkpoint(db);
        } finally {
            this.connectionPool.releaseConnection(db);
        }
    }

    async repairRelationships(dryRun: boolean = false): Promise<{ fixed: number; issues: string[] }> {
        const db = await this.connectionPool.getConnection();
        try {
            const issues: string[] = [];
            let fixCount = 0;

            // Find orphaned tasks
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

            return { fixed: fixCount, issues };
        } finally {
            this.connectionPool.releaseConnection(db);
        }
    }

    async getMetrics(): Promise<SqliteMetrics> {
        const db = await this.connectionPool.getConnection();
        try {
            const [taskStats, statusStats, walMetrics] = await Promise.all([
                db.get<{ total: number; noteCount: number; dependencyCount: number }>(`
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
                db.all<{ status: string; count: number }[]>(`
                    SELECT status, COUNT(*) as count
                    FROM tasks
                    GROUP BY status
                `),
                this.walManager.getMetrics()
            ]);

            const byStatus = (statusStats || []).reduce((acc, curr) => {
                acc[curr.status] = curr.count;
                return acc;
            }, {} as Record<string, number>);

            // Get SQLite-specific metrics
            const [journalMode, synchronous, tempStore, lockingMode, autoVacuum] = await Promise.all([
                db.get<{ journal_mode: string }>('PRAGMA journal_mode'),
                db.get<{ synchronous: string }>('PRAGMA synchronous'),
                db.get<{ temp_store: string }>('PRAGMA temp_store'),
                db.get<{ locking_mode: string }>('PRAGMA locking_mode'),
                db.get<{ auto_vacuum: string }>('PRAGMA auto_vacuum')
            ]);

            // Run integrity check
            const integrityCheck = await db.get<{ integrity_check: string }>('PRAGMA quick_check');

            return {
                tasks: {
                    total: Number(taskStats?.total || 0),
                    byStatus,
                    noteCount: Number(taskStats?.noteCount || 0),
                    dependencyCount: Number(taskStats?.dependencyCount || 0)
                },
                storage: {
                    totalSize: 0, // TODO: Implement
                    pageSize: 4096,
                    pageCount: 0, // TODO: Implement
                    walSize: walMetrics.walSize,
                    cache: {
                        hitRate: this.cacheHits / (this.cacheHits + this.cacheMisses),
                        memoryUsage: process.memoryUsage().heapUsed,
                        entryCount: this.cache.size
                    }
                },
                sqlite: {
                    journalMode: journalMode?.journal_mode || 'unknown',
                    synchronous: synchronous?.synchronous || 'unknown',
                    tempStore: tempStore?.temp_store || 'unknown',
                    lockingMode: lockingMode?.locking_mode || 'unknown',
                    autoVacuum: autoVacuum?.auto_vacuum || 'unknown',
                    integrityCheck: integrityCheck?.integrity_check === 'ok',
                    lastCheckpoint: walMetrics.lastCheckpoint
                }
            };
        } finally {
            this.connectionPool.releaseConnection(db);
        }
    }

}
