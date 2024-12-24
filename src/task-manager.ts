/**
 * Path-based task manager implementation
 * Coordinates task operations, batch processing, validation, and resource management
 */
import { Task, TaskStatus, CreateTaskInput, UpdateTaskInput, TaskResponse } from './types/task.js';
import { TaskStorage } from './types/storage.js';
import { Logger } from './logging/index.js';
import { ErrorCodes, createError } from './errors/index.js';
import { EventManager } from './events/event-manager.js';
import { EventTypes } from './types/events.js';
import { TaskOperations } from './task/operations/task-operations.js';
import { TaskStatusBatchProcessor } from './task/core/batch/task-status-batch-processor.js';
import { DependencyAwareBatchProcessor } from './task/core/batch/dependency-aware-batch-processor.js';
import { TaskValidator } from './task/validation/task-validator.js';
import { CacheManager } from './task/core/cache/cache-manager.js';
import { CacheOptions } from './types/cache.js';
import { TaskIndexManager } from './task/core/indexing/index-manager.js';

export class TaskManager {
    private readonly logger: Logger;
    private readonly operations: TaskOperations;
    private readonly validator: TaskValidator;
    private readonly statusBatchProcessor: TaskStatusBatchProcessor;
    private readonly dependencyBatchProcessor: DependencyAwareBatchProcessor;
    private readonly cacheManager: CacheManager;
    private readonly indexManager: TaskIndexManager;
    private memoryMonitor?: NodeJS.Timeout;
    private readonly MAX_CACHE_MEMORY = 512 * 1024 * 1024; // 512MB cache limit
    private readonly MEMORY_CHECK_INTERVAL = 60000; // 1 minute

    private readonly eventManager: EventManager;

    constructor(readonly storage: TaskStorage) {
        // Initialize components
        this.logger = Logger.getInstance().child({ component: 'TaskManager' });
        this.eventManager = EventManager.getInstance();
        this.validator = new TaskValidator(storage);
        this.operations = new TaskOperations(storage, this.validator);
        
        // Initialize cache management
        const cacheOptions: CacheOptions = {
            maxSize: this.MAX_CACHE_MEMORY,
            ttl: 5 * 60 * 1000, // 5 minutes
            cleanupInterval: 60 * 1000 // 1 minute
        };
        this.cacheManager = new CacheManager(cacheOptions);
        this.indexManager = new TaskIndexManager();

        // Initialize batch processors
        const batchDeps = {
            storage,
            validator: this.validator,
            logger: this.logger,
            cacheManager: this.cacheManager
        };
        this.statusBatchProcessor = new TaskStatusBatchProcessor(batchDeps);
        this.dependencyBatchProcessor = new DependencyAwareBatchProcessor(batchDeps);

        // Setup memory monitoring
        this.setupMemoryMonitoring();

        // Initialize indexes from storage
        this.initializeIndexes().catch((error: Error) => {
            this.logger.error('Failed to initialize indexes', { error });
        });
    }

    /**
     * Initializes task indexes from storage
     */
    private async initializeIndexes(): Promise<void> {
        try {
            const tasks = await this.storage.getTasksByPattern('*');
            for (const task of tasks) {
                await this.indexManager.indexTask(task);
            }
            this.logger.info('Task indexes initialized', { taskCount: tasks.length });
        } catch (error) {
            this.logger.error('Failed to initialize task indexes', { error });
            throw error;
        }
    }

    /**
     * Creates a new task with path-based hierarchy
     */
    async createTask(input: CreateTaskInput): Promise<TaskResponse<Task>> {
        try {
            // Validate input
            if (!input.name) {
                throw createError(
                    ErrorCodes.VALIDATION_ERROR,
                    'Task name is required'
                );
            }

            const result = await this.operations.createTask(input);
            await this.indexManager.indexTask(result);

            this.logger.info('Task created successfully', {
                taskId: result.path,
                type: result.type,
                parentPath: input.parentPath
            });

            // Emit task created event
            this.eventManager.emitTaskEvent({
                type: EventTypes.TASK_CREATED,
                timestamp: Date.now(),
                taskId: result.path,
                task: result,
                metadata: { input }
            });
            return {
                success: true,
                data: result,
                metadata: {
                    timestamp: Date.now(),
                    requestId: Math.random().toString(36).substring(7),
                    projectPath: result.metadata.projectPath,
                    affectedPaths: [result.path]
                }
            };
        } catch (error) {
            this.logger.error('Failed to create task', {
                error,
                input,
                context: {
                    path: input.path,
                    parentPath: input.parentPath,
                    type: input.type
                }
            });
            throw error;
        }
    }

