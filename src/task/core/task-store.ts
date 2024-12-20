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

import { Task, TaskStatus, TaskType } from '../../types/task.js';
import { Logger } from '../../logging/index.js';
import { UnifiedStorageManager } from '../../storage/unified-storage.js';
import { DependencyValidator } from './dependency-validator.js';
import { StatusManager } from './status-manager.js';
import { EnhancedCacheManager } from './cache/cache-manager.js';
import { TaskIndexManager } from './indexing/index-manager.js';
import { TaskTransactionManager } from './transactions/transaction-manager.js';
import { TaskBatchProcessor } from './batch/batch-processor.js';
import { ErrorCodes, createError } from '../../errors/index.js';

export class TaskStore {
    private logger: Logger;
    private cacheManager: EnhancedCacheManager;
    private indexManager: TaskIndexManager;
    private transactionManager: TaskTransactionManager;
    private batchProcessor: TaskBatchProcessor;
    private statusManager: StatusManager;
    private dependencyValidator: DependencyValidator;

    constructor(
        private storage: UnifiedStorageManager
    ) {
        this.logger = Logger.getInstance().child({ component: 'TaskStore' });
        this.cacheManager = new EnhancedCacheManager();
        this.indexManager = new TaskIndexManager();
        this.transactionManager = new TaskTransactionManager();
        this.batchProcessor = new TaskBatchProcessor();
        this.statusManager = new StatusManager();
        this.dependencyValidator = new DependencyValidator();
    }

