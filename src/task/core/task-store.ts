/**
 * Task Store
 * 
 * Manages the in-memory task collection and provides methods for:
 * - Task retrieval
 * - Task creation
 * - Task updates
 * - Task deletion
 * - Task querying
 */

import { Task, TaskStatus } from '../../types/task.js';
import { TaskError, ErrorCodes, createError } from '../../errors/index.js';
import { Logger } from '../../logging/index.js';
import { StorageManager } from '../../storage/index.js';

export class TaskStore {
    private tasks: Task[] = [];
    private logger: Logger;

    constructor(
        private storage: StorageManager
    ) {
        this.logger = Logger.getInstance().child({ component: 'TaskStore' });
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
            this.tasks = loadedTasks;
            this.logger.info('Task store initialized', {
                taskCount: this.tasks.length
            });
        } catch (error) {
            this.logger.error('Failed to initialize task store', error);
            throw createError(ErrorCodes.STORAGE_INIT_ERROR, error);
        }
    }

    /**
     * Gets a task by ID
     * 
     * @param taskId - Task ID to retrieve
     * @returns Task or null if not found
     */
    getTaskById(taskId: string): Task | null {
        return this.tasks.find(t => t.id === taskId) || null;
    }

    /**
     * Gets tasks by status
     * 
     * @param status - Status to filter by
     * @returns Tasks with the specified status
     */
    getTasksByStatus(status: TaskStatus): Task[] {
        return this.tasks.filter(t => t.status === status);
    }

    /**
     * Gets tasks by parent ID
     * 
     * @param parentId - Parent task ID
     * @returns Child tasks
     */
    getTasksByParent(parentId: string): Task[] {
        return this.tasks.filter(t => t.parentId === parentId);
    }

    /**
     * Gets root tasks (tasks without parents)
     * 
     * @returns Root tasks
     */
    getRootTasks(): Task[] {
        return this.tasks.filter(t => t.parentId.startsWith('ROOT-'));
    }

    /**
     * Adds a task to the store
     * 
     * @param task - Task to add
     * @throws {TaskError} If task already exists
     */
    async addTask(task: Task): Promise<void> {
        if (this.getTaskById(task.id)) {
            throw createError(
                ErrorCodes.TASK_DUPLICATE,
                { taskId: task.id }
            );
        }

        this.tasks.push(task);
        await this.persistTasks();
    }

    /**
     * Updates a task in the store
     * 
     * @param taskId - ID of task to update
     * @param updates - Partial task updates
     * @throws {TaskError} If task not found
     */
    async updateTask(taskId: string, updates: Partial<Task>): Promise<void> {
        const index = this.tasks.findIndex(t => t.id === taskId);
        if (index === -1) {
            throw createError(
                ErrorCodes.TASK_NOT_FOUND,
                { taskId }
            );
        }

        this.tasks[index] = {
            ...this.tasks[index],
            ...updates,
            metadata: {
                ...this.tasks[index].metadata,
                ...updates.metadata,
                updated: new Date().toISOString()
            }
        };

        await this.persistTasks();
    }

    /**
     * Removes a task from the store
     * 
     * @param taskId - ID of task to remove
     * @throws {TaskError} If task not found
     */
    async removeTask(taskId: string): Promise<void> {
        const index = this.tasks.findIndex(t => t.id === taskId);
        if (index === -1) {
            throw createError(
                ErrorCodes.TASK_NOT_FOUND,
                { taskId }
            );
        }

        this.tasks.splice(index, 1);
        await this.persistTasks();
    }

    /**
     * Gets all tasks in the store
     * 
     * @returns All tasks
     */
    getAllTasks(): Task[] {
        return [...this.tasks];
    }

    /**
     * Checks if a task exists
     * 
     * @param taskId - Task ID to check
     * @returns Whether the task exists
     */
    hasTask(taskId: string): boolean {
        return this.tasks.some(t => t.id === taskId);
    }

    /**
     * Gets tasks that depend on a given task
     * 
     * @param taskId - Task ID to check dependencies for
     * @returns Tasks that depend on the given task
     */
    getDependentTasks(taskId: string): Task[] {
        return this.tasks.filter(t => t.dependencies.includes(taskId));
    }

    /**
     * Gets tasks by session ID
     * 
     * @param sessionId - Session ID to filter by
     * @returns Tasks for the session
     */
    getTasksBySession(sessionId: string): Task[] {
        return this.tasks.filter(t => t.metadata.sessionId === sessionId);
    }

    /**
     * Persists tasks to storage
     * 
     * @throws {TaskError} If persistence fails
     */
    private async persistTasks(): Promise<void> {
        try {
            await this.storage.saveTasks(this.tasks);
            this.logger.debug('Tasks persisted successfully', {
                taskCount: this.tasks.length
            });
        } catch (error) {
            this.logger.error('Failed to persist tasks', error);
            throw createError(
                ErrorCodes.STORAGE_ERROR,
                error
            );
        }
    }

    /**
     * Gets the task count
     */
    get taskCount(): number {
        return this.tasks.length;
    }

    /**
     * Gets tasks with errors
     * 
     * @returns Tasks with error information
     */
    getTasksWithErrors(): Task[] {
        return this.tasks.filter(t => t.error !== undefined);
    }

    /**
     * Clears all tasks from the store
     * WARNING: This is destructive and should only be used for testing
     */
    async clear(): Promise<void> {
        this.tasks = [];
        await this.persistTasks();
    }
}