    /**
     * Updates an existing task
     */
    async updateTask(path: string, updates: UpdateTaskInput): Promise<TaskResponse<Task>> {
        try {
            const oldTask = await this.getTaskByPath(path);
            if (!oldTask) {
                throw createError(
                    ErrorCodes.TASK_NOT_FOUND,
                    `Task not found: ${path}`
                );
            }

            const result = await this.operations.updateTask(path, updates);
            await this.indexManager.indexTask(result);

            this.logger.info('Task updated successfully', {
                taskId: result.path,
                updates,
                oldStatus: oldTask.status,
                newStatus: result.status
            });

            // Emit task updated event
            this.eventManager.emitTaskEvent({
                type: EventTypes.TASK_UPDATED,
                timestamp: Date.now(),
                taskId: result.path,
                task: result,
                changes: {
                    before: oldTask,
                    after: result
                }
            });

            // Emit status change event if status was updated
            if (updates.status && oldTask.status !== updates.status) {
                this.eventManager.emitTaskEvent({
                    type: EventTypes.TASK_STATUS_CHANGED,
                    timestamp: Date.now(),
                    taskId: result.path,
                    task: result,
                    changes: {
                        before: { status: oldTask.status },
                        after: { status: updates.status }
                    }
                });
            }
            return {
                success: true,
                data: result,
                metadata: {
                    timestamp: Date.now(),
                    requestId: Math.random().toString(36).substring(7),
                    projectPath: result.metadata.projectPath,
                    affectedPaths: [result.path]
                }
            };
        } catch (error) {
            this.logger.error('Failed to update task', {
                error,
                context: {
                    path,
                    updates,
                    operation: 'updateTask'
                }
            });
            throw error;
        }
    }

    /**
     * Updates task statuses in bulk with dependency validation
     */
    async updateTaskStatuses(updates: { path: string; status: TaskStatus }[]): Promise<TaskResponse<Task[]>> {
        try {
            const batch = updates.map(update => ({
                id: update.path,
                data: {
                    path: update.path,
                    metadata: { newStatus: update.status }
                }
            }));

            const result = await this.statusBatchProcessor.execute(batch);
            
            if (result.errors.length > 0) {
                throw createError(
                    ErrorCodes.TASK_STATUS,
                    {
                        errors: result.errors,
                        updates
                    },
                    'Failed to update task statuses'
                );
            }

            const tasks = result.results as Task[];
            
            // Update indexes
            for (const task of tasks) {
                await this.indexManager.indexTask(task);
            }

            return {
                success: true,
                data: tasks,
                metadata: {
                    timestamp: Date.now(),
                    requestId: Math.random().toString(36).substring(7),
                    projectPath: tasks[0]?.metadata.projectPath || 'unknown',
                    affectedPaths: updates.map(u => u.path)
                }
            };
        } catch (error) {
            this.logger.error('Failed to update task statuses', {
                error,
                updates
            });
            throw error;
        }
    }

    /**
     * Updates task dependencies in bulk with cycle detection
     */
    async updateTaskDependencies(updates: { path: string; dependencies: string[] }[]): Promise<TaskResponse<Task[]>> {
        try {
            const batch = updates.map(update => ({
                id: update.path,
                data: {
                    path: update.path,
                    dependencies: update.dependencies
                }
            }));

            const result = await this.dependencyBatchProcessor.execute(batch);

            if (result.errors.length > 0) {
                throw createError(
                    ErrorCodes.TASK_DEPENDENCY,
                    {
                        errors: result.errors,
                        updates
                    },
                    'Failed to update task dependencies'
                );
            }

            const tasks = result.results as Task[];
            
            // Update indexes
            for (const task of tasks) {
                await this.indexManager.indexTask(task);
            }

            return {
                success: true,
                data: tasks,
                metadata: {
                    timestamp: Date.now(),
                    requestId: Math.random().toString(36).substring(7),
                    projectPath: tasks[0]?.metadata.projectPath || 'unknown',
                    affectedPaths: updates.map(u => u.path)
                }
            };
        } catch (error) {
            this.logger.error('Failed to update task dependencies', {
                error,
                updates
            });
            throw error;
        }
    }

