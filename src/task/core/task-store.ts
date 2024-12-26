/**
 * Path-based task storage with caching, indexing, and transaction support
 */
import { Task, TaskStatus } from '../../types/task.js';
import { PathValidator } from '../../validation/index.js';
import { TaskStorage } from '../../types/storage.js';
import { Logger } from '../../logging/index.js';
import { TaskIndexManager } from './indexing/index-manager.js';
import { CacheManager } from './cache/cache-manager.js';
import { ErrorCodes, createError, type ErrorCode } from '../../errors/index.js';
import { TransactionManager } from './transactions/transaction-manager.js';

const BATCH_SIZE = 50; // Maximum number of tasks to process in parallel

/**
 * Helper function to create errors with consistent operation naming
 */
function createTaskStoreError(
    code: ErrorCode,
    message: string,
    operation: string = 'TaskStore',
    userMessage?: string,
    metadata?: Record<string, unknown>
): Error {
    return createError(
        code,
        message,
        `TaskStore.${operation}`,
        userMessage,
        metadata
    );
}

export class TaskStore {
    private readonly logger: Logger;
    private readonly indexManager: TaskIndexManager;
    private readonly cacheManager: CacheManager;
    private readonly pathValidator: PathValidator;
    private nodes: Map<string, {
        path: string;
        dependencies: Set<string>;
        dependents: Set<string>;
        visited: boolean;
        inPath: boolean;
        ref: WeakRef<object>;
    }>;
    private readonly transactionManager: TransactionManager;
    private readonly HIGH_MEMORY_THRESHOLD = 0.7; // 70% memory pressure threshold
    private readonly MEMORY_CHECK_INTERVAL = 10000; // 10 seconds
    private memoryCheckInterval?: NodeJS.Timeout;

    constructor(private readonly storage: TaskStorage) {
        this.logger = Logger.getInstance().child({ component: 'TaskStore' });
        this.indexManager = new TaskIndexManager();
        this.pathValidator = new PathValidator();
        this.cacheManager = new CacheManager({
            maxSize: 500, // Reduced from 1000
            ttl: 30000, // Reduced from 60000
            maxTTL: 60000, // Reduced from 300000
            cleanupInterval: 15000 // Reduced from 30000
        });
        this.nodes = new Map();
        this.transactionManager = TransactionManager.getInstance(storage);

        // Start memory monitoring
        this.startMemoryMonitoring();
    }

    private startMemoryMonitoring(): void {
        this.memoryCheckInterval = setInterval(() => {
            const memoryUsage = process.memoryUsage();
            const heapUsed = memoryUsage.heapUsed / memoryUsage.heapTotal;

            this.logger.debug('Memory usage', {
                heapUsed: `${(heapUsed * 100).toFixed(1)}%`,
                heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
                rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
                external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
                arrayBuffers: `${Math.round(memoryUsage.arrayBuffers / 1024 / 1024)}MB`,
                nodeCount: this.nodes.size,
                activeNodes: Array.from(this.nodes.keys()).length
            });

            if (heapUsed > this.HIGH_MEMORY_THRESHOLD) {
                this.logger.warn('High memory usage detected in TaskStore', {
                    heapUsed: `${(heapUsed * 100).toFixed(1)}%`
                });
                
                // Force cleanup
                this.cleanupResources(true);
                
                // Force GC if available
                if (global.gc) {
                    global.gc();
                }
            }
        }, this.MEMORY_CHECK_INTERVAL);

        // Ensure cleanup on process exit
        process.once('beforeExit', () => {
            if (this.memoryCheckInterval) {
                clearInterval(this.memoryCheckInterval);
                this.memoryCheckInterval = undefined;
            }
        });
    }

    private async cleanupResources(force: boolean = false): Promise<void> {
        try {
            const startTime = Date.now();
            let cleanedCount = 0;

            // Clean up nodes whose refs have been collected
            for (const [path, node] of this.nodes.entries()) {
                if (!node.ref.deref() || force) {
                    this.nodes.delete(path);
                    cleanedCount++;
                }
            }

            // Force garbage collection if needed
            if (global.gc && (force || cleanedCount > 0)) {
                global.gc();
            }

            const endTime = Date.now();
            this.logger.info('Resource cleanup completed', {
                duration: endTime - startTime,
                cleanedCount,
                remainingNodes: this.nodes.size,
                memoryUsage: this.getMemoryMetrics()
            });
        } catch (error) {
            this.logger.error('Error during resource cleanup', { error });
        }
    }

