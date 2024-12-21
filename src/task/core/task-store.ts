/**
 * Path-based task storage with caching and indexing
 */
import { Task, TaskStatus } from '../../types/task.js';
import { TaskStorage } from '../../types/storage.js';
import { Logger } from '../../logging/index.js';
import { TaskIndexManager } from './indexing/index-manager.js';
import { EnhancedCacheManager } from './cache/cache-manager.js';
import { DependencyValidator } from './dependency-validator.js';
import { ErrorCodes, createError } from '../../errors/index.js';

export class TaskStore {
    private readonly logger: Logger;
    private readonly indexManager: TaskIndexManager;
    private readonly cacheManager: EnhancedCacheManager;
    private readonly dependencyValidator: DependencyValidator;

    constructor(private readonly storage: TaskStorage) {
        this.logger = Logger.getInstance().child({ component: 'TaskStore' });
        this.indexManager = new TaskIndexManager();
        this.cacheManager = new EnhancedCacheManager({
            maxSize: 1000,
            baseTTL: 60000,
            maxTTL: 300000
        });
        this.dependencyValidator = new DependencyValidator();
    }

    /**
     * Gets a task by path, checking cache first
     */
    private async getTaskByPath(path: string): Promise<Task | null> {
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
     * Saves tasks with validation and indexing
     */
    async saveTasks(tasks: Task[]): Promise<void> {
        try {
            // Index tasks first so dependency validation can use them
            await Promise.all(tasks.map(async task => {
                await this.indexManager.indexTask(task);
                await this.cacheManager.set(task.path, task);
            }));

            // Validate dependencies
            for (const task of tasks) {
                await this.dependencyValidator.validateDependencies(
                    task.path,
                    task.dependencies,
                    this.getTaskByPath.bind(this)
                );
            }

            // Save to storage
            await this.storage.saveTasks(tasks);

            // Update dependency indexes
            await Promise.all(tasks.map(task => this.indexManager.indexDependencies(task)));

            this.logger.debug('Tasks saved successfully', {
                count: tasks.length,
                paths: tasks.map(t => t.path)
            });
        } catch (error) {
            // Rollback cache and indexes on error
            await Promise.all(tasks.map(async task => {
                await this.indexManager.unindexTask(task);
                await this.cacheManager.delete(task.path);
            }));

            this.logger.error('Failed to save tasks', { error, tasks });
            throw error;
        }
    }

    /**
     * Gets tasks by path pattern
     */
    async getTasksByPattern(pattern: string): Promise<Task[]> {
        try {
            // Check cache first
            const indexedTasks = await this.indexManager.getProjectTasks(pattern);
            const cachedTasks = await Promise.all(
                indexedTasks.map(task => this.cacheManager.get(task.path))
            );

            const validCachedTasks = cachedTasks.filter((task): task is Task => task !== null);

            if (validCachedTasks.length === indexedTasks.length) {
                return validCachedTasks;
            }

            // Load from storage
            const tasks = await this.storage.getTasksByPattern(pattern);

            // Update cache and indexes
            await Promise.all(tasks.map(async task => {
                await this.indexManager.indexTask(task);
                await this.cacheManager.set(task.path, task);
            }));

            return tasks;
        } catch (error) {
            this.logger.error('Failed to get tasks by pattern', { error, pattern });
            throw error;
        }
    }

    /**
     * Gets tasks by status
     */
    async getTasksByStatus(status: TaskStatus): Promise<Task[]> {
        try {
            // Check cache first
            const indexedTasks = await this.indexManager.getTasksByStatus(status, '');
            const cachedTasks = await Promise.all(
                indexedTasks.map(task => this.cacheManager.get(task.path))
            );

            const validCachedTasks = cachedTasks.filter((task): task is Task => task !== null);

            if (validCachedTasks.length === indexedTasks.length) {
                return validCachedTasks;
            }

            // Load from storage
            const tasks = await this.storage.getTasksByStatus(status);

            // Update cache and indexes
            await Promise.all(tasks.map(async task => {
                await this.indexManager.indexTask(task);
                await this.cacheManager.set(task.path, task);
            }));

            return tasks;
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
            // Check cache first
            const indexedTasks = await this.indexManager.getTasksByParent(parentPath);
            const cachedTasks = await Promise.all(
                indexedTasks.map(task => this.cacheManager.get(task.path))
            );

            const validCachedTasks = cachedTasks.filter((task): task is Task => task !== null);

            if (validCachedTasks.length === indexedTasks.length) {
                return validCachedTasks;
            }

            // Load from storage
            const tasks = await this.storage.getSubtasks(parentPath);

            // Update cache and indexes
            await Promise.all(tasks.map(async task => {
                await this.indexManager.indexTask(task);
                await this.cacheManager.set(task.path, task);
            }));

            return tasks;
        } catch (error) {
            this.logger.error('Failed to get subtasks', { error, parentPath });
            throw error;
        }
    }

    /**
     * Deletes a task and its subtasks
     */
    async deleteTask(path: string): Promise<void> {
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
            const allPaths = [path, ...subtasks.map(t => t.path)];

            // Delete from storage
            await this.storage.deleteTasks(allPaths);

            // Update cache and indexes
            await Promise.all(allPaths.map(async taskPath => {
                await this.indexManager.unindexTask(task);
                await this.cacheManager.delete(taskPath);
            }));

            this.logger.debug('Task and subtasks deleted', {
                path,
                subtaskCount: subtasks.length
            });
        } catch (error) {
            this.logger.error('Failed to delete task', { error, path });
            throw error;
        }
    }

    /**
     * Clears cache and indexes
     */
    async clearCache(): Promise<void> {
        await Promise.all([
            this.indexManager.clear(),
            this.cacheManager.clear()
        ]);
        this.logger.debug('Cache cleared');
    }
}