    /**
     * Retrieves a task by its path
     */
    async getTaskByPath(path: string): Promise<Task | null> {
        try {
            const indexedTask = await this.indexManager.getTaskByPath(path);
            if (!indexedTask) {
                return null;
            }
            return {
                ...indexedTask,
                metadata: indexedTask.metadata || {},
                dependencies: indexedTask.dependencies || [],
                subtasks: indexedTask.subtasks || []
            };
        } catch (error) {
            this.logger.error('Failed to get task by path', { error, path });
            throw error;
        }
    }

    /**
     * Lists tasks matching a path pattern
     */
    async listTasks(pathPattern: string): Promise<Task[]> {
        try {
            const indexedTasks = await this.indexManager.getTasksByPattern(pathPattern);
            return indexedTasks.map(t => ({
                ...t,
                metadata: t.metadata || {},
                dependencies: t.dependencies || [],
                subtasks: t.subtasks || []
            }));
        } catch (error) {
            this.logger.error('Failed to list tasks', { error, pathPattern });
            throw error;
        }
    }

    /**
     * Gets tasks by status
     */
    async getTasksByStatus(status: TaskStatus): Promise<Task[]> {
        try {
            const indexedTasks = await this.indexManager.getTasksByStatus(status);
            return indexedTasks.map(t => ({
                ...t,
                metadata: t.metadata || {},
                dependencies: t.dependencies || [],
                subtasks: t.subtasks || []
            }));
        } catch (error) {
            this.logger.error('Failed to get tasks by status', { error, status });
            throw error;
        }
    }

    /**
     * Gets subtasks of a task
     */
    async getSubtasks(parentPath: string): Promise<Task[]> {
        try {
            const indexedTasks = await this.indexManager.getTasksByParent(parentPath);
            return indexedTasks.map(t => ({
                ...t,
                metadata: t.metadata || {},
                dependencies: t.dependencies || [],
                subtasks: t.subtasks || []
            }));
        } catch (error) {
            this.logger.error('Failed to get subtasks', { error, parentPath });
            throw error;
        }
    }

    /**
     * Deletes a task and its subtasks
     */
    async deleteTask(path: string): Promise<TaskResponse<void>> {
        try {
            const task = await this.storage.getTask(path);
            if (task) {
                // Emit task deleted event before deletion
                this.eventManager.emitTaskEvent({
                    type: EventTypes.TASK_DELETED,
                    timestamp: Date.now(),
                    taskId: task.path,
                    task: task
                });
                await this.indexManager.unindexTask(task);
            }
            await this.operations.deleteTask(path);
            return {
                success: true,
                metadata: {
                    timestamp: Date.now(),
                    requestId: Math.random().toString(36).substring(7),
                    projectPath: path.split('/')[0],
                    affectedPaths: [path]
                }
            };
        } catch (error) {
            this.logger.error('Failed to delete task', {
                error,
                context: {
                    path,
                    operation: 'deleteTask'
                }
            });
            throw error;
        }
    }