    private getMemoryMetrics(): Record<string, string> {
        const memoryUsage = process.memoryUsage();
        return {
            heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
            heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
            rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
            external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
            arrayBuffers: `${Math.round(memoryUsage.arrayBuffers / 1024 / 1024)}MB`,
            heapUsedPercentage: `${((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100).toFixed(1)}%`
        };
    }

    /**
     * Gets a task by path, checking cache first
     * @internal Used by getTasksByPattern, getTasksByStatus, and getSubtasks
     */
    /* istanbul ignore next */
    protected async getTaskByPath(path: string): Promise<Task | null> {
        const pathResult = this.pathValidator.validatePath(path);
        if (!pathResult.isValid) {
            throw createTaskStoreError(
                ErrorCodes.TASK_INVALID_PATH,
                pathResult.error || `Invalid task path: ${path}`,
                'getTaskByPath'
            );
        }

        // Check cache first
        const cachedTask = await this.cacheManager.get<Task>(path);
        if (cachedTask) {
            return cachedTask;
        }

        // Check index
        const indexedTask = await this.indexManager.getTaskByPath(path);
        if (indexedTask) {
            await this.cacheManager.set(path, indexedTask);
            return indexedTask;
        }

        // Load from storage
        const task = await this.storage.getTask(path);
        if (task) {
            await this.cacheManager.set(path, task);
            await this.indexManager.indexTask(task);
        }

        return task;
    }

    /**
     * Gets tasks by path pattern with efficient caching
     */
    async getTasksByPattern(pattern: string): Promise<Task[]> {
        try {
            // Get indexed tasks first
            const indexedTasks = await this.indexManager.getProjectTasks(pattern);
            
            // Batch process cache checks
            const tasks: Task[] = [];
            const missingPaths: string[] = [];

            await this.processBatch(indexedTasks, async indexedTask => {
                const cachedTask = await this.cacheManager.get<Task>(indexedTask.path);
                if (cachedTask) {
                    tasks.push(cachedTask);
                } else {
                    missingPaths.push(indexedTask.path);
                }
            });

            // If all tasks were cached, return them
            if (missingPaths.length === 0) {
                return tasks;
            }

            // Load missing tasks from storage
            const storageTasks = await this.storage.getTasksByPattern(pattern);

            // Update cache and indexes for missing tasks
            await this.processBatch(storageTasks, async task => {
                await this.indexManager.indexTask(task);
                await this.cacheManager.set(task.path, task);
                tasks.push(task);
            });

            return tasks;
        } catch (error) {
            this.logger.error('Failed to get tasks by pattern', { error, pattern });
            throw createTaskStoreError(
                ErrorCodes.OPERATION_FAILED,
                'Failed to get tasks by pattern',
                'getTasksByPattern',
                undefined,
                { pattern, error }
            );
        }
    }

    /**
     * Gets tasks by status with efficient caching
     */
    async getTasksByStatus(status: TaskStatus): Promise<Task[]> {
        try {
            // Get indexed tasks first
            const indexedTasks = await this.indexManager.getTasksByStatus(status, '');
            
            // Batch process cache checks
            const tasks: Task[] = [];
            const missingPaths: string[] = [];

            await this.processBatch(indexedTasks, async indexedTask => {
                const cachedTask = await this.cacheManager.get<Task>(indexedTask.path);
                if (cachedTask) {
                    tasks.push(cachedTask);
                } else {
                    missingPaths.push(indexedTask.path);
                }
            });

            // If all tasks were cached, return them
            if (missingPaths.length === 0) {
                return tasks;
            }

            // Load missing tasks from storage
            const storageTasks = await this.storage.getTasksByStatus(status);

            // Update cache and indexes for missing tasks
            await this.processBatch(storageTasks, async task => {
                await this.indexManager.indexTask(task);
                await this.cacheManager.set(task.path, task);
                tasks.push(task);
            });

            return tasks;
        } catch (error) {
            this.logger.error('Failed to get tasks by status', { error, status });
            throw createTaskStoreError(
                ErrorCodes.OPERATION_FAILED,
                'Failed to get tasks by status',
                'getTasksByStatus',
                undefined,
                { status, error }
            );
        }
    }

