/**
 * Task Manager Module
 * 
 * Main integration point for task management functionality.
 * Coordinates between task store, dependency validation, and status management.
 */

import { v4 as uuidv4 } from 'uuid';
import {
    Task,
    CreateTaskInput,
    UpdateTaskInput,
    TaskResponse,
    TaskTypes,
    TaskStatuses,
    TaskStatus,
    BulkCreateTaskInput,
    BulkUpdateTasksInput
} from './types/task.js';
import { StorageManager } from './storage/index.js';
import { Logger } from './logging/index.js';
import { validateCreateTask, validateUpdateTask } from './validation/task.js';
import { TaskError, ErrorCodes, createError } from './errors/index.js';
import { TaskStore, DependencyValidator, StatusManager } from './task/core/index.js';

/**
 * Task Manager class responsible for coordinating task operations
 */
export class TaskManager {
    private logger: Logger;
    private taskStore: TaskStore;
    private dependencyValidator: DependencyValidator;
    private statusManager: StatusManager;
    private currentSessionId: string;

    constructor(storage: StorageManager) {
        this.logger = Logger.getInstance().child({ component: 'TaskManager' });
        this.taskStore = new TaskStore(storage);
        this.dependencyValidator = new DependencyValidator();
        this.statusManager = new StatusManager();
        this.currentSessionId = storage.getSessionId();
    }

    /**
     * Initializes the task manager
     */
    async initialize(): Promise<void> {
        await this.taskStore.initialize();
    }

    /**
     * Creates a new task
     * 
     * @param parentId - ID of the parent task (null for root tasks)
     * @param input - Task creation input data
     * @param newSession - Whether to create a new session
     * @returns Promise resolving to the created task
     * @throws {TaskError} If task creation fails
     */
    async createTask(parentId: string | null, input: CreateTaskInput, newSession: boolean = false): Promise<TaskResponse<Task>> {
        try {
            // Validate input data
            const validatedInput = validateCreateTask(input);

            // Generate new session ID if requested
            if (newSession) {
                this.currentSessionId = uuidv4();
            }

            // Check parent task if provided
            if (parentId) {
                const parentTask = this.taskStore.getTaskById(parentId);
                if (!parentTask) {
                    throw createError(ErrorCodes.TASK_NOT_FOUND, { parentId });
                }
                if (parentTask.type !== TaskTypes.GROUP) {
                    throw createError(ErrorCodes.TASK_INVALID_TYPE, { parentId });
                }
            }

            // Generate task ID and metadata
            const taskId = uuidv4();
            const now = new Date().toISOString();
            const metadata = {
                created: now,
                updated: now,
                sessionId: this.currentSessionId,
                ...input.metadata
            };

            // Create task object
            const task: Task = {
                id: taskId,
                name: input.name,
                description: input.description,
                notes: input.notes || [],
                reasoning: input.reasoning,
                type: input.type || TaskTypes.TASK,
                status: TaskStatuses.PENDING,
                dependencies: input.dependencies || [],
                subtasks: [],
                metadata,
                parentId: parentId || `ROOT-${this.currentSessionId}`
            };

            // Validate dependencies if any
            if (task.dependencies.length > 0) {
                await this.dependencyValidator.validateDependencies(
                    task,
                    id => this.taskStore.getTaskById(id)
                );
            }

            // Add task to store
            await this.taskStore.addTask(task);

            // Create subtasks if provided
            if (input.subtasks && input.subtasks.length > 0) {
                for (const subtaskInput of input.subtasks) {
                    await this.createTask(taskId, subtaskInput);
                }
            }

            this.logger.info('Task created successfully', { taskId, parentId });

            return {
                success: true,
                data: task,
                metadata: {
                    timestamp: new Date().toISOString(),
                    requestId: uuidv4(),
                    sessionId: this.currentSessionId
                }
            };
        } catch (error) {
            this.logger.error('Failed to create task', error);
            throw error;
        }
    }

    /**
     * Updates an existing task
     */
    async updateTask(taskId: string, updates: UpdateTaskInput): Promise<TaskResponse<Task>> {
        try {
            // Validate update data
            const validatedUpdates = validateUpdateTask(updates);

            // Get existing task
            const task = this.taskStore.getTaskById(taskId);
            if (!task) {
                throw createError(ErrorCodes.TASK_NOT_FOUND, { taskId });
            }

            // Check status transition if status is being updated
            if (updates.status) {
                await this.statusManager.validateAndProcessStatusChange(
                    task,
                    updates.status,
                    id => this.taskStore.getTaskById(id),
                    async (id, statusUpdate) => {
                        const taskToUpdate = this.taskStore.getTaskById(id);
                        if (taskToUpdate) {
                            await this.taskStore.updateTask(id, statusUpdate);
                        }
                    }
                );
            }

            // Check dependencies if being updated
            if (updates.dependencies) {
                await this.dependencyValidator.validateDependencies(
                    { ...task, dependencies: updates.dependencies },
                    id => this.taskStore.getTaskById(id)
                );
            }

            // Apply updates
            await this.taskStore.updateTask(taskId, {
                ...validatedUpdates,
                metadata: {
                    ...task.metadata,
                    ...updates.metadata,
                    updated: new Date().toISOString()
                }
            });

            const updatedTask = this.taskStore.getTaskById(taskId)!;

            return {
                success: true,
                data: updatedTask,
                metadata: {
                    timestamp: new Date().toISOString(),
                    requestId: uuidv4(),
                    sessionId: updatedTask.metadata.sessionId
                }
            };
        } catch (error) {
            this.logger.error('Failed to update task', error);
            throw error;
        }
    }

