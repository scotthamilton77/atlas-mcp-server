/**
 * Task Store
 * 
 * Manages the in-memory task collection with transaction support and provides methods for:
 * - Task retrieval with adaptive caching
 * - Atomic task operations with batching
 * - Bulk operations with optimized rollback
 * - Task querying with optimized indexes
 * - Dependency management with parallel processing
 */

import { Task, TaskStatus, TaskStatuses } from '../../types/task.js';
import { Logger } from '../../logging/index.js';
import { StorageManager } from '../../storage/index.js';
import { DependencyValidator } from './dependency-validator.js';
import { StatusManager } from './status-manager.js';
import { AdaptiveCacheManager } from './cache/cache-manager.js';
import { TaskIndexManager } from './indexing/index-manager.js';
import { TaskTransactionManager } from './transactions/transaction-manager.js';
import { TaskBatchProcessor } from './batch/batch-processor.js';
import { ErrorCodes, createError } from '../../errors/index.js';

export class TaskStore {
    private logger: Logger;
    private cacheManager: AdaptiveCacheManager;
    private indexManager: TaskIndexManager;
    private transactionManager: TaskTransactionManager;
    private batchProcessor: TaskBatchProcessor;
    private statusManager: StatusManager;
    private dependencyValidator: DependencyValidator;

    constructor(
        private storage: StorageManager
    ) {
        this.logger = Logger.getInstance().child({ component: 'TaskStore' });
        this.cacheManager = new AdaptiveCacheManager();
        this.indexManager = new TaskIndexManager();
        this.transactionManager = new TaskTransactionManager();
        this.batchProcessor = new TaskBatchProcessor();
        this.statusManager = new StatusManager();
        this.dependencyValidator = new DependencyValidator();
    }

    /**
     * Gets the current session ID
     */
    getSessionId(): string {
        return this.storage.getSessionId();
    }

    /**
     * Initializes the task store
     */
    async initialize(): Promise<void> {
        try {
            const loadedTasks = await this.storage.loadTasks();
            
            await this.batchProcessor.processInBatches(
                loadedTasks,
                50, // batch size
                async (task) => {
                    this.indexManager.indexTask(task);
                    this.cacheManager.set(task.id, task);
                    await this.indexManager.indexDependencies(task);
                }
            );

            this.logger.info('Task store initialized', {
                taskCount: loadedTasks.length
            });
        } catch (error) {
            this.logger.error('Failed to initialize task store', error);
            
            try {
                const recoveredTasks = await this.storage.recoverFromBackup();
                await this.batchProcessor.processInBatches(
                    recoveredTasks,
                    50,
                    async (task) => {
                        this.indexManager.indexTask(task);
                        this.cacheManager.set(task.id, task);
                        await this.indexManager.indexDependencies(task);
                    }
                );
                
                this.logger.info('Recovered from backup', {
                    taskCount: recoveredTasks.length
                });
            } catch (recoveryError) {
                throw createError(ErrorCodes.STORAGE_INIT, error);
            }
        }
    }

    /**
     * Gets a task by ID
     */
    getTaskById(taskId: string): Task | null {
        // Try cache first
        const cachedTask = this.cacheManager.get(taskId);
        if (cachedTask) {
            return cachedTask;
        }

        // Fall back to index
        const task = this.indexManager.getTaskById(taskId);
        if (task) {
            this.cacheManager.set(taskId, task);
        }
        return task;
    }

    /**
     * Gets tasks by status
     */
    getTasksByStatus(status: TaskStatus): Task[] {
        return this.indexManager.getTasksByStatus(status);
    }

    /**
     * Gets tasks by parent ID
     */
    getTasksByParent(parentId: string): Task[] {
        return this.indexManager.getTasksByParent(parentId);
    }

    /**
     * Gets root tasks
     */
    getRootTasks(): Task[] {
        return this.indexManager.getRootTasks();
    }

    /**
     * Gets tasks that depend on a given task
     */
    getDependentTasks(taskId: string): Task[] {
        return this.indexManager.getDependentTasks(taskId);
    }