    /**
     * Gets subtasks of a task with efficient caching
     */
    async getSubtasks(parentPath: string): Promise<Task[]> {
        const pathResult = this.pathValidator.validatePath(parentPath);
        if (!pathResult.isValid) {
            throw createTaskStoreError(
                ErrorCodes.TASK_INVALID_PATH,
                pathResult.error || `Invalid parent path: ${parentPath}`,
                'getSubtasks'
            );
        }

        try {
            // Get indexed tasks first
            const indexedTasks = await this.indexManager.getTasksByParent(parentPath);
            
            // Batch process cache checks
            const tasks: Task[] = [];
            const missingPaths: string[] = [];

            await this.processBatch(indexedTasks, async indexedTask => {
                const cachedTask = await this.cacheManager.get<Task>(indexedTask.path);
                if (cachedTask) {
                    tasks.push(cachedTask);
                } else {
                    missingPaths.push(indexedTask.path);
                }
            });

            // If all tasks were cached, return them
            if (missingPaths.length === 0) {
                return tasks;
            }

            // Load missing tasks from storage
            const storageTasks = await this.storage.getSubtasks(parentPath);

            // Update cache and indexes for missing tasks
            await this.processBatch(storageTasks, async task => {
                await this.indexManager.indexTask(task);
                await this.cacheManager.set(task.path, task);
                tasks.push(task);
            });

            return tasks;
        } catch (error) {
            this.logger.error('Failed to get subtasks', { error, parentPath });
            throw createTaskStoreError(
                ErrorCodes.OPERATION_FAILED,
                'Failed to get subtasks',
                'getSubtasks',
                undefined,
                { parentPath, error }
            );
        }
    }

    /**
     * Processes tasks in batches with memory-efficient processing
     */
    private async processBatch<T>(
        items: T[],
        processor: (item: T) => Promise<void>
    ): Promise<void> {
        // Process in smaller chunks to avoid memory spikes
        const chunkSize = Math.min(BATCH_SIZE, 10);
        for (let i = 0; i < items.length; i += chunkSize) {
            const chunk = items.slice(i, i + chunkSize);
            
            // Process items sequentially in chunk to reduce memory pressure
            for (const item of chunk) {
                await processor(item);
            }

            // Allow GC between chunks
            if (i > 0 && i % (chunkSize * 5) === 0) {
                if (global.gc) {
                    global.gc();
                }
            }
        }
    }

    /**
     * Clears all tasks and resets indexes
     */
    async clearAllTasks(confirm: boolean): Promise<void> {
        if (!confirm) {
            throw createTaskStoreError(
                ErrorCodes.OPERATION_FAILED,
                'Must explicitly confirm task deletion',
                'clearAllTasks',
                'Set confirm parameter to true to proceed with clearing all tasks'
            );
        }

        const transaction = await this.transactionManager.begin();

        try {
            // Clear all tasks from storage
            await this.storage.clearAllTasks();
            
            // Clear cache and indexes
            await Promise.all([
                this.indexManager.clear(),
                this.cacheManager.clear()
            ]);

            await this.transactionManager.commit(transaction);
            this.logger.info('All tasks and indexes cleared');
        } catch (error) {
            await this.transactionManager.rollback(transaction);
            this.logger.error('Failed to clear tasks', { error });
            throw createTaskStoreError(
                ErrorCodes.OPERATION_FAILED,
                'Failed to clear all tasks',
                'clearAllTasks',
                undefined,
                { error }
            );
        }
    }

    /**
     * Optimizes database storage and performance
     */
    async vacuumDatabase(analyze: boolean = true): Promise<void> {
        try {
            await this.storage.vacuum();
            if (analyze) {
                await this.storage.analyze();
            }
            await this.storage.checkpoint();
            this.logger.info('Database optimized', { analyzed: analyze });
        } catch (error) {
            this.logger.error('Failed to optimize database', { error });
            throw createTaskStoreError(
                ErrorCodes.OPERATION_FAILED,
                'Failed to optimize database',
                'vacuumDatabase',
                undefined,
                { analyze, error }
            );
        }
    }

    /**
     * Repairs parent-child relationships and fixes inconsistencies
     */
    async repairRelationships(dryRun: boolean = false, pathPattern?: string): Promise<{ fixed: number, issues: string[] }> {
        const transaction = await this.transactionManager.begin();

        try {
            // Get tasks to repair
            const tasks = pathPattern ? 
                await this.getTasksByPattern(pathPattern) :
                await this.storage.getTasks([]);

            // Clear cache for affected tasks
            await Promise.all(tasks.map(task => this.cacheManager.delete(task.path)));

            // Repair relationships
            const result = await this.storage.repairRelationships(dryRun);

            if (!dryRun) {
                // Reindex all tasks after repair
                await Promise.all(tasks.map(task => this.indexManager.indexTask(task)));
            }

            await this.transactionManager.commit(transaction);
            return result;
        } catch (error) {
            await this.transactionManager.rollback(transaction);
            this.logger.error('Failed to repair relationships', { error });
            throw createTaskStoreError(
                ErrorCodes.OPERATION_FAILED,
                'Failed to repair relationships',
                'repairRelationships',
                undefined,
                { dryRun, pathPattern, error }
            );
        }
    }
}