    /**
     * Starts a new transaction
     */
    startTransaction(): string {
        return this.transactionManager.startTransaction();
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
                let recoveredCount = 0;
                try {
                    const recoveredTasks = await this.storage.loadTasks();
                    if (!Array.isArray(recoveredTasks)) {
                        throw new Error('Invalid recovered tasks format');
                    }

                    // Validate recovered tasks before processing
                    const validTasks = recoveredTasks.filter(task => {
                        try {
                            if (!task.id || !task.name || !task.type || !task.status) {
                                this.logger.warn('Skipping invalid task during recovery', { task });
                                return false;
                            }
                            return true;
                        } catch (e) {
                            this.logger.warn('Error validating task during recovery', { task, error: e });
                            return false;
                        }
                    });

                    await this.batchProcessor.processInBatches(
                        validTasks,
                        50,
                        async (task: Task) => {
                            try {
                                this.indexManager.indexTask(task);
                                this.cacheManager.set(task.id, task);
                                await this.indexManager.indexDependencies(task);
                            } catch (e) {
                                this.logger.error('Failed to process task during recovery', { 
                                    taskId: task.id,
                                    error: e 
                                });
                            }
                        }
                    );

                    recoveredCount = validTasks.length;
                    this.logger.info('Recovery completed', {
                        totalTasks: recoveredTasks.length,
                        validTasks: validTasks.length,
                        skippedTasks: recoveredTasks.length - validTasks.length
                    });
                } catch (recoveryError) {
                    this.logger.error('Recovery failed, initializing empty state', { error: recoveryError });
                    // Initialize with empty state as last resort
                    this.indexManager.clear();
                    this.cacheManager.clear();
                }
                
                this.logger.info('Recovered from backup', {
                    taskCount: recoveredCount
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
    getTasksByStatus(status: TaskStatus, sessionId?: string, taskListId?: string): Task[] {
        return this.indexManager.getTasksByStatus(status, sessionId, taskListId);
    }

    /**
     * Gets tasks by parent ID
     */
    getTasksByParent(parentId: string, sessionId?: string, taskListId?: string): Task[] {
        return this.indexManager.getTasksByParent(parentId, sessionId, taskListId);
    }

    /**
     * Gets root tasks with optional session and task list filtering
     */
    getRootTasks(sessionId?: string, taskListId?: string): Task[] {
        return this.indexManager.getRootTasks(sessionId, taskListId);
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
    /**
     * Adds a task and all its subtasks atomically with improved error handling
     */
    private readonly RECOMMENDED_MAX_DEPTH = 5;

    /**
     * Gets the chain of parent tasks up to the root
     */
    private getTaskChain(taskId: string): string[] {
        const chain: string[] = [];
        const visited = new Set<string>();
        let currentTask = this.getTaskById(taskId);

        while (currentTask && !currentTask.parentId?.startsWith('ROOT-')) {
            if (visited.has(currentTask.id)) {
                throw createError(
                    ErrorCodes.VALIDATION_ERROR,
                    { taskId: currentTask.id, chain },
                    'Circular dependency detected in task hierarchy',
                    'Remove circular parent-child relationships'
                );
            }

            visited.add(currentTask.id);
            chain.push(currentTask.id);

            if (!currentTask.parentId) break;
            currentTask = this.getTaskById(currentTask.parentId);
        }

        return chain;
    }

    private calculateTaskDepth(taskId: string): number {
        const chain = this.getTaskChain(taskId);
        const depth = chain.length;

        this.logger.info('Calculated task depth', {
            taskId,
            depth,
            chain,
            recommendedMaxDepth: this.RECOMMENDED_MAX_DEPTH
        });

        return depth;
    }

    /**
     * Validates task hierarchy depth
     */
    /**
     * Checks and logs task hierarchy depth
     */
    private checkHierarchyDepth(task: Task): void {
        if (!task.parentId || task.parentId.startsWith('ROOT-')) {
            return;
        }

        const chain = this.getTaskChain(task.parentId);
        const depth = chain.length + 1; // +1 for the new task being added

        if (depth > this.RECOMMENDED_MAX_DEPTH) {
            this.logger.warn('Task hierarchy exceeds recommended depth', {
                taskId: task.id,
                taskName: task.name,
                parentId: task.parentId,
                depth,
                chain,
                recommendedMaxDepth: this.RECOMMENDED_MAX_DEPTH,
                message: 'Consider restructuring tasks to reduce hierarchy depth for better organization'
            });
        } else {
            this.logger.info('Task hierarchy depth within recommended limit', {
                taskId: task.id,
                taskName: task.name,
                parentId: task.parentId,
                depth,
                chain,
                recommendedMaxDepth: this.RECOMMENDED_MAX_DEPTH
            });
        }
    }

    async addTask(task: Task, transactionId?: string): Promise<void> {
        const isRootTransaction = !transactionId;
        transactionId = transactionId || this.transactionManager.startTransaction();

        try {
            // Phase 1: Validation
            // Check hierarchy depth (warning only)
            this.checkHierarchyDepth(task);

            if (this.indexManager.getTaskById(task.id)) {
                throw createError(
                    ErrorCodes.TASK_DUPLICATE,
                    { taskId: task.id },
                    `Task with ID ${task.id} already exists`,
                    'Use a different task ID or update the existing task'
                );
            }

            // Validate dependencies
            await this.dependencyValidator.validateDependencies(task, this.getTaskById.bind(this));

            // Phase 2: Task Creation and Validation
            // Validate notes if present
            if (task.notes?.length) {
                for (const note of task.notes) {
                    this.validateNote(note);
                }
            }

            // Check if task should be blocked
            const shouldBlock = this.statusManager.isBlocked(task, this.getTaskById.bind(this));
            const taskToAdd = shouldBlock ? { ...task, status: TaskStatus.BLOCKED } : task;

            try {
                // Update parent relationships first
                await this.updateParentSubtasks(taskToAdd, transactionId);

                // Add to indexes and cache
                this.indexManager.indexTask(taskToAdd);
                await this.indexManager.indexDependencies(taskToAdd);
                this.cacheManager.set(taskToAdd.id, taskToAdd);

                // Update parent status if needed
                if (taskToAdd.parentId && !taskToAdd.parentId.startsWith('ROOT-')) {
                    await this.updateParentStatus(taskToAdd.parentId, transactionId);
                }

                // Record operation
                this.transactionManager.addOperation(transactionId, {
                    type: 'add',
                    task: taskToAdd
                });

                this.logger.info('Task added successfully', {
                    taskId: taskToAdd.id,
                    parentId: taskToAdd.parentId,
                    type: taskToAdd.type,
                    transactionId,
                    taskCount: this.taskCount
                });
            } catch (error) {
                this.logger.error('Failed to add task to store', {
                    error,
                    taskId: taskToAdd.id,
                    parentId: taskToAdd.parentId,
                    type: taskToAdd.type,
                    transactionId,
                    taskCount: this.taskCount,
                    stack: error instanceof Error ? error.stack : undefined
                });
                throw error;
            }

            // Phase 3: Parent Update (deferred)
            const parentUpdates = [];
            if (taskToAdd.parentId && !taskToAdd.parentId.startsWith('ROOT-')) {
                const parent = this.getTaskById(taskToAdd.parentId);
                if (parent) {
                    if (parent.type !== TaskType.GROUP) {
                        throw createError(
                            ErrorCodes.TASK_INVALID_PARENT,
                            { 
                                taskId: taskToAdd.id,
                                parentId: parent.id,
                                parentType: parent.type
                            },
                            `Parent task must be of type "group" (got "${parent.type}")`,
                            'Change parent task type to "group" or choose a different parent'
                        );
                    }
                    parentUpdates.push({
                        parentId: taskToAdd.parentId,
                        childId: taskToAdd.id
                    });
                }
            }

            // Phase 4: Process Subtasks
            const subtaskUpdates = [];
            if (task.subtasks?.length > 0) {
                for (const subtaskId of task.subtasks) {
                    const subtask = this.getTaskById(subtaskId);
                    if (subtask) {
                        subtaskUpdates.push({
                            subtask,
                            parentId: taskToAdd.id
                        });
                    }
                }
            }

            // Phase 5: Apply Updates
            if (isRootTransaction) {
                // Process parent updates
                if (parentUpdates.length > 0) {
                    await this.processParentUpdates(parentUpdates, transactionId);
                }

                // Process subtask updates
                if (subtaskUpdates.length > 0) {
                    await this.processSubtaskUpdates(subtaskUpdates, transactionId);
                }

                // Persist changes
                await this.storage.saveTasks(Array.from(this.indexManager.getAllTasks()));
                await this.transactionManager.commitTransaction(transactionId);
            }

        } catch (error) {
            if (isRootTransaction) {
                const result = await this.transactionManager.rollbackTransaction(transactionId);
            if (result.success) {
                this.transactionManager.deleteTransaction(transactionId);
            } else {
                throw createError(
                    ErrorCodes.OPERATION_FAILED,
                    {
                        message: 'Transaction rollback failed',
                        transactionId,
                        error: result.error
                    }
                );
            }
                
                // Enhanced error handling
                if (error instanceof Error) {
                    throw createError(
                        ErrorCodes.OPERATION_FAILED,
                        {
                            taskId: task.id,
                            originalError: error,
                            context: {
                                operation: 'addTask',
                                transactionId,
                                isRootTransaction
                            }
                        },
                        error.message,
                        'Check parent-child relationships and task validation requirements'
                    );
                }
            }
            throw error;
        }
    }

    /**
     * Updates parent's subtasks array and maintains relationships
     */
    private async updateParentSubtasks(task: Task, transactionId?: string): Promise<void> {
        if (task.parentId && !task.parentId.startsWith('ROOT-')) {
            const parent = this.getTaskById(task.parentId);
            if (parent) {
                // Verify parent is a group
                if (parent.type !== TaskType.GROUP) {
                    throw createError(
                        ErrorCodes.TASK_INVALID_PARENT,
                        { 
                            taskId: task.id,
                            parentId: parent.id,
                            parentType: parent.type
                        },
                        `Parent task must be of type "group" (got "${parent.type}")`,
                        'Change parent task type to "group" or choose a different parent'
                    );
                }

                // Check for duplicate task names under the same parent
                const siblings = this.getTasksByParent(parent.id);
                const hasDuplicate = siblings.some(
                    t => t.id !== task.id && 
                        t.name === task.name && 
                        t.status !== TaskStatus.FAILED
                );
                
                if (hasDuplicate) {
                    throw createError(
                        ErrorCodes.TASK_DUPLICATE,
                        { 
                            taskName: task.name,
                            parentId: parent.id 
                        },
                        `A task named "${task.name}" already exists under the same parent`,
                        'Use a different name for the task or update the existing task'
                    );
                }

                // Update parent's subtasks array, ensuring no duplicates
                const uniqueSubtasks = Array.from(new Set([...parent.subtasks, task.id]));
                const updatedParent = {
                    ...parent,
                    subtasks: uniqueSubtasks,
                    metadata: {
                        ...parent.metadata,
                        updated: new Date().toISOString()
                    }
                };

                // Update indexes and cache
                this.indexManager.unindexTask(parent);
                this.indexManager.indexTask(updatedParent);
                this.cacheManager.set(updatedParent.id, updatedParent);

                // Record operation
                if (transactionId) {
                    this.transactionManager.addOperation(transactionId, {
                        type: 'update',
                        task: updatedParent,
                        previousState: parent
                    });
                }
            }
        }
    }

    /**
     * Validates note content based on type
     */
    private validateNote(note: { type: string; content: string; language?: string }): void {
        switch (note.type) {
            case 'code':
                if (!note.language) {
                    throw createError(
                        ErrorCodes.VALIDATION_ERROR,
                        { note },
                        'Code notes must specify a programming language',
                        'Add the language field to the code note'
                    );
                }
                break;
            case 'json':
                try {
                    JSON.parse(note.content);
                } catch (e) {
                    throw createError(
                        ErrorCodes.VALIDATION_ERROR,
                        { note, error: e },
                        'Invalid JSON content in note',
                        'Ensure the content is valid JSON'
                    );
                }
                break;
        }
    }

    /**
     * Updates parent task status based on children
     */
    private async updateParentStatus(parentId: string, transactionId: string): Promise<void> {
        const parent = this.getTaskById(parentId);
        if (!parent || parent.type !== TaskType.GROUP) return;

        const children = parent.subtasks
            .map(id => this.getTaskById(id))
            .filter((t): t is Task => t !== null);

        if (children.length === 0) return;

        let newStatus = TaskStatus.PENDING;
        const hasBlocked = children.some(t => t.status === TaskStatus.BLOCKED);
        const hasFailed = children.some(t => t.status === TaskStatus.FAILED);
        const hasInProgress = children.some(t => t.status === TaskStatus.IN_PROGRESS);
        const allCompleted = children.every(t => t.status === TaskStatus.COMPLETED);

        if (hasBlocked) newStatus = TaskStatus.BLOCKED;
        else if (hasFailed) newStatus = TaskStatus.FAILED;
        else if (hasInProgress) newStatus = TaskStatus.IN_PROGRESS;
        else if (allCompleted) newStatus = TaskStatus.COMPLETED;

        if (newStatus !== parent.status) {
            await this.updateTask(parentId, { status: newStatus }, transactionId);
        }
    }

    /**
     * Process parent updates with validation and status propagation
     */
    private async processParentUpdates(
        updates: Array<{ parentId: string; childId: string }>,
        transactionId: string
    ): Promise<void> {
        for (const { parentId, childId } of updates) {
            const parent = this.getTaskById(parentId);
            if (parent) {
                // Validate parent type
                if (parent.type !== TaskType.GROUP) {
                    throw createError(
                        ErrorCodes.TASK_INVALID_PARENT,
                        { parentId, childId },
                        'Parent task must be of type "group"',
                        'Change parent task type to "group" or choose a different parent'
                    );
                }

                // Ensure no duplicate subtask IDs
                const uniqueSubtasks = Array.from(new Set([...parent.subtasks, childId]));
                const updatedParent = {
                    ...parent,
                    subtasks: uniqueSubtasks,
                    metadata: {
                        ...parent.metadata,
                        updated: new Date().toISOString()
                    }
                };

                // Update parent status based on children
                await this.updateParentStatus(parentId, transactionId);
                
                this.indexManager.unindexTask(parent);
                this.indexManager.indexTask(updatedParent);
                this.cacheManager.set(updatedParent.id, updatedParent);
                
                this.transactionManager.addOperation(transactionId, {
                    type: 'update',
                    task: updatedParent,
                    previousState: parent
                });
            }
        }
    }

    /**
     * Process subtask updates in a separate phase
     */
    private async processSubtaskUpdates(
        updates: Array<{ subtask: Task; parentId: string }>,
        transactionId: string
    ): Promise<void> {
        for (const { subtask, parentId } of updates) {
            const updatedSubtask = {
                ...subtask,
                parentId,
                metadata: {
                    ...subtask.metadata,
                    updated: new Date().toISOString()
                }
            };

            this.indexManager.unindexTask(subtask);
            this.indexManager.indexTask(updatedSubtask);
            this.cacheManager.set(updatedSubtask.id, updatedSubtask);

            this.transactionManager.addOperation(transactionId, {
                type: 'update',
                task: updatedSubtask,
                previousState: subtask
            });
        }
    }

    /**
     * Updates a task
     */
    async updateTask(taskId: string, updates: Partial<Task>, transactionId?: string): Promise<void> {
        const isRootTransaction = !transactionId;
        transactionId = transactionId || this.transactionManager.startTransaction();
        try {
            const existingTask = this.getTaskById(taskId);
            if (!existingTask) {
                throw createError(
                    ErrorCodes.TASK_NOT_FOUND,
                    { taskId }
                );
            }

            // Check for duplicate names if name is being updated
            if (updates.name && updates.name !== existingTask.name) {
                const siblings = existingTask.parentId && !existingTask.parentId.startsWith('ROOT-')
                    ? this.getTasksByParent(existingTask.parentId)
                    : this.getRootTasks(existingTask.metadata.sessionId);
                
                const hasDuplicate = siblings.some(
                    t => t.id !== taskId && 
                        t.name === updates.name && 
                        t.status !== TaskStatus.FAILED
                );
                
                if (hasDuplicate) {
                    throw createError(
                        ErrorCodes.TASK_DUPLICATE,
                        { 
                            taskName: updates.name,
                            parentId: existingTask.parentId || `ROOT-${existingTask.metadata.sessionId}`
                        },
                        `A task named "${updates.name}" already exists at this level`,
                        'Use a different name for the task'
                    );
                }
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
                    updated: new Date().toISOString(),
                    resolvedSubtasks: undefined // Remove resolved subtasks from metadata
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

            // Persist changes only if this is a root transaction
            if (isRootTransaction) {
                await this.storage.saveTasks(Array.from(this.indexManager.getAllTasks()));
                await this.transactionManager.commitTransaction(transactionId);
            }

        } catch (error) {
            if (isRootTransaction) {
                const result = await this.transactionManager.rollbackTransaction(transactionId);
            if (result.success) {
                this.transactionManager.deleteTransaction(transactionId);
            } else {
                throw createError(
                    ErrorCodes.OPERATION_FAILED,
                    {
                        message: 'Transaction rollback failed',
                        transactionId,
                        error: result.error
                    }
                );
            }
            }
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
                    status: TaskStatus.BLOCKED,
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
    getAllTasks(sessionId?: string, taskListId?: string): Task[] {
        return this.indexManager.getAllTasks(sessionId, taskListId);
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
     * Commits a transaction
     */
    async commitTransaction(transactionId: string): Promise<void> {
        try {
            // Persist changes before committing transaction
            await this.storage.saveTasks(Array.from(this.indexManager.getAllTasks()));
            await this.transactionManager.commitTransaction(transactionId);
        } catch (error) {
            // If save fails, rollback the transaction
            await this.rollbackTransaction(transactionId);
            throw error;
        }
    }

    /**
     * Rolls back a transaction
     */
    async rollbackTransaction(transactionId: string): Promise<void> {
        try {
            // Get the transaction operations
            const transaction = this.transactionManager.getTransaction(transactionId);
            if (!transaction) {
                this.logger.warn('No transaction found to rollback', { transactionId });
                return;
            }

            // Create a copy of operations array and reverse it
            const operations = [...transaction.operations].reverse();

            // Rollback operations in reverse order
            for (const operation of operations) {
                switch (operation.type) {
                    case 'add':
                        // Remove added task
                        this.indexManager.unindexTask(operation.task);
                        await this.indexManager.unindexDependencies(operation.task);
                        this.cacheManager.delete(operation.task.id);
                        break;
                    case 'update':
                        if (operation.previousState) {
                            // Restore previous state
                            this.indexManager.unindexTask(operation.task);
                            this.indexManager.indexTask(operation.previousState);
                            await this.indexManager.indexDependencies(operation.previousState);
                            this.cacheManager.set(operation.previousState.id, operation.previousState);
                        }
                        break;
                    case 'remove':
                        // Restore removed task
                        this.indexManager.indexTask(operation.task);
                        await this.indexManager.indexDependencies(operation.task);
                        this.cacheManager.set(operation.task.id, operation.task);
                        break;
                }
            }

            await this.transactionManager.rollbackTransaction(transactionId);
        } catch (error) {
            this.logger.error('Failed to rollback transaction', {
                transactionId,
                error
            });
            throw createError(
                ErrorCodes.OPERATION_FAILED,
                {
                    message: 'Transaction rollback failed',
                    transactionId,
                    error
                }
            );
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