    /**
     * Adds a task
     */
    async addTask(task: Task): Promise<void> {
        const transactionId = this.transactionManager.startTransaction();
        try {
            if (this.indexManager.getTaskById(task.id)) {
                throw createError(
                    ErrorCodes.TASK_DUPLICATE,
                    { taskId: task.id }
                );
            }

            // Validate dependencies
            await this.dependencyValidator.validateDependencies(task, this.getTaskById.bind(this));

            // Check if task should be blocked
            const shouldBlock = this.statusManager.isBlocked(task, this.getTaskById.bind(this));
            const taskToAdd = shouldBlock ? { ...task, status: TaskStatuses.BLOCKED } : task;

            // Add to indexes and cache
            this.indexManager.indexTask(taskToAdd);
            await this.indexManager.indexDependencies(taskToAdd);
            this.cacheManager.set(taskToAdd.id, taskToAdd);

            // Record operation
            this.transactionManager.addOperation(transactionId, {
                type: 'add',
                task: taskToAdd
            });

            // Update parent if needed
            if (taskToAdd.parentId && !taskToAdd.parentId.startsWith('ROOT-')) {
                const parent = this.getTaskById(taskToAdd.parentId);
                if (parent) {
                    const updatedParent = {
                        ...parent,
                        subtasks: [...parent.subtasks, taskToAdd.id]
                    };
                    await this.updateTask(parent.id, updatedParent);
                }
            }

            // Persist changes
            await this.storage.saveTasks(Array.from(this.indexManager.getAllTasks()));
            await this.transactionManager.commitTransaction(transactionId);

        } catch (error) {
            await this.transactionManager.rollbackTransaction(transactionId);
            throw error;
        }
    }

    /**
     * Updates a task
     */
    async updateTask(taskId: string, updates: Partial<Task>): Promise<void> {
        const transactionId = this.transactionManager.startTransaction();
        try {
            const existingTask = this.getTaskById(taskId);
            if (!existingTask) {
                throw createError(
                    ErrorCodes.TASK_NOT_FOUND,
                    { taskId }
                );
            }

            // Handle status updates
            if (updates.status && updates.status !== existingTask.status) {
                await this.statusManager.validateAndProcessStatusChange(
                    existingTask,
                    updates.status,
                    this.getTaskById.bind(this),
                    async (id, statusUpdate) => {
                        const task = this.getTaskById(id);
                        if (task) {
                            const updated = { ...task, ...statusUpdate };
                            this.indexManager.unindexTask(task);
                            this.indexManager.indexTask(updated);
                            await this.indexManager.indexDependencies(updated);
                            this.cacheManager.set(updated.id, updated);
                            this.transactionManager.addOperation(transactionId, {
                                type: 'update',
                                task: updated,
                                previousState: task
                            });
                        }
                    }
                );
            }

            const updatedTask = {
                ...existingTask,
                ...updates,
                metadata: {
                    ...existingTask.metadata,
                    ...updates.metadata,
                    updated: new Date().toISOString()
                }
            };

            // Update indexes and cache
            this.indexManager.unindexTask(existingTask);
            this.indexManager.indexTask(updatedTask);
            await this.indexManager.indexDependencies(updatedTask);
            this.cacheManager.set(updatedTask.id, updatedTask);

            // Record operation
            this.transactionManager.addOperation(transactionId, {
                type: 'update',
                task: updatedTask,
                previousState: existingTask
            });

            // Persist changes
            await this.storage.saveTasks(Array.from(this.indexManager.getAllTasks()));
            await this.transactionManager.commitTransaction(transactionId);

        } catch (error) {
            await this.transactionManager.rollbackTransaction(transactionId);
            throw error;
        }
    }