    /**
     * Gets a task by ID
     */
    async getTask(taskId: string): Promise<TaskResponse<Task>> {
        try {
            const task = this.taskStore.getTaskById(taskId);
            if (!task) {
                throw createError(ErrorCodes.TASK_NOT_FOUND, { taskId });
            }

            return {
                success: true,
                data: task,
                metadata: {
                    timestamp: new Date().toISOString(),
                    requestId: uuidv4(),
                    sessionId: task.metadata.sessionId
                }
            };
        } catch (error) {
            this.logger.error('Failed to get task', error);
            throw error;
        }
    }

    /**
     * Gets tasks by status
     */
    async getTasksByStatus(status: TaskStatus): Promise<TaskResponse<Task[]>> {
        try {
            const tasks = this.taskStore.getTasksByStatus(status);
            return {
                success: true,
                data: tasks,
                metadata: {
                    timestamp: new Date().toISOString(),
                    requestId: uuidv4(),
                    sessionId: this.currentSessionId
                }
            };
        } catch (error) {
            this.logger.error('Failed to get tasks by status', error);
            throw error;
        }
    }

    /**
     * Gets subtasks of a task
     */
    async getSubtasks(taskId: string): Promise<TaskResponse<Task[]>> {
        try {
            const task = this.taskStore.getTaskById(taskId);
            if (!task) {
                throw createError(ErrorCodes.TASK_NOT_FOUND, { taskId });
            }

            const subtasks = task.subtasks
                .map(id => this.taskStore.getTaskById(id))
                .filter((t): t is Task => t !== null);

            return {
                success: true,
                data: subtasks,
                metadata: {
                    timestamp: new Date().toISOString(),
                    requestId: uuidv4(),
                    sessionId: task.metadata.sessionId
                }
            };
        } catch (error) {
            this.logger.error('Failed to get subtasks', error);
            throw error;
        }
    }

    /**
     * Gets the complete task tree
     */
    async getTaskTree(): Promise<TaskResponse<Task[]>> {
        try {
            const rootTasks = this.taskStore.getRootTasks();
            return {
                success: true,
                data: rootTasks,
                metadata: {
                    timestamp: new Date().toISOString(),
                    requestId: uuidv4(),
                    sessionId: this.currentSessionId
                }
            };
        } catch (error) {
            this.logger.error('Failed to get task tree', error);
            throw error;
        }
    }

    /**
     * Deletes a task and its subtasks
     */
    async deleteTask(taskId: string): Promise<TaskResponse<void>> {
        try {
            const task = this.taskStore.getTaskById(taskId);
            if (!task) {
                throw createError(ErrorCodes.TASK_NOT_FOUND, { taskId });
            }

            // Delete subtasks recursively
            for (const subtaskId of task.subtasks) {
                await this.deleteTask(subtaskId);
            }

            await this.taskStore.removeTask(taskId);

            return {
                success: true,
                metadata: {
                    timestamp: new Date().toISOString(),
                    requestId: uuidv4(),
                    sessionId: task.metadata.sessionId
                }
            };
        } catch (error) {
            this.logger.error('Failed to delete task', error);
            throw error;
        }
    }

    /**
     * Creates multiple tasks in bulk
     */
    async bulkCreateTasks(input: BulkCreateTaskInput): Promise<TaskResponse<Task[]>> {
        try {
            const createdTasks = await Promise.all(
                input.tasks.map(taskInput => this.createTask(input.parentId, taskInput))
            );

            return {
                success: true,
                data: createdTasks.map(response => response.data!),
                metadata: {
                    timestamp: new Date().toISOString(),
                    requestId: uuidv4(),
                    sessionId: this.currentSessionId,
                    affectedTasks: createdTasks.map(response => response.data!.id)
                }
            };
        } catch (error) {
            this.logger.error('Failed to create tasks in bulk', error);
            throw error;
        }
    }

    /**
     * Updates multiple tasks in bulk
     */
    async bulkUpdateTasks(input: BulkUpdateTasksInput): Promise<TaskResponse<Task[]>> {
        try {
            const updatedTasks = await Promise.all(
                input.updates.map(({ taskId, updates }) => this.updateTask(taskId, updates))
            );

            return {
                success: true,
                data: updatedTasks.map(response => response.data!),
                metadata: {
                    timestamp: new Date().toISOString(),
                    requestId: uuidv4(),
                    sessionId: this.currentSessionId,
                    affectedTasks: updatedTasks.map(response => response.data!.id)
                }
            };
        } catch (error) {
            this.logger.error('Failed to update tasks in bulk', error);
            throw error;
        }
    }
}
