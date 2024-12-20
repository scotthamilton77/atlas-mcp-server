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
    TaskWithSubtasks
} from './types/task.js';
import { StorageManager } from './storage/index.js';
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
    private currentSessionId: string;
    private storage: StorageManager;

    constructor(storage: StorageManager) {
        this.storage = storage;
        this.logger = Logger.getInstance().child({ component: 'TaskManager' });
        this.taskStore = new TaskStore(storage);
        this.dependencyValidator = new DependencyValidator();
        this.statusManager = new StatusManager();
        this.currentSessionId = generateShortId();
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
                this.currentSessionId = generateShortId();
            }

            // Determine effective parentId (input.parentId takes precedence)
            const effectiveParentId = input.parentId || parentId;

            // Check parent task if provided
            if (effectiveParentId) {
                const parentTask = this.taskStore.getTaskById(effectiveParentId);
                if (!parentTask) {
                    throw createError(
                        ErrorCodes.TASK_NOT_FOUND,
                        { taskId: effectiveParentId },
                        `Parent task with ID "${effectiveParentId}" not found`,
                        'Please ensure the parent task exists before creating child tasks'
                    );
                }
                if (parentTask.type !== TaskType.GROUP) {
                    throw createError(
                        ErrorCodes.TASK_INVALID_PARENT,
                        { 
                            taskId: effectiveParentId,
                            parentName: parentTask.name,
                            parentType: parentTask.type
                        },
                        `Parent task "${parentTask.name}" must be of type "group"`,
                        `Current type is "${parentTask.type}". Change the parent task type to "group" to contain child tasks`
                    );
                }
            }

            // Generate task ID and metadata
            const taskId = generateShortId();
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

            // Add task to store (with transaction if provided)
            try {
                await this.taskStore.addTask(task, transactionId);
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
                    requestId: generateShortId(),
                    sessionId: this.currentSessionId
                }
            };
        } catch (error) {
            this.logger.error('Failed to create task', { 
                error,
                taskName: input.name,
                parentId: input.parentId || parentId,
                type: input.type
            });

            if (error instanceof McpError) {
                this.logger.error('MCP Error in createTask', {
                    error,
                    code: error.code,
                    message: error.message,
                    taskName: input.name,
                    parentId: input.parentId || parentId,
                    type: input.type,
                    stack: error.stack,
                    validationResult: safeValidateCreateTask(input)
                });
                throw error;
            }
            
            // Log the full error details
            const errorDetails = {
                error,
                taskName: input.name,
                parentId: input.parentId || parentId,
                type: input.type,
                stack: error instanceof Error ? error.stack : undefined,
                validationResult: safeValidateCreateTask(input),
                taskStore: {
                    taskCount: this.taskStore.taskCount,
                    parentTask: input.parentId ? this.taskStore.getTaskById(input.parentId) : null
                }
            };
            
            this.logger.error('Failed to create task', errorDetails);

            // Create a more descriptive error message
            const errorMessage = error instanceof Error 
                ? `Failed to create task: ${error.message}. Parent task ${input.parentId ? 'exists' : 'not provided'}. Task store has ${this.taskStore.taskCount} tasks.`
                : 'Failed to create task: Unknown error';

            throw new McpError(
                ErrorCode.InvalidRequest,
                errorMessage,
                {
                    originalError: error,
                    context: errorDetails
                }
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
                    requestId: generateShortId(),
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
                    requestId: generateShortId(),
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
                    requestId: generateShortId(),
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
    /**
     * Recursively builds a task tree with full subtask details
     */
    private buildTaskTreeRecursive(task: Task): Task {
        // First get all subtask objects
        const subtaskObjects = task.subtasks
            .map(subtaskId => this.taskStore.getTaskById(subtaskId))
            .filter((t): t is Task => t !== null)
            .map(subtask => this.buildTaskTreeRecursive(subtask));

        // Store the full subtask objects in task metadata for client use
        const enrichedTask: Task = {
            ...task,
            metadata: {
                ...task.metadata,
                resolvedSubtasks: subtaskObjects
            }
        };

        return enrichedTask;
    }

    async getTaskTree(): Promise<TaskResponse<Task[]>> {
        try {
            const rootTasks = this.taskStore.getRootTasks();
            const fullTree = rootTasks.map(task => this.buildTaskTreeRecursive(task));
            
            return {
                success: true,
                data: fullTree,
                metadata: {
                    timestamp: new Date().toISOString(),
                    requestId: generateShortId(),
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
     * Creates multiple tasks in bulk with proper hierarchy
     */
    async bulkCreateTasks(input: BulkCreateTaskInput): Promise<TaskResponse<Task[]>> {
        // Start a single transaction for the entire bulk operation
        const transactionId = this.taskStore.startTransaction();
        
        try {
            // Phase 1: Input and Parent Validation
            try {
                validateBulkCreateTask(input);

                // Validate parent task if provided
                if (input.parentId) {
                    const parentTask = this.taskStore.getTaskById(input.parentId);
                    if (!parentTask) {
                        throw createError(
                            ErrorCodes.TASK_NOT_FOUND,
                            { taskId: input.parentId },
                            `Parent task with ID "${input.parentId}" not found`,
                            'Please ensure the parent task exists before creating child tasks'
                        );
                    }
                    if (parentTask.type !== TaskType.GROUP) {
                        throw createError(
                            ErrorCodes.TASK_INVALID_PARENT,
                            { 
                                taskId: input.parentId,
                                parentName: parentTask.name,
                                parentType: parentTask.type
                            },
                            `Parent task "${parentTask.name}" must be of type "group"`,
                            `Current type is "${parentTask.type}". Change the parent task type to "group" to contain child tasks`
                        );
                    }
                }
            } catch (error) {
                if (error instanceof z.ZodError) {
                    const validationError = ValidationError.fromZodError(error);
                    throw new McpError(
                        ErrorCode.InvalidRequest,
                        validationError.getUserMessage(),
                        { validationErrors: validationError.validationErrors }
                    );
                }
                throw error;
            }

            // Phase 2: Sequential Task Creation
            const createdTasks: TaskResponse<Task>[] = [];
            for (const [index, taskInput] of input.tasks.entries()) {
                try {
                    // Determine the correct parentId
                    const effectiveParentId = taskInput.parentId || input.parentId || null;
                    
                    // Validate input data first
                    let validatedInput: CreateTaskInput;
                    try {
                        validatedInput = validateCreateTask(taskInput);
                    } catch (error) {
                        if (error instanceof z.ZodError) {
                            const validationError = ValidationError.fromZodError(error);
                            throw new McpError(
                                ErrorCode.InvalidRequest,
                                validationError.getUserMessage(),
                                { validationErrors: validationError.validationErrors }
                            );
                        }
                        throw error;
                    }

                    // Check parent task if provided
                    if (effectiveParentId) {
                        const parentTask = this.taskStore.getTaskById(effectiveParentId);
                        if (!parentTask) {
                            throw createError(
                                ErrorCodes.TASK_NOT_FOUND,
                                { taskId: effectiveParentId },
                                `Parent task with ID "${effectiveParentId}" not found`,
                                'Please ensure the parent task exists before creating child tasks'
                            );
                        }
                        if (parentTask.type !== TaskType.GROUP) {
                            throw createError(
                                ErrorCodes.TASK_INVALID_PARENT,
                                { 
                                    taskId: effectiveParentId,
                                    parentName: parentTask.name,
                                    parentType: parentTask.type
                                },
                                `Parent task "${parentTask.name}" must be of type "group"`,
                                `Current type is "${parentTask.type}". Change the parent task type to "group" to contain child tasks`
                            );
                        }
                    }

                    // Create task object
                    const taskId = generateShortId();
                    const now = new Date().toISOString();
                    const task: Task = {
                        id: taskId,
                        name: validatedInput.name,
                        description: validatedInput.description || '',
                        notes: validatedInput.notes || [],
                        reasoning: validatedInput.reasoning,
                        type: validatedInput.type || TaskType.TASK,
                        status: TaskStatus.PENDING,
                        dependencies: validatedInput.dependencies || [],
                        subtasks: [],
                        metadata: {
                            created: now,
                            updated: now,
                            sessionId: this.currentSessionId,
                            ...validatedInput.metadata
                        },
                        parentId: effectiveParentId || `ROOT-${this.currentSessionId}`
                    };

                    // Add task to store with transaction
                    await this.taskStore.addTask(task, transactionId);

                    // Update parent's subtasks
                    if (effectiveParentId && !effectiveParentId.startsWith('ROOT-')) {
                        const parentTask = this.taskStore.getTaskById(effectiveParentId);
                        if (parentTask) {
                            const updatedParent = {
                                ...parentTask,
                                subtasks: [...parentTask.subtasks, taskId],
                                metadata: {
                                    ...parentTask.metadata,
                                    updated: now
                                }
                            };
                            await this.taskStore.updateTask(effectiveParentId, updatedParent, transactionId);
                        }
                    }

                    const result: TaskResponse<Task> = {
                        success: true,
                        data: task,
                        metadata: {
                            timestamp: now,
                            requestId: generateShortId(),
                            sessionId: this.currentSessionId
                        }
                    };
                    
                    if (!result.data) {
                        throw createError(
                            ErrorCodes.OPERATION_FAILED,
                            { taskInput, index },
                            'Failed to create task: Invalid task data',
                            'Ensure all required task data is provided and valid'
                        );
                    }
                    
                    createdTasks.push(result);
                    
                    this.logger.info('Created task in bulk operation', {
                        taskId: result.data.id,
                        index,
                        totalTasks: input.tasks.length,
                        parentId: effectiveParentId,
                        transactionId
                    });
                } catch (error) {
                    // Enhanced error context
                    const enhancedError = wrapError(error, `Failed to create task at index ${index}`);
                    this.logger.error('Task creation failed in bulk operation', {
                        error: enhancedError,
                        taskInput,
                        index,
                        transactionId
                    });
                    throw enhancedError;
                }
            }

            // Phase 3: Commit Transaction
            await this.taskStore.commitTransaction(transactionId);

            // Phase 4: Return Results
            const result: TaskResponse<Task[]> = {
                success: true,
                data: createdTasks.map(response => response.data!),
                metadata: {
                    timestamp: new Date().toISOString(),
                    requestId: generateShortId(),
                    sessionId: this.currentSessionId,
                    affectedTasks: createdTasks.map(response => response.data!.id),
                    transactionId
                }
            };

            this.logger.info('Bulk task creation completed successfully', {
                taskCount: createdTasks.length,
                transactionId,
                taskIds: result.metadata?.affectedTasks ?? []
            });

            return result;
        } catch (error) {
            // Rollback transaction on error
            await this.taskStore.rollbackTransaction(transactionId);
            this.logger.error('Failed to create tasks in bulk', {
                error,
                taskCount: input.tasks.length,
                parentId: input.parentId
            });

            if (error instanceof BaseError) {
                throw new McpError(
                    ErrorCode.InvalidRequest,
                    `Bulk creation failed: ${error.getUserMessage()}`,
                    { originalError: error }
                );
            }

            if (error instanceof z.ZodError) {
                const validationError = ValidationError.fromZodError(error);
                throw new McpError(
                    ErrorCode.InvalidRequest,
                    `Bulk validation failed: ${validationError.getUserMessage()}`,
                    { validationErrors: validationError.validationErrors }
                );
            }

            throw new McpError(
                ErrorCode.InvalidRequest,
                `Bulk creation failed: ${getUserErrorMessage(error)}`,
                { originalError: error }
            );
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
                    requestId: generateShortId(),
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