    /**
     * Clears all tasks from the database and resets all caches
     */
    async clearAllTasks(confirm: boolean): Promise<void> {
        if (!confirm) {
            throw createError(
                ErrorCodes.INVALID_INPUT,
                {
                    context: 'Clear all tasks',
                    required: 'explicit confirmation'
                },
                'Must explicitly confirm task deletion',
                'Set confirm parameter to true to proceed with clearing all tasks. This operation cannot be undone.'
            );
        }

        try {
            // Get count of tasks before deletion for logging
            const tasks = await this.storage.getTasksByPattern('*');
            const taskCount = tasks.length;

            // Start transaction for clearing all tasks
            await this.storage.beginTransaction();

            try {
                // Clear all tasks and reset database
                await this.storage.clearAllTasks();
                this.indexManager.clear();

                // Clear all caches and force cleanup
                await this.clearCaches();

                // Force garbage collection if available
                if (global.gc) {
                    global.gc();
                }

                await this.storage.commitTransaction();
                
                // Optimize database after transaction is complete
                try {
                    await this.storage.vacuum();
                    await this.storage.analyze();
                    await this.storage.checkpoint();
                } catch (optimizeError) {
                    // Log but don't fail if optimization fails
                    this.logger.warn('Failed to optimize database after clearing tasks', { 
                        error: optimizeError,
                        operation: 'clearAllTasks'
                    });
                }

                this.logger.info('Database and caches reset', {
                    tasksCleared: taskCount,
                    operation: 'clearAllTasks'
                });
            } catch (error) {
                // Rollback transaction on error
                await this.storage.rollbackTransaction();
                throw error;
            }
        } catch (error) {
            this.logger.error('Failed to clear tasks', {
                error,
                context: {
                    operation: 'clearAllTasks',
                    confirm
                }
            });
            throw error;
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
            throw error;
        }
    }

    /**
     * Repairs parent-child relationships and fixes inconsistencies
     */
    async repairRelationships(dryRun: boolean = false, pathPattern?: string): Promise<{ fixed: number, issues: string[] }> {
        try {
            const result = await this.storage.repairRelationships(dryRun);
            if (!dryRun) {
                // Reinitialize indexes after repair
                await this.initializeIndexes();
            }
            this.logger.info('Relationship repair completed', { 
                dryRun,
                pathPattern,
                fixed: result.fixed,
                issueCount: result.issues.length
            });
            return result;
        } catch (error) {
            this.logger.error('Failed to repair relationships', { error });
            throw error;
        }
    }

