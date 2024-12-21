/**
 * Path-based task storage with caching, indexing, and transaction support
 */
import { Task, TaskStatus, validateTaskPath, isValidTaskHierarchy } from '../../types/task.js';
import { TaskStorage } from '../../types/storage.js';
import { Logger } from '../../logging/index.js';
import { TaskIndexManager } from './indexing/index-manager.js';
import { EnhancedCacheManager } from './cache/cache-manager.js';
import { DependencyValidator } from './dependency-validator.js';
import { ErrorCodes, createError } from '../../errors/index.js';
import { TransactionManager } from './transactions/transaction-manager.js';

const BATCH_SIZE = 50; // Maximum number of tasks to process in parallel

export class TaskStore {
    private readonly logger: Logger;
    private readonly indexManager: TaskIndexManager;
    private readonly cacheManager: EnhancedCacheManager;
    private readonly dependencyValidator: DependencyValidator;
    private readonly transactionManager: TransactionManager;

    constructor(private readonly storage: TaskStorage) {
        this.logger = Logger.getInstance().child({ component: 'TaskStore' });
        this.indexManager = new TaskIndexManager();
        this.cacheManager = new EnhancedCacheManager({
            maxSize: 1000,
            baseTTL: 60000,
            maxTTL: 300000
        });
        this.dependencyValidator = new DependencyValidator();
        this.transactionManager = new TransactionManager(storage);
    }

