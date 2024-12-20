/**
 * Task Manager Module
 * 
 * Main integration point for task management functionality.
 * Coordinates between task store, dependency validation, and status management.
 */

import { generateShortId } from './utils/id-generator.js';
import {
    Task,
    CreateTaskInput,
    UpdateTaskInput,
    TaskResponse,
    TaskType,
    TaskStatus,
    BulkCreateTaskInput,
    BulkUpdateTasksInput,
    TaskWithSubtasks,
    TaskMetadata
} from './types/task.js';
import { UnifiedStorageManager } from './storage/unified-storage.js';
import { Logger } from './logging/index.js';
import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { 
    TaskError, 
    ErrorCodes, 
    createError, 
    BaseError, 
    ValidationError,
    wrapError,
    getUserErrorMessage 
} from './errors/index.js';
import { DefaultSessionManager } from './task/core/session/session-manager.js';
import { TaskStore, DependencyValidator, StatusManager } from './task/core/index.js';
import { 
    validateCreateTask, 
    validateUpdateTask, 
    validateBulkCreateTask,
    validateBulkUpdateTask,
    safeValidateCreateTask
} from './validation/task.js';

/**
 * Task Manager class responsible for coordinating task operations
 */
export class TaskManager {
    private logger: Logger;
    private taskStore: TaskStore;
    private dependencyValidator: DependencyValidator;
    private statusManager: StatusManager;

    constructor(
        private storage: UnifiedStorageManager,
        private sessionManager?: DefaultSessionManager
    ) {
        this.logger = Logger.getInstance().child({ component: 'TaskManager' });
        this.taskStore = new TaskStore(storage);
        this.dependencyValidator = new DependencyValidator();
        this.statusManager = new StatusManager();
    }

    /**
     * Gets the current session ID from the session manager or generates a new one
     */
    private async getCurrentSessionId(): Promise<string> {
        if (this.sessionManager) {
            const activeSession = await this.sessionManager.getActiveSession();
            if (activeSession) {
                return activeSession.id;
            }
        }
        return generateShortId();
    }

    /**
     * Initializes the task manager
     */
    async initialize(): Promise<void> {
        try {
            // Initialize storage first
            await this.storage.initialize();
            // Then initialize task store
            await this.taskStore.initialize();
            this.logger.info('Task manager initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize task manager', error);
            throw new McpError(
                ErrorCode.InternalError,
                'Failed to initialize task manager'
            );
        }
    }

    /**
     * Validates task hierarchy depth
     */
    private validateHierarchyDepth(task: CreateTaskInput, depth: number = 1): void {
        const MAX_DEPTH = 5;
        if (depth > MAX_DEPTH) {
            throw createError(
                ErrorCodes.VALIDATION_ERROR,
                { message: `Task hierarchy cannot exceed ${MAX_DEPTH} levels deep` }
            );
        }
        if (task.subtasks) {
            task.subtasks.forEach(subtask => this.validateHierarchyDepth(subtask, depth + 1));
        }
    }

