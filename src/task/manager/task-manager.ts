import { Task, TaskStatus, CreateTaskInput, UpdateTaskInput, TaskResponse } from '../../types/task.js';
import { TaskStorage } from '../../types/storage.js';
import { Logger } from '../../logging/index.js';
import { ErrorCodes, createError } from '../../errors/index.js';
import { TaskOperations } from '../operations/task-operations.js';
import { TaskStatusBatchProcessor } from '../core/batch/task-status-batch-processor.js';
import { DependencyAwareBatchProcessor } from '../core/batch/dependency-aware-batch-processor.js';
import { TaskValidator } from '../validation/task-validator.js';
import { TaskEventHandler } from './task-event-handler.js';
import { TaskCacheManager } from './task-cache-manager.js';

export class TaskManager {
    private static logger: Logger;
    private operations!: TaskOperations;
    private readonly validator: TaskValidator;
    private readonly statusBatchProcessor: TaskStatusBatchProcessor;
    private readonly dependencyBatchProcessor: DependencyAwareBatchProcessor;
    private readonly eventHandler: TaskEventHandler;
    private readonly cacheManager: TaskCacheManager;
    private static instance: TaskManager | null = null;
    private initialized = false;
    private static initializationMutex = new Set<string>();
    private static instanceId = Math.random().toString(36).substr(2, 9);

    private constructor(readonly storage: TaskStorage) {
        TaskManager.initLogger();
        this.validator = new TaskValidator(storage);
        this.eventHandler = new TaskEventHandler();
        this.cacheManager = new TaskCacheManager();

        const batchDeps = {
            storage,
            validator: this.validator,
            logger: TaskManager.logger,
            cacheManager: this.cacheManager
        };
        this.statusBatchProcessor = new TaskStatusBatchProcessor(batchDeps);
        this.dependencyBatchProcessor = new DependencyAwareBatchProcessor(batchDeps);
    }

    private static initLogger(): void {
        if (!TaskManager.logger) {
            TaskManager.logger = Logger.getInstance().child({ component: 'TaskManager' });
        }
    }

    private async initializeComponents(): Promise<void> {
        this.operations = await TaskOperations.getInstance(this.storage, this.validator);
    }

    static async getInstance(storage: TaskStorage): Promise<TaskManager> {
        const mutexKey = `taskmanager-${TaskManager.instanceId}`;
        
        if (TaskManager.instance?.initialized) {
            return TaskManager.instance;
        }

        while (TaskManager.initializationMutex.has(mutexKey)) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        if (TaskManager.instance?.initialized) {
            return TaskManager.instance;
        }

        TaskManager.initializationMutex.add(mutexKey);

        try {
            if (!TaskManager.instance) {
                TaskManager.instance = new TaskManager(storage);
            }

            if (!TaskManager.instance.initialized) {
                await TaskManager.instance.initialize();
            }

            return TaskManager.instance;
        } catch (error) {
            TaskManager.instance = null;
            throw createError(
                ErrorCodes.STORAGE_INIT,
                `Failed to initialize TaskManager: ${error instanceof Error ? error.message : String(error)}`,
                'getInstance'
            );
        } finally {
            TaskManager.initializationMutex.delete(mutexKey);
        }
    }

