import { Task, type TaskStatus, CreateTaskInput, UpdateTaskInput, TaskResponse } from '../../types/task.js';
import { TaskStorage } from '../../types/storage.js';
import { Logger } from '../../logging/index.js';
import { TaskError } from '../../errors/task-error.js';
import { EventManager } from '../../events/event-manager.js';
import { EventTypes } from '../../types/events.js';
import { TaskOperations } from '../operations/task-operations.js';
import { TaskStatusBatchProcessor } from '../core/batch/task-status-batch-processor.js';
import { DependencyAwareBatchProcessor } from '../core/batch/dependency-aware-batch-processor.js';
import { TaskValidator } from '../validation/task-validator.js';
import { CacheManager } from '../core/cache/cache-manager.js';
import { CacheOptions } from '../../types/cache.js';
import { TaskIndexManager } from '../core/indexing/index-manager.js';
import { getErrorHandler } from './index.js';

/**
 * Path-based task manager implementation
 * Coordinates task operations, batch processing, validation, and resource management
 */
export class TaskManager {
    private static logger: Logger;
    private static instance: TaskManager | null = null;
    private static initializationPromise: Promise<TaskManager> | null = null;

    private operations!: TaskOperations;
    private readonly validator!: TaskValidator;
    private readonly statusBatchProcessor!: TaskStatusBatchProcessor;
    private readonly dependencyBatchProcessor!: DependencyAwareBatchProcessor;
    private readonly cacheManager!: CacheManager;
    private readonly indexManager!: TaskIndexManager;
    private readonly eventManager!: EventManager;
    private readonly errorHandler = getErrorHandler();
    private memoryMonitor?: NodeJS.Timeout;
    private initialized = false;

    private readonly MAX_CACHE_MEMORY = 1024 * 1024 * 1024; // 1GB cache limit
    private readonly MEMORY_CHECK_INTERVAL = 60000; // 60 seconds
    private readonly MEMORY_PRESSURE_THRESHOLD = 0.9; // 90% of max before cleanup

    private constructor(private readonly storage: TaskStorage) {
        // Initialize basic components that don't require async operations
        TaskManager.initLogger();
        this.eventManager = EventManager.getInstance();
        this.validator = new TaskValidator(storage);
        
        // Initialize cache management
        const cacheOptions: CacheOptions = {
            maxSize: this.MAX_CACHE_MEMORY,
            ttl: 15 * 60 * 1000, // 15 minutes
            cleanupInterval: 5 * 60 * 1000 // 5 minutes
        };
        this.cacheManager = new CacheManager(cacheOptions);
        this.indexManager = new TaskIndexManager();

        // Initialize batch processors
        const batchDeps = {
            storage,
            validator: this.validator,
            logger: TaskManager.logger,
            cacheManager: this.cacheManager
        };
        this.statusBatchProcessor = new TaskStatusBatchProcessor(batchDeps);
        this.dependencyBatchProcessor = new DependencyAwareBatchProcessor(batchDeps);

        // Setup memory monitoring
        this.setupMemoryMonitoring();
    }