    /**
     * Creates a new task
     */
    async createTask(
        parentId: string | null, 
        input: CreateTaskInput, 
        newSession: boolean = false,
        transactionId?: string
    ): Promise<TaskResponse<Task>> {
        try {
            // Validate input data first
            const validationResult = safeValidateCreateTask(input);
            if (!validationResult.success) {
                const validationError = ValidationError.fromZodError(validationResult.error);
                throw new McpError(
                    ErrorCode.InvalidRequest,
                    validationError.getUserMessage(),
                    { validationErrors: validationError.validationErrors }
                );
            }
            const validatedInput = validationResult.data;

            // Get session ID from session manager or generate a new one
            const sessionId = await this.getCurrentSessionId();

            // Determine effective parentId (input.parentId takes precedence)
            const effectiveParentId = input.parentId || parentId;

            // Check parent task if provided
            if (effectiveParentId) {
                const parentTask = this.taskStore.getTaskById(effectiveParentId);
                if (!parentTask) {
                    throw createError(
                        ErrorCodes.TASK_NOT_FOUND,
                        { taskId: effectiveParentId }
                    );
                }
                if (parentTask.type !== TaskType.GROUP) {
                    throw createError(
                        ErrorCodes.TASK_INVALID_PARENT,
                        { taskId: effectiveParentId }
                    );
                }
            }

            // Generate task ID and metadata
            const taskId = generateShortId();
            const now = new Date().toISOString();
            // Get active task list ID from session manager or use default
            const activeTaskList = await this.sessionManager?.getActiveTaskList() || null;
            const taskListId = activeTaskList?.id || 'default';

            // Create metadata with required fields first
            const metadata: TaskMetadata = {
                created: now,
                updated: now,
                sessionId: sessionId,
                taskListId: taskListId,
                // Add optional fields from input.metadata if they exist
                ...(input.metadata ? {
                    context: input.metadata.context,
                    tags: input.metadata.tags
                } : {})
            };

            // Process subtasks
            const subtaskIds: string[] = [];
            if (input.subtasks && input.subtasks.length > 0) {
                const subtaskResults = await Promise.all(
                    input.subtasks.map(subtaskInput => 
                        this.createTask(taskId, {
                            ...subtaskInput,
                            metadata: { 
                                ...subtaskInput.metadata, 
                                sessionId: sessionId 
                            }
                        })
                    )
                );
                subtaskIds.push(...subtaskResults.map(result => result.data!.id));
            }

            // Create task object
            const task: Task = {
                id: taskId,
                name: validatedInput.name,
                description: validatedInput.description || '',
                notes: validatedInput.notes || [],
                reasoning: validatedInput.reasoning,
                type: validatedInput.type || TaskType.TASK,
                status: TaskStatus.PENDING,
                dependencies: validatedInput.dependencies || [],
                subtasks: subtaskIds,
                metadata,
                parentId: effectiveParentId || `ROOT-${sessionId}`
            };

            // Add task to store
            await this.taskStore.addTask(task, transactionId);

            // Validate dependencies if any
            if (task.dependencies.length > 0) {
                await this.dependencyValidator.validateDependencies(
                    task,
                    id => this.taskStore.getTaskById(id)
                );
            }

            return {
                success: true,
                data: task,
                metadata: {
                    timestamp: new Date().toISOString(),
                    requestId: generateShortId(),
                    sessionId
                }
            };
        } catch (error) {
            this.logger.error('Failed to create task', error);
            throw error;
        }
    }