    private async initialize(): Promise<void> {
        if (this.initialized) {
            TaskManager.logger.debug('Task manager already initialized');
            return;
        }

        try {
            await this.initializeComponents();
            const tasks = await this.storage.getTasksByPattern('*');
            
            const batchSize = 100;
            for (let i = 0; i < tasks.length; i += batchSize) {
                const batch = tasks.slice(i, i + batchSize);
                for (const task of batch) {
                    await this.cacheManager.indexTask(task);
                }
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

    async createTask(input: CreateTaskInput): Promise<TaskResponse<Task>> {
        try {
            if (!input.name) {
                throw createError(
                    ErrorCodes.VALIDATION_ERROR,
                    'Task name is required',
                    'createTask'
                );
            }

            const result = await this.operations.createTask(input);
            await this.cacheManager.indexTask(result);

            TaskManager.logger.info('Task created successfully', {
                taskId: result.path,
                type: result.type,
                parentPath: input.parentPath
            });

            this.eventHandler.emitTaskCreated(result.path, result, { input });

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
            TaskManager.logger.error('Failed to create task', {
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

    async updateTask(path: string, updates: UpdateTaskInput): Promise<TaskResponse<Task>> {
        try {
            const oldTask = await this.cacheManager.getTaskByPath(path);
            if (!oldTask) {
                throw createError(
                    ErrorCodes.TASK_NOT_FOUND,
                    `Task not found: ${path}`,
                    'updateTask'
                );
            }

            const result = await this.operations.updateTask(path, updates);
            await this.cacheManager.indexTask(result);

            TaskManager.logger.info('Task updated successfully', {
                taskId: result.path,
                updates,
                oldStatus: oldTask.status,
                newStatus: result.status
            });

            this.eventHandler.emitTaskUpdated(result.path, result, oldTask);

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
            TaskManager.logger.error('Failed to update task', {
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
                    'Failed to update task statuses',
                    'updateTaskStatuses',
                    undefined,
                    {
                        errors: result.errors,
                        updates
                    }
                );
            }

            const tasks = result.results as Task[];
            
            for (const task of tasks) {
                await this.cacheManager.indexTask(task);
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
            TaskManager.logger.error('Failed to update task statuses', {
                error,
                updates
            });
            throw error;
        }
    }

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
                    'Failed to update task dependencies',
                    'updateTaskDependencies',
                    undefined,
                    {
                        errors: result.errors,
                        updates
                    }
                );
            }

            const tasks = result.results as Task[];
            
            for (const task of tasks) {
                await this.cacheManager.indexTask(task);
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
            TaskManager.logger.error('Failed to update task dependencies', {
                error,
                updates
            });
            throw error;
        }
    }

    async getTaskByPath(path: string): Promise<Task | null> {
        try {
            return await this.cacheManager.getTaskByPath(path);
        } catch (error) {
            TaskManager.logger.error('Failed to get task by path', { error, path });
            throw error;
        }
    }

    async listTasks(pathPattern: string): Promise<Task[]> {
        try {
            return await this.cacheManager.getTasksByPattern(pathPattern);
        } catch (error) {
            TaskManager.logger.error('Failed to list tasks', { error, pathPattern });
            throw error;
        }
    }

    async getTasksByStatus(status: TaskStatus): Promise<Task[]> {
        try {
            return await this.cacheManager.getTasksByStatus(status);
        } catch (error) {
            TaskManager.logger.error('Failed to get tasks by status', { error, status });
            throw error;
        }
    }

    async getSubtasks(parentPath: string): Promise<Task[]> {
        try {
            return await this.cacheManager.getTasksByParent(parentPath);
        } catch (error) {
            TaskManager.logger.error('Failed to get subtasks', { error, parentPath });
            throw error;
        }
    }

    async deleteTask(path: string): Promise<TaskResponse<void>> {
        try {
            const task = await this.storage.getTask(path);
            if (task) {
                this.eventHandler.emitTaskDeleted(path, task);
                await this.cacheManager.unindexTask(task);
            }
            await this.operations.deleteTask(path);
            return {
                success: true,
                data: undefined,
                metadata: {
                    timestamp: Date.now(),
                    requestId: Math.random().toString(36).substring(7),
                    projectPath: path.split('/')[0],
                    affectedPaths: [path]
                }
            };
        } catch (error) {
            TaskManager.logger.error('Failed to delete task', {
                error,
                context: {
                    path,
                    operation: 'deleteTask'
                }
            });
            throw error;
        }
    }

    async clearAllTasks(confirm: boolean): Promise<void> {
        if (!confirm) {
            throw createError(
                ErrorCodes.INVALID_INPUT,
                'Must explicitly confirm task deletion',
                'clearAllTasks',
                'Set confirm parameter to true to proceed with clearing all tasks. This operation cannot be undone.',
                {
                    context: 'Clear all tasks',
                    required: 'explicit confirmation'
                }
            );
        }

        try {
            const tasks = await this.storage.getTasksByPattern('*');
            const taskCount = tasks.length;

            await this.storage.beginTransaction();

            try {
                await this.storage.clearAllTasks();
                await this.cacheManager.clearCaches();

                if (global.gc) {
                    global.gc();
                }

                await this.storage.commitTransaction();
                
                try {
                    await this.storage.vacuum();
                    await this.storage.analyze();
                    await this.storage.checkpoint();
                } catch (optimizeError) {
                    TaskManager.logger.warn('Failed to optimize database after clearing tasks', { 
                        error: optimizeError,
                        operation: 'clearAllTasks'
                    });
                }

                TaskManager.logger.info('Database and caches reset', {
                    tasksCleared: taskCount,
                    operation: 'clearAllTasks'
                });
            } catch (error) {
                await this.storage.rollbackTransaction();
                throw error;
            }
        } catch (error) {
            TaskManager.logger.error('Failed to clear tasks', {
                error,
                context: {
                    operation: 'clearAllTasks',
                    confirm
                }
            });
            throw error;
        }
    }

    async vacuumDatabase(analyze: boolean = true): Promise<void> {
        try {
            await this.storage.vacuum();
            if (analyze) {
                await this.storage.analyze();
            }
            await this.storage.checkpoint();
            TaskManager.logger.info('Database optimized', { analyzed: analyze });
        } catch (error) {
            TaskManager.logger.error('Failed to optimize database', { error });
            throw error;
        }
    }

    async repairRelationships(dryRun: boolean = false, pathPattern?: string): Promise<{ fixed: number, issues: string[] }> {
        try {
            const result = await this.storage.repairRelationships(dryRun);
            if (!dryRun) {
                await this.initialize();
            }
            TaskManager.logger.info('Relationship repair completed', { 
                dryRun,
                pathPattern,
                fixed: result.fixed,
                issueCount: result.issues.length
            });
            return result;
        } catch (error) {
            TaskManager.logger.error('Failed to repair relationships', { error });
            throw error;
        }
    }

    getMemoryStats(): { heapUsed: number; heapTotal: number; rss: number } {
        return this.cacheManager.getMemoryStats();
    }

    async cleanup(): Promise<void> {
        try {
            this.cacheManager.cleanup();

            try {
                if (this.statusBatchProcessor) {
                    await (this.statusBatchProcessor as any).cleanup?.();
                }
                if (this.dependencyBatchProcessor) {
                    await (this.dependencyBatchProcessor as any).cleanup?.();
                }
            } catch (batchError) {
                TaskManager.logger.warn('Error cleaning up batch processors', { error: batchError });
            }

            try {
                if (this.operations) {
                    await (this.operations as any).cleanup?.();
                }
            } catch (opsError) {
                TaskManager.logger.warn('Error cleaning up operations', { error: opsError });
            }

            if (this.storage) {
                await this.storage.close();
            }

            if (global.gc) {
                global.gc();
            }

            TaskManager.logger.info('Task manager cleanup completed');
        } catch (error) {
            TaskManager.logger.error('Failed to cleanup task manager', { error });
            throw error;
        }
    }

    async close(): Promise<void> {
        await this.cleanup();
    }

    async clearCaches(): Promise<void> {
        try {
            await this.cacheManager.clearCaches();
            TaskManager.logger.info('Caches cleared successfully');
        } catch (error) {
            TaskManager.logger.error('Failed to clear caches', { error });
            throw error;
        }
    }

    async bulkTaskOperations(operations: Array<{ type: 'create' | 'update' | 'delete', path: string, data?: CreateTaskInput | UpdateTaskInput }>): Promise<TaskResponse<Task[]>> {
        try {
            await this.storage.beginTransaction();
            const results: Task[] = [];
            const affectedPaths: string[] = [];

            try {
                for (const op of operations) {
                    switch (op.type) {
                        case 'create':
                            if (!op.data) {
                                throw createError(
                                    ErrorCodes.INVALID_INPUT,
                                    'Create operation requires data',
                                    'bulkTaskOperations'
                                );
                            }
                            const created = await this.createTask(op.data as CreateTaskInput);
                            results.push(created.data);
                            affectedPaths.push(created.data.path);
                            break;

                        case 'update':
                            if (!op.data) {
                                throw createError(
                                    ErrorCodes.INVALID_INPUT,
                                    'Update operation requires data',
                                    'bulkTaskOperations'
                                );
                            }
                            const updated = await this.updateTask(op.path, op.data as UpdateTaskInput);
                            results.push(updated.data);
                            affectedPaths.push(updated.data.path);
                            break;

                        case 'delete':
                            await this.deleteTask(op.path);
                            affectedPaths.push(op.path);
                            break;

                        default:
                            throw createError(
                                ErrorCodes.INVALID_INPUT,
                                `Unknown operation type: ${(op as any).type}`,
                                'bulkTaskOperations'
                            );
                    }
                }

                await this.storage.commitTransaction();

                return {
                    success: true,
                    data: results,
                    metadata: {
                        timestamp: Date.now(),
                        requestId: Math.random().toString(36).substring(7),
                        projectPath: results[0]?.projectPath || affectedPaths[0]?.split('/')[0] || 'unknown',
                        affectedPaths
                    }
                };
            } catch (error) {
                await this.storage.rollbackTransaction();
                throw error;
            }
        } catch (error) {
            TaskManager.logger.error('Failed to execute bulk operations', {
                error,
                operations
            });
            throw error;
        }
    }
}