    /**
     * Sets up memory monitoring for cache management
     */
    private setupMemoryMonitoring(): void {
        this.memoryMonitor = setInterval(async () => {
            const memUsage = process.memoryUsage();
            
            // Log memory stats
            this.logger.debug('Task manager memory usage:', {
                heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
                heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
                rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`
            });

            // Check if cache is using too much memory
            if (memUsage.heapUsed > this.MAX_CACHE_MEMORY) {
                // Emit memory pressure event
                this.eventManager.emitCacheEvent({
                    type: EventTypes.MEMORY_PRESSURE,
                    timestamp: Date.now(),
                    metadata: {
                        memoryUsage: memUsage,
                        threshold: this.MAX_CACHE_MEMORY
                    }
                });

                this.logger.warn('Cache memory threshold exceeded, clearing caches', {
                    heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
                    threshold: `${Math.round(this.MAX_CACHE_MEMORY / 1024 / 1024)}MB`
                });
                
                await this.clearCaches();
            }
        }, this.MEMORY_CHECK_INTERVAL);
    }

    /**
     * Clears all caches to free memory
     */
    async clearCaches(): Promise<void> {
        try {
            // Clear storage and manager caches
            await this.cacheManager.clear();
            this.indexManager.clear();

            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }

            this.logger.info('Caches cleared successfully');
        } catch (error) {
            this.logger.error('Failed to clear caches', { error });
            throw error;
        }
    }

    /**
     * Gets current memory usage statistics
     */
    getMemoryStats(): { heapUsed: number; heapTotal: number; rss: number } {
        const memUsage = process.memoryUsage();
        return {
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal,
            rss: memUsage.rss
        };
    }

    /**
     * Cleans up resources and closes connections
     */
    async cleanup(): Promise<void> {
        try {
            // Stop memory monitoring
            if (this.memoryMonitor) {
                clearInterval(this.memoryMonitor);
            }

            // Clear caches
            await this.clearCaches();

            // Close storage
            await this.storage.close();

            this.logger.info('Task manager cleanup completed');
        } catch (error) {
            this.logger.error('Failed to cleanup task manager', { error });
            throw error;
        }
    }

    /**
     * Closes the task manager and releases resources
     */
    async close(): Promise<void> {
        await this.cleanup();
    }

    /**
     * Executes multiple task operations in a single transaction
     * Handles create, update, and delete operations with proper validation
     * and dependency management through TaskOperations
     */
    async bulkTaskOperations(operations: { type: 'create' | 'update' | 'delete', path: string, data?: CreateTaskInput | UpdateTaskInput }[]): Promise<TaskResponse<Task[]>> {
        try {
            const results: Task[] = [];
            const errors: Error[] = [];

            // Start transaction
            await this.storage.beginTransaction();

            try {
                for (const op of operations) {
                    try {
                        switch (op.type) {
                            case 'create':
                                if (!op.data || !('type' in op.data)) {
                                    throw createError(
                                        ErrorCodes.INVALID_INPUT,
                                        'Create operation requires valid task input'
                                    );
                                }
                                const created = await this.operations.createTask(op.data as CreateTaskInput);
                                await this.indexManager.indexTask(created);
                                results.push(created);

                                // Emit task created event
                                this.eventManager.emitTaskEvent({
                                    type: EventTypes.TASK_CREATED,
                                    timestamp: Date.now(),
                                    taskId: created.path,
                                    task: created,
                                    metadata: { input: op.data }
                                });

                                this.logger.info('Task created in bulk operation', {
                                    taskId: created.path,
                                    type: created.type
                                });
                                break;

                            case 'update':
                                if (!op.data) {
                                    throw createError(
                                        ErrorCodes.INVALID_INPUT,
                                        'Update operation requires task updates'
                                    );
                                }
                                const oldTask = await this.getTaskByPath(op.path);
                                if (!oldTask) {
                                    throw createError(
                                        ErrorCodes.TASK_NOT_FOUND,
                                        `Task not found: ${op.path}`
                                    );
                                }

                                const updated = await this.operations.updateTask(op.path, op.data as UpdateTaskInput);
                                await this.indexManager.indexTask(updated);
                                results.push(updated);

                                // Emit task updated event
                                this.eventManager.emitTaskEvent({
                                    type: EventTypes.TASK_UPDATED,
                                    timestamp: Date.now(),
                                    taskId: updated.path,
                                    task: updated,
                                    changes: {
                                        before: oldTask,
                                        after: updated
                                    }
                                });

                                this.logger.info('Task updated in bulk operation', {
                                    taskId: updated.path,
                                    updates: op.data
                                });
                                break;

                            case 'delete':
                                const task = await this.storage.getTask(op.path);
                                if (task) {
                                    // Emit task deleted event before deletion
                                    this.eventManager.emitTaskEvent({
                                        type: EventTypes.TASK_DELETED,
                                        timestamp: Date.now(),
                                        taskId: task.path,
                                        task: task
                                    });

                                    await this.indexManager.unindexTask(task);
                                    this.logger.info('Task deleted in bulk operation', {
                                        taskId: task.path
                                    });
                                }
                                await this.operations.deleteTask(op.path);
                                break;
                        }
                    } catch (error) {
                        errors.push(error as Error);
                        this.logger.error('Failed to execute bulk operation', {
                            error,
                            operation: op
                        });
                    }
                }

                // Commit transaction if no errors
                if (errors.length === 0) {
                    await this.storage.commitTransaction();
                } else {
                    await this.storage.rollbackTransaction();
                    throw createError(
                        ErrorCodes.INVALID_INPUT,
                        {
                            errors,
                            operations
                        },
                        'Failed to execute bulk operations'
                    );
                }

                return {
                    success: true,
                    data: results,
                    metadata: {
                        timestamp: Date.now(),
                        requestId: Math.random().toString(36).substring(7),
                        projectPath: results[0]?.metadata.projectPath || 'unknown',
                        affectedPaths: operations.map(op => op.path)
                    }
                };
            } catch (error) {
                await this.storage.rollbackTransaction();
                throw error;
            }
        } catch (error) {
            this.logger.error('Failed to execute bulk operations', { error });
            throw error;
        }
    }
}