    /**
     * Updates an existing task
     * @param taskId ID of the task to update
     * @param updates Updates to apply to the task
     * @param isBulkOperation Whether this update is part of a bulk operation
     */
    async updateTask(taskId: string, updates: UpdateTaskInput, isBulkOperation: boolean = false): Promise<TaskResponse<Task>> {
        try {
            const validatedUpdates = validateUpdateTask(updates);
            const task = this.taskStore.getTaskById(taskId);
            if (!task) {
                throw createError(ErrorCodes.TASK_NOT_FOUND, { taskId });
            }

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
                    },
                    isBulkOperation
                );
            }

            if (updates.dependencies) {
                await this.dependencyValidator.validateDependencies(
                    { ...task, dependencies: updates.dependencies },
                    id => this.taskStore.getTaskById(id)
                );
            }

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
                    requestId: generateShortId(),
                    sessionId: updatedTask.metadata.sessionId
                }
            };
        } catch (error) {
            this.logger.error('Failed to update task', error);
            throw error;
        }
    }

    /**
     * Gets tasks by status
     */
    async getTasksByStatus(status: TaskStatus, sessionId?: string, taskListId?: string): Promise<TaskResponse<Task[]>> {
        try {
            const effectiveSessionId = sessionId || (await this.getCurrentSessionId());
            const tasks = this.taskStore.getTasksByStatus(status, effectiveSessionId, taskListId);
            
            return {
                success: true,
                data: tasks,
                metadata: {
                    timestamp: new Date().toISOString(),
                    requestId: generateShortId(),
                    sessionId: effectiveSessionId,
                    taskListId: taskListId
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
    async getSubtasks(taskId: string, sessionId?: string, taskListId?: string): Promise<TaskResponse<Task[]>> {
        try {
            const task = this.taskStore.getTaskById(taskId);
            if (!task) {
                throw createError(ErrorCodes.TASK_NOT_FOUND, { taskId });
            }

            const effectiveSessionId = sessionId || task.metadata.sessionId;
            const effectiveTaskListId = taskListId || task.metadata.taskListId;

            const subtasks = task.subtasks
                .map(id => this.taskStore.getTaskById(id))
                .filter((t): t is Task => t !== null)
                .filter(t => 
                    (!sessionId || t.metadata.sessionId === effectiveSessionId) &&
                    (!taskListId || t.metadata.taskListId === effectiveTaskListId)
                );

            return {
                success: true,
                data: subtasks,
                metadata: {
                    timestamp: new Date().toISOString(),
                    requestId: generateShortId(),
                    sessionId: effectiveSessionId,
                    taskListId: effectiveTaskListId
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
    private buildTaskTreeRecursive(task: Task): Task {
        const subtaskObjects = task.subtasks
            .map(subtaskId => this.taskStore.getTaskById(subtaskId))
            .filter((t): t is Task => t !== null)
            .map(subtask => this.buildTaskTreeRecursive(subtask));

        return {
            ...task,
            metadata: {
                ...task.metadata,
                resolvedSubtasks: subtaskObjects
            }
        };
    }

    async getTaskTree(sessionId?: string, taskListId?: string): Promise<TaskResponse<Task[]>> {
        try {
            // Get the effective session ID
            const effectiveSessionId = sessionId || (await this.getCurrentSessionId());
            
            // Get root tasks with filtering
            const rootTasks = this.taskStore.getRootTasks(effectiveSessionId, taskListId);
            
            // Build tree for each root task
            const fullTree = rootTasks.map(task => this.buildTaskTreeRecursive(task));
            
            return {
                success: true,
                data: fullTree,
                metadata: {
                    timestamp: new Date().toISOString(),
                    requestId: generateShortId(),
                    sessionId: effectiveSessionId,
                    taskListId: taskListId
                }
            };
        } catch (error) {
            this.logger.error('Failed to get task tree', error);
            throw error;
        }
    }

    /**
     * Creates multiple tasks in bulk
     */
    async bulkCreateTasks(input: BulkCreateTaskInput): Promise<TaskResponse<Task[]>> {
        const transactionId = this.taskStore.startTransaction();
        
        try {
            validateBulkCreateTask(input);
            const createdTasks: TaskResponse<Task>[] = [];
            
            for (const taskInput of input.tasks) {
                const effectiveParentId = taskInput.parentId || input.parentId || null;
                const task = await this.createTask(effectiveParentId, taskInput, false, transactionId);
                createdTasks.push(task);
            }

            await this.taskStore.commitTransaction(transactionId);

            return {
                success: true,
                data: createdTasks.map(response => response.data!),
                metadata: {
                    timestamp: new Date().toISOString(),
                    requestId: generateShortId(),
                    sessionId: createdTasks[0]?.data?.metadata.sessionId || generateShortId(),
                    affectedTasks: createdTasks.map(response => response.data!.id),
                    transactionId
                }
            };
        } catch (error) {
            await this.taskStore.rollbackTransaction(transactionId);
            this.logger.error('Failed to create tasks in bulk', error);
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

            // Remove the task
            await this.taskStore.removeTask(taskId);

            return {
                success: true,
                metadata: {
                    timestamp: new Date().toISOString(),
                    requestId: generateShortId(),
                    sessionId: task.metadata.sessionId
                }
            };
        } catch (error) {
            this.logger.error('Failed to delete task', error);
            throw error;
        }
    }

    /**
     * Updates multiple tasks in bulk
     */
    async bulkUpdateTasks(input: BulkUpdateTasksInput): Promise<TaskResponse<Task[]>> {
        const transactionId = this.taskStore.startTransaction();
        try {
            const updatedTasks = [];
            
            // Process updates sequentially within the transaction
            for (const { taskId, updates } of input.updates) {
                const result = await this.updateTask(taskId, updates, true);
                updatedTasks.push(result);
            }

            await this.taskStore.commitTransaction(transactionId);

            return {
                success: true,
                data: updatedTasks.map(response => response.data!),
                metadata: {
                    timestamp: new Date().toISOString(),
                    requestId: generateShortId(),
                    sessionId: updatedTasks[0]?.data?.metadata.sessionId || generateShortId(),
                    affectedTasks: updatedTasks.map(response => response.data!.id),
                    transactionId
                }
            };
        } catch (error) {
            await this.taskStore.rollbackTransaction(transactionId);
            this.logger.error('Failed to update tasks in bulk', error);
            throw error;
        }
    }
}