    /**
     * Updates task statuses in bulk with dependency validation
     */
    public async updateTaskStatuses(updates: { path: string; status: TaskStatus }[]): Promise<TaskResponse<Task[]>> {
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
                this.errorHandler.handleBulkOperationError(
                    result.errors,
                    'updateTaskStatuses',
                    { updates }
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
                    projectPath: tasks[0]?.projectPath || 'unknown',
                    affectedPaths: updates.map(u => u.path)
                }
            };
        } catch (error) {
            this.errorHandler.handleOperationError(
                error,
                'updateTaskStatuses',
                { updates }
            );
            throw error;
        }
    }

    /**
     * Updates task dependencies in bulk with cycle detection
     */
    public async updateTaskDependencies(updates: { path: string; dependencies: string[] }[]): Promise<TaskResponse<Task[]>> {
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
                this.errorHandler.handleBulkOperationError(
                    result.errors,
                    'updateTaskDependencies',
                    { updates }
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
                    projectPath: tasks[0]?.projectPath || 'unknown',
                    affectedPaths: updates.map(u => u.path)
                }
            };
        } catch (error) {
            this.errorHandler.handleOperationError(
                error,
                'updateTaskDependencies',
                { updates }
            );
            throw error;
        }
    }

    private static initLogger(): void {
        if (!TaskManager.logger) {
            TaskManager.logger = Logger.getInstance().child({ component: 'TaskManager' });
        }
    }

    /**
     * Sets up memory monitoring for cache management
     */
    private setupMemoryMonitoring(): void {
        // Clear any existing monitor
        if (this.memoryMonitor) {
            clearInterval(this.memoryMonitor);
        }

        // Set up new monitor with weak reference to this
        const weakThis = new WeakRef(this);
        
        this.memoryMonitor = setInterval(async () => {
            const instance = weakThis.deref();
            if (!instance) {
                // If instance is garbage collected, stop monitoring
                if (this.memoryMonitor) {
                    clearInterval(this.memoryMonitor);
                }
                return;
            }

            const memUsage = process.memoryUsage();
            
            // Log memory stats with Windows-specific handling
            const stats = {
                heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
                heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
                rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
                // Windows can have different memory reporting
                platform: process.platform
            };
            
            TaskManager.logger.debug('Task manager memory usage:', stats);

            // Check if memory usage is approaching threshold
            const memoryUsageRatio = memUsage.heapUsed / instance.MAX_CACHE_MEMORY;
            
            if (memoryUsageRatio > instance.MEMORY_PRESSURE_THRESHOLD) {
                // Emit memory pressure event
                instance.eventManager.emitCacheEvent({
                    type: EventTypes.MEMORY_PRESSURE,
                    timestamp: Date.now(),
                    metadata: {
                        memoryUsage: memUsage,
                        threshold: instance.MAX_CACHE_MEMORY
                    }
                });

                TaskManager.logger.warn('Cache memory threshold exceeded, clearing caches', {
                    heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
                    threshold: `${Math.round(instance.MAX_CACHE_MEMORY / 1024 / 1024)}MB`
                });
                
                await instance.clearCaches(true);
            }
        }, this.MEMORY_CHECK_INTERVAL);

        // Ensure interval is cleaned up if process exits
        process.on('beforeExit', () => {
            if (this.memoryMonitor) {
                clearInterval(this.memoryMonitor);
            }
        });
    }

    /**
     * Initializes task indexes from storage
     */
    private async initialize(): Promise<void> {
        if (this.initialized) {
            TaskManager.logger.debug('Task manager already initialized');
            return;
        }

        try {
            // Initialize async components first
            await this.initializeComponents();
            // Get all tasks and build indexes
            const tasks = await this.storage.getTasksByPattern('*');
            
            // Initialize indexes in batches to avoid memory pressure
            const batchSize = 100;
            for (let i = 0; i < tasks.length; i += batchSize) {
                const batch = tasks.slice(i, i + batchSize);
                for (const task of batch) {
                    await this.indexManager.indexTask(task);
                }
                // Allow GC between batches
                if (global.gc) {
                    global.gc();
                }
            }
            
            this.initialized = true;
            TaskManager.logger.info('Task indexes initialized', { taskCount: tasks.length });
        } catch (error) {
            TaskManager.logger.error('Failed to initialize task indexes', { error });
            throw error;
        }
    }

    /**
     * Initializes components that require async operations
     */
    private async initializeComponents(): Promise<void> {
        // Initialize task operations
        this.operations = await TaskOperations.getInstance(this.storage, this.validator);
    }

    /**
     * Gets the TaskManager instance
     */
    public static async getInstance(storage: TaskStorage): Promise<TaskManager> {
        // Return existing instance if available
        if (TaskManager.instance && TaskManager.instance.initialized) {
            return TaskManager.instance;
        }

        // If initialization is in progress, wait for it
        if (TaskManager.initializationPromise) {
            return TaskManager.initializationPromise;
        }

        // Start new initialization with mutex
        TaskManager.initializationPromise = (async () => {
            try {
                // Double-check instance hasn't been created while waiting
                if (TaskManager.instance && TaskManager.instance.initialized) {
                    return TaskManager.instance;
                }

                TaskManager.instance = new TaskManager(storage);
                await TaskManager.instance.initialize();
                return TaskManager.instance;
            } catch (error) {
                throw TaskError.operationFailed(
                    'TaskManager',
                    'getInstance',
                    `Failed to initialize: ${error instanceof Error ? error.message : String(error)}`,
                    { error }
                );
            } finally {
                TaskManager.initializationPromise = null;
            }
        })();

        return TaskManager.initializationPromise;
    }

    /**
     * Creates a new task with path-based hierarchy
     */
    public async createTask(input: CreateTaskInput): Promise<TaskResponse<Task>> {
        try {
            // Validate input
            if (!input.name) {
                this.errorHandler.handleValidationError(
                    'Task name is required',
                    'createTask',
                    { input }
                );
            }

            const result = await this.operations.createTask(input);
            await this.indexManager.indexTask(result);

            TaskManager.logger.info('Task created successfully', {
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
                    projectPath: result.projectPath,
                    affectedPaths: [result.path]
                }
            };
        } catch (error) {
            this.errorHandler.handleOperationError(
                error,
                'createTask',
                {
                    input,
                    path: input.path,
                    parentPath: input.parentPath,
                    type: input.type
                }
            );
            throw error;
        }
    }

    /**
     * Updates an existing task
     */
    public async updateTask(path: string, updates: UpdateTaskInput): Promise<TaskResponse<Task>> {
        try {
            const oldTask = await this.getTaskByPath(path);
            if (!oldTask) {
                this.errorHandler.handleNotFoundError(
                    path,
                    'updateTask',
                    { updates }
                );
            }

            const result = await this.operations.updateTask(path, updates);
            await this.indexManager.indexTask(result);

            TaskManager.logger.info('Task updated successfully', {
                taskId: result.path,
                updates,
                oldStatus: oldTask!.status,
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
            if (updates.status && oldTask!.status !== updates.status) {
                this.eventManager.emitTaskEvent({
                    type: EventTypes.TASK_STATUS_CHANGED,
                    timestamp: Date.now(),
                    taskId: result.path,
                    task: result,
                    changes: {
                        before: { status: oldTask!.status },
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
                    projectPath: result.projectPath,
                    affectedPaths: [result.path]
                }
            };
        } catch (error) {
            this.errorHandler.handleOperationError(
                error,
                'updateTask',
                {
                    path,
                    updates
                }
            );
            throw error;
        }
    }

    /**
     * Retrieves a task by its path
     */
    private async getTaskByPath(path: string): Promise<Task | null> {
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
            TaskManager.logger.error('Failed to get task by path', { error, path });
            throw error;
        }
    }

    /**
     * Executes multiple task operations in a single transaction
     */
    public async bulkTaskOperations(operations: { type: 'create' | 'update' | 'delete', path: string, data?: CreateTaskInput | UpdateTaskInput }[]): Promise<TaskResponse<Task[]>> {
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
                                    this.errorHandler.handleInvalidInputError(
                                        'Create operation requires valid task input',
                                        'bulkTaskOperations',
                                        { operation: op }
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

                                TaskManager.logger.info('Task created in bulk operation', {
                                    taskId: created.path,
                                    type: created.type
                                });
                                break;

                            case 'update':
                                if (!op.data) {
                                    this.errorHandler.handleInvalidInputError(
                                        'Update operation requires task updates',
                                        'bulkTaskOperations',
                                        { operation: op }
                                    );
                                }
                                const oldTask = await this.getTaskByPath(op.path);
                                if (!oldTask) {
                                    this.errorHandler.handleNotFoundError(
                                        op.path,
                                        'bulkTaskOperations',
                                        { operation: op }
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

                                TaskManager.logger.info('Task updated in bulk operation', {
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
                                    TaskManager.logger.info('Task deleted in bulk operation', {
                                        taskId: task.path
                                    });
                                }
                                await this.operations.deleteTask(op.path);
                                break;
                        }
                    } catch (error) {
                        errors.push(error as Error);
                        TaskManager.logger.error('Failed to execute bulk operation', {
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
                    this.errorHandler.handleBulkOperationError(
                        errors,
                        'bulkTaskOperations',
                        { operations }
                    );
                }

                return {
                    success: true,
                    data: results,
                    metadata: {
                        timestamp: Date.now(),
                        requestId: Math.random().toString(36).substring(7),
                        projectPath: results[0]?.projectPath || 'unknown',
                        affectedPaths: operations.map(op => op.path)
                    }
                };
            } catch (error) {
                await this.storage.rollbackTransaction();
                throw error;
            }
        } catch (error) {
            this.errorHandler.handleOperationError(
                error,
                'bulkTaskOperations',
                { operations }
            );
            throw error;
        }
    }

    /**
     * Clears all caches to free memory
     */
    private async clearCaches(forceClean: boolean = false): Promise<void> {
        try {
            // Clear storage and manager caches
            await this.cacheManager.clear();
            this.indexManager.clear();

            // Force garbage collection if available
            if (global.gc) {
                global.gc();
                
                // Check if GC helped
                const afterGC = process.memoryUsage();
                if (forceClean && afterGC.heapUsed > (this.MAX_CACHE_MEMORY * this.MEMORY_PRESSURE_THRESHOLD)) {
                    // If memory is still high after aggressive cleanup, log warning
                    TaskManager.logger.warn('Memory usage remains high after cleanup', {
                        heapUsed: `${Math.round(afterGC.heapUsed / 1024 / 1024)}MB`,
                        threshold: `${Math.round(this.MAX_CACHE_MEMORY / 1024 / 1024)}MB`
                    });
                }
            }

            TaskManager.logger.info('Caches cleared successfully');
        } catch (error) {
            TaskManager.logger.error('Failed to clear caches', { error });
            throw error;
        }
    }
}
