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
    TaskType,
    TaskStatus,
    BulkCreateTaskInput,
    BulkUpdateTasksInput
} from './types/task.js';
import { StorageManager } from './storage/index.js';
import { Logger } from './logging/index.js';
import { z } from 'zod';
import { validateCreateTask, validateUpdateTask } from './validation/task.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
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
    private storage: StorageManager;

    constructor(storage: StorageManager) {
        this.storage = storage;
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
     * 
     * @param parentId - ID of the parent task (null for root tasks)
     * @param input - Task creation input data
     * @param newSession - Whether to create a new session
     * @returns Promise resolving to the created task
     * @throws {TaskError} If task creation fails
     */
    async createTask(parentId: string | null, input: CreateTaskInput, newSession: boolean = false): Promise<TaskResponse<Task>> {
        try {
            // Validate input data first
            let validatedInput: CreateTaskInput;
            try {
                validatedInput = validateCreateTask(input);
            } catch (error) {
                if (error instanceof z.ZodError) {
                    const fieldErrors = error.errors.map(err => 
                        `${err.path.join('.')}: ${err.message}`
                    ).join('\n');
                    throw new McpError(
                        ErrorCode.InvalidRequest,
                        `Task validation failed:\n${fieldErrors}`
                    );
                }
                throw error;
            }

            // Validate hierarchy depth before any task creation
            const validateHierarchy = (task: CreateTaskInput, currentDepth: number = 1): void => {
                const MAX_DEPTH = 5;
                if (currentDepth > MAX_DEPTH) {
                    const error = new McpError(
                        ErrorCode.InvalidRequest,
                        `Task hierarchy depth of ${currentDepth} exceeds maximum allowed depth of ${MAX_DEPTH}. Found task "${task.name}" at level ${currentDepth}. Please restructure your tasks to be no more than ${MAX_DEPTH} levels deep.`
                    );
                    this.logger.error('Task hierarchy validation failed', { error, task: task.name, depth: currentDepth });
                    throw error;
                }
                if (task.subtasks?.length) {
                    task.subtasks.forEach(subtask => validateHierarchy(subtask, currentDepth + 1));
                }
            };

            try {
                validateHierarchy(input);
            } catch (error) {
                if (error instanceof McpError) {
                    throw error;
                }
                throw new McpError(
                    ErrorCode.InvalidRequest,
                    error instanceof Error ? error.message : 'Failed to validate task hierarchy'
                );
            }

            // Generate new session ID if requested
            if (newSession) {
                this.currentSessionId = uuidv4();
            }

            // Determine effective parentId (input.parentId takes precedence)
            const effectiveParentId = input.parentId || parentId;

            // Check parent task if provided
            if (effectiveParentId) {
                const parentTask = this.taskStore.getTaskById(effectiveParentId);
                if (!parentTask) {
                    throw new McpError(
                        ErrorCode.InvalidRequest,
                        `Parent task with ID "${effectiveParentId}" not found. Please ensure the parent task exists before creating child tasks.`
                    );
                }
                if (parentTask.type !== TaskType.GROUP) {
                    throw new McpError(
                        ErrorCode.InvalidRequest,
                        `Parent task "${parentTask.name}" (${effectiveParentId}) must be of type "group" to contain child tasks. Current type: "${parentTask.type}"`
                    );
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

            // Process subtasks
            const subtaskIds: string[] = [];
            if (input.subtasks && input.subtasks.length > 0) {
                try {
                    const subtaskResults = await Promise.all(
                        input.subtasks.map(subtaskInput => this.createTask(taskId, subtaskInput))
                    );
                    subtaskIds.push(...subtaskResults.map(result => {
                        if (!result.data) {
                            throw new McpError(
                                ErrorCode.InvalidRequest,
                                'Failed to create subtask: Invalid task data'
                            );
                        }
                        return result.data.id;
                    }));
                } catch (error) {
                    // Re-throw MCP errors directly
                    if (error instanceof McpError) {
                        throw error;
                    }
                    // Wrap other errors
                    throw new McpError(
                        ErrorCode.InvalidRequest,
                        `Failed to create subtasks: ${error instanceof Error ? error.message : 'Unknown error'}`
                    );
                }
            }

            // Create task object with collected subtask IDs using validated input
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
                parentId: effectiveParentId || `ROOT-${this.currentSessionId}`
            };

            try {
                // Add task to store
                await this.taskStore.addTask(task);
            } catch (error) {
                this.logger.error('Failed to add task to store', {
                    error,
                    taskId: task.id,
                    taskName: task.name
                });
                throw new McpError(
                    ErrorCode.InvalidRequest,
                    error instanceof Error ? error.message : 'Failed to add task to store'
                );
            }

            // Validate dependencies if any
            if (task.dependencies.length > 0) {
                await this.dependencyValidator.validateDependencies(
                    task,
                    id => this.taskStore.getTaskById(id)
                );
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
            this.logger.error('Failed to create task', { 
                error,
                taskName: input.name,
                parentId: input.parentId || parentId,
                type: input.type,
                validationErrors: error instanceof z.ZodError ? 
                    error.errors.map(err => ({
                        path: err.path.join('.'),
                        message: err.message
                    })) : undefined
            });
            // Re-throw MCP errors directly
            if (error instanceof McpError) {
                throw error;
            }
            // Convert Zod validation errors
            if (error instanceof z.ZodError) {
                throw new McpError(
                    ErrorCode.InvalidRequest,
                    error.errors.map((e) => e.message).join(', ')
                );
            }
            // Wrap other errors
            throw new McpError(
                ErrorCode.InvalidRequest,
                error instanceof Error ? error.message : 'Unknown error occurred'
            );
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
     * Creates multiple tasks in bulk with proper hierarchy
     */
    async bulkCreateTasks(input: BulkCreateTaskInput): Promise<TaskResponse<Task[]>> {
        try {
            // Create a map to store tasks by their temporary IDs
            const tempIdMap = new Map<string, string>();
            
            // First pass: Create all tasks and store their actual IDs
            const createdTasks = await Promise.all(
                input.tasks.map(async taskInput => {
                    // Generate a temporary ID for reference
                    const tempId = uuidv4();
                    
                    // Determine the correct parentId
                    // Priority: taskInput.parentId > input.parentId > ROOT
                    const effectiveParentId = taskInput.parentId || input.parentId || null;
                    
                    // Create the task
                    const result = await this.createTask(effectiveParentId, taskInput);
                    
                    if (!result.data) {
                        throw new McpError(
                            ErrorCode.InvalidRequest,
                            'Failed to create task: Invalid task data'
                        );
                    }
                    
                    // Store the mapping of temp ID to actual ID
                    tempIdMap.set(tempId, result.data.id);
                    
                    return result;
                })
            );

            // Second pass: Update parent-child relationships
            await Promise.all(
                createdTasks.map(async response => {
                    if (!response.data) return;
                    
                    const task = response.data;
                    const parentId = task.parentId;
                    
                    if (parentId && !parentId.startsWith('ROOT-')) {
                        // Get the parent task
                        const parentTask = this.taskStore.getTaskById(parentId);
                        if (parentTask && !parentTask.subtasks.includes(task.id)) {
                            // Update parent's subtasks array
                            await this.taskStore.updateTask(parentId, {
                                ...parentTask,
                                subtasks: [...parentTask.subtasks, task.id]
                            });
                        }
                    }
                })
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
            this.logger.error('Failed to create tasks in bulk', {
                error,
                taskCount: input.tasks.length,
                parentId: input.parentId,
                failedTask: error instanceof McpError ? error.message : 'Unknown error'
            });
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