    /**
     * Removes a task
     */
    async removeTask(taskId: string): Promise<void> {
        const transactionId = this.transactionManager.startTransaction();
        try {
            const task = this.getTaskById(taskId);
            if (!task) {
                throw createError(
                    ErrorCodes.TASK_NOT_FOUND,
                    { taskId }
                );
            }

            // Validate task deletion
            await this.dependencyValidator.validateTaskDeletion(
                taskId,
                this.getTaskById.bind(this),
                this.getDependentTasks.bind(this)
            );

            // Update parent if needed
            if (task.parentId && !task.parentId.startsWith('ROOT-')) {
                const parent = this.getTaskById(task.parentId);
                if (parent) {
                    const updatedParent = {
                        ...parent,
                        subtasks: parent.subtasks.filter(id => id !== taskId)
                    };
                    await this.updateTask(parent.id, updatedParent);
                }
            }

            // Get dependent tasks before removing the task and its indexes
            const dependentTasks = this.getDependentTasks(taskId);

            // Remove task from indexes and cache
            this.indexManager.unindexTask(task);
            await this.indexManager.unindexDependencies(task);
            this.cacheManager.delete(taskId);

            // Record task removal operation
            this.transactionManager.addOperation(transactionId, {
                type: 'remove',
                task
            });

            // Update dependent tasks
            for (const depTask of dependentTasks) {
                const updatedTask = {
                    ...depTask,
                    status: TaskStatuses.BLOCKED,
                    dependencies: depTask.dependencies.filter(id => id !== taskId),
                    metadata: {
                        ...depTask.metadata,
                        updated: new Date().toISOString()
                    }
                };

                // Update indexes and cache
                this.indexManager.unindexTask(depTask);
                this.indexManager.indexTask(updatedTask);
                await this.indexManager.indexDependencies(updatedTask);
                this.cacheManager.set(updatedTask.id, updatedTask);

                // Record update operation
                this.transactionManager.addOperation(transactionId, {
                    type: 'update',
                    task: updatedTask,
                    previousState: depTask
                });
            }

            // Verify updates
            const verifyDependentTasks = dependentTasks.map(t => this.getTaskById(t.id));
            if (verifyDependentTasks.some(t => t?.dependencies.includes(taskId))) {
                await this.transactionManager.rollbackTransaction(transactionId);
                throw new Error('Failed to clean up task dependencies');
            }

            // Remove subtasks
            await this.batchProcessor.processInBatches(
                task.subtasks,
                50,
                async (subtaskId) => {
                    const subtask = this.getTaskById(subtaskId);
                    if (subtask) {
                        await this.removeTask(subtaskId);
                    }
                }
            );

            // Persist changes
            await this.storage.saveTasks(Array.from(this.indexManager.getAllTasks()));
            await this.transactionManager.commitTransaction(transactionId);

        } catch (error) {
            await this.transactionManager.rollbackTransaction(transactionId);
            throw error;
        }
    }

    /**
     * Gets all tasks
     */
    getAllTasks(): Task[] {
        return this.indexManager.getAllTasks();
    }

    /**
     * Gets tasks by session
     */
    getTasksBySession(sessionId: string): Task[] {
        return this.indexManager.getTasksBySession(sessionId);
    }

    /**
     * Gets the task count
     */
    get taskCount(): number {
        return this.indexManager.getAllTasks().length;
    }

    /**
     * Gets tasks with errors
     */
    getTasksWithErrors(): Task[] {
        return this.indexManager.getAllTasks().filter(t => t.error !== undefined);
    }

    /**
     * Clears all tasks
     */
    async clear(): Promise<void> {
        const transactionId = this.transactionManager.startTransaction();
        try {
            // Clear all managers
            this.indexManager.clear();
            this.cacheManager.clear();
            
            // Record operation for all tasks
            const allTasks = this.indexManager.getAllTasks();
            for (const task of allTasks) {
                this.transactionManager.addOperation(transactionId, {
                    type: 'remove',
                    task
                });
            }

            // Persist changes
            await this.storage.saveTasks([]);
            await this.transactionManager.commitTransaction(transactionId);

        } catch (error) {
            await this.transactionManager.rollbackTransaction(transactionId);
            throw error;
        }
    }

    /**
     * Gets store statistics
     */
    getStats(): {
        tasks: {
            total: number;
            byStatus: Record<TaskStatus, number>;
            withErrors: number;
        };
        cache: {
            size: number;
            hitRate: number;
        };
        transactions: {
            active: number;
            totalOperations: number;
        };
    } {
        const indexStats = this.indexManager.getStats();
        const cacheStats = this.cacheManager.getStats();
        const transactionStats = this.transactionManager.getStats();

        return {
            tasks: {
                total: indexStats.totalTasks,
                byStatus: indexStats.statusCounts,
                withErrors: this.getTasksWithErrors().length
            },
            cache: {
                size: cacheStats.size,
                hitRate: cacheStats.hitRate
            },
            transactions: {
                active: transactionStats.activeTransactions,
                totalOperations: transactionStats.totalOperations
            }
        };
    }
}