    /**
     * Processes tasks in batches
     */
    private async processBatch<T>(
        items: T[],
        processor: (item: T) => Promise<void>
    ): Promise<void> {
        for (let i = 0; i < items.length; i += BATCH_SIZE) {
            const batch = items.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(processor));
        }
    }

    /**
     * Gets a task by path, checking cache first
     */
    private async getTaskByPath(path: string): Promise<Task | null> {
        if (!validateTaskPath(path)) {
            throw createError(
                ErrorCodes.TASK_INVALID_PATH,
                `Invalid task path: ${path}`
            );
        }

        // Check cache first
        const cachedTask = await this.cacheManager.get(path);
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
     * Updates dependent task statuses
     */
    private async updateDependentStatuses(task: Task): Promise<void> {
        const dependentTasks = await this.indexManager.getDependentTasks(task.path);
        
        for (const depTask of dependentTasks) {
            const taskPath = depTask.path;
            const updatedTask = await this.getTaskByPath(taskPath);
            if (!updatedTask) continue;

            // If a dependency fails or is blocked, block the dependent task
            if (task.status === TaskStatus.FAILED || task.status === TaskStatus.BLOCKED) {
                updatedTask.status = TaskStatus.BLOCKED;
                await this.saveTasks([updatedTask]);
            }
            // If all dependencies are complete, unblock the dependent task
            else if (task.status === TaskStatus.COMPLETED) {
                const allDepsCompleted = await this.checkAllDependenciesCompleted(updatedTask);
                if (allDepsCompleted) {
                    updatedTask.status = TaskStatus.PENDING;
                    await this.saveTasks([updatedTask]);
                }
            }
        }
    }

    /**
     * Checks if all dependencies are completed
     */
    private async checkAllDependenciesCompleted(task: Task): Promise<boolean> {
        for (const depPath of task.dependencies) {
            const depTask = await this.getTaskByPath(depPath);
            if (!depTask || depTask.status !== TaskStatus.COMPLETED) {
                return false;
            }
        }
        return true;
    }

    /**
     * Validates and updates parent-child relationships
     */
    private async validateAndUpdateHierarchy(task: Task): Promise<void> {
        if (task.parentPath) {
            const parent = await this.getTaskByPath(task.parentPath);
            if (!parent) {
                throw createError(
                    ErrorCodes.TASK_INVALID_PARENT,
                    `Parent task not found: ${task.parentPath}`
                );
            }

            // Validate task type hierarchy
            if (!isValidTaskHierarchy(parent.type, task.type)) {
                throw createError(
                    ErrorCodes.TASK_PARENT_TYPE,
                    `Invalid parent-child relationship: ${parent.type} cannot contain ${task.type}`
                );
            }

            // Update parent's subtasks if needed
            if (!parent.subtasks.includes(task.path)) {
                parent.subtasks.push(task.path);
                await this.storage.saveTask(parent);
                await this.indexManager.indexTask(parent);
                await this.cacheManager.set(parent.path, parent);
            }
        }
    }

    /**
     * Saves tasks with validation, indexing, and transaction support
     */
    async saveTasks(tasks: Task[]): Promise<void> {
        // Validate paths and collect parent updates
        for (const task of tasks) {
            if (!validateTaskPath(task.path)) {
                throw createError(
                    ErrorCodes.TASK_INVALID_PATH,
                    `Invalid task path: ${task.path}`
                );
            }
        }

        const transaction = await this.transactionManager.begin();

        try {
            // Process each task
            for (const task of tasks) {
                // Validate and update parent-child relationships
                await this.validateAndUpdateHierarchy(task);

                // Index the task
                await this.indexManager.indexTask(task);
                await this.cacheManager.set(task.path, task);

                // Validate dependencies
                await this.dependencyValidator.validateDependencies(
                    task.path,
                    task.dependencies,
                    this.getTaskByPath.bind(this)
                );
            }

            // Save all tasks
            await this.storage.saveTasks(tasks);

            // Propagate status changes
            await this.processBatch(tasks, async task => {
                await this.updateDependentStatuses(task);
            });

            await this.transactionManager.commit(transaction);

            this.logger.debug('Tasks saved successfully', {
                count: tasks.length,
                paths: tasks.map(t => t.path)
            });
        } catch (error) {
            // Rollback transaction
            await this.transactionManager.rollback(transaction);

            // Rollback cache and indexes
            await this.processBatch(tasks, async task => {
                await this.indexManager.unindexTask(task);
                await this.cacheManager.delete(task.path);
            });

            this.logger.error('Failed to save tasks', { error, tasks });
            throw error;
        }
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
                const cachedTask = await this.cacheManager.get(indexedTask.path);
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
            throw error;
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
                const cachedTask = await this.cacheManager.get(indexedTask.path);
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
            throw error;
        }
    }

    /**
     * Gets subtasks of a task with efficient caching
     */
    async getSubtasks(parentPath: string): Promise<Task[]> {
        if (!validateTaskPath(parentPath)) {
            throw createError(
                ErrorCodes.TASK_INVALID_PATH,
                `Invalid parent path: ${parentPath}`
            );
        }

        try {
            // Get indexed tasks first
            const indexedTasks = await this.indexManager.getTasksByParent(parentPath);
            
            // Batch process cache checks
            const tasks: Task[] = [];
            const missingPaths: string[] = [];

            await this.processBatch(indexedTasks, async indexedTask => {
                const cachedTask = await this.cacheManager.get(indexedTask.path);
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
            throw error;
        }
    }

    /**
     * Deletes a task and its subtasks with transaction support
     */
    async deleteTask(path: string): Promise<void> {
        if (!validateTaskPath(path)) {
            throw createError(
                ErrorCodes.TASK_INVALID_PATH,
                `Invalid task path: ${path}`
            );
        }

        const transaction = await this.transactionManager.begin();

        try {
            // Get task and subtasks
            const task = await this.storage.getTask(path);
            if (!task) {
                throw createError(
                    ErrorCodes.TASK_NOT_FOUND,
                    `Task not found: ${path}`
                );
            }

            const subtasks = await this.storage.getSubtasks(path);
            const allTasks = [task, ...subtasks];
            const allPaths = allTasks.map(t => t.path);

            // Add delete operation to transaction with both paths and tasks
            transaction.operations.push({
                type: 'delete',
                paths: allPaths,
                tasks: allTasks
            });

            // Delete from storage
            await this.storage.deleteTasks(allPaths);

            // Update cache and indexes
            await this.processBatch(allTasks, async task => {
                await this.indexManager.unindexTask(task);
                await this.cacheManager.delete(task.path);
            });

            // Update dependent tasks
            await this.processBatch(allTasks, async task => {
                await this.updateDependentStatuses(task);
            });

            await this.transactionManager.commit(transaction);

            this.logger.debug('Task and subtasks deleted', {
                path,
                subtaskCount: subtasks.length
            });
        } catch (error) {
            await this.transactionManager.rollback(transaction);
            this.logger.error('Failed to delete task', { error, path });
            throw error;
        }
    }

    /**
     * Clears cache and indexes with transaction support
     */
    async clearCache(): Promise<void> {
        const transaction = await this.transactionManager.begin();

        try {
            await Promise.all([
                this.indexManager.clear(),
                this.cacheManager.clear()
            ]);

            await this.transactionManager.commit(transaction);
            this.logger.debug('Cache cleared');
        } catch (error) {
            await this.transactionManager.rollback(transaction);
            this.logger.error('Failed to clear cache', { error });
            throw error;
        }
    }
}
