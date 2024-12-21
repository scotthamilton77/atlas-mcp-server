/**
 * Task Status Manager
 * 
 * Handles task status transitions and propagation, including:
 * - Status transition validation with rollback
 * - Parent status updates with deadlock prevention
 * - Child status propagation with race condition handling
 * - Status dependency enforcement with transaction support
 * - Automatic dependency-based blocking
 */

import { Task, TaskStatus } from '../../types/task.js';
import { TaskError, ErrorCodes } from '../../errors/index.js';
import { DependencyValidator } from './dependency-validator.js';
import { Logger } from '../../logging/index.js';
import { generateShortId } from '../../utils/id-generator.js';

interface StatusUpdate {
    taskPath: string;
    oldStatus: TaskStatus;
    newStatus: TaskStatus;
    timestamp: number;
}

interface StatusTransaction {
    id: string;
    updates: StatusUpdate[];
    timestamp: number;
}

type CompletedOrFailed = TaskStatus.COMPLETED | TaskStatus.FAILED;
type PendingOrInProgress = TaskStatus.PENDING | TaskStatus.IN_PROGRESS;
type GetTaskByPath = (path: string) => Promise<Task | null>;

// Status transition guidance for error messages
const STATUS_TRANSITION_GUIDE: Record<TaskStatus, Partial<Record<TaskStatus, string>>> = {
    [TaskStatus.PENDING]: {
        [TaskStatus.IN_PROGRESS]: "Begin task execution",
        [TaskStatus.BLOCKED]: "Set blocked state due to dependencies"
    },
    [TaskStatus.IN_PROGRESS]: {
        [TaskStatus.COMPLETED]: "Set completion state",
        [TaskStatus.FAILED]: "Set failed state due to execution errors",
        [TaskStatus.BLOCKED]: "Set blocked state due to dependencies"
    },
    [TaskStatus.COMPLETED]: {
        [TaskStatus.FAILED]: "Set failed state after validation errors"
    },
    [TaskStatus.FAILED]: {
        [TaskStatus.IN_PROGRESS]: "Retry task execution"
    },
    [TaskStatus.BLOCKED]: {
        [TaskStatus.IN_PROGRESS]: "Resume execution after dependency resolution",
        [TaskStatus.FAILED]: "Set failed state due to unresolvable dependencies"
    }
};

export class StatusManager {
    private dependencyValidator: DependencyValidator;
    private logger: Logger;
    private transactions: Map<string, StatusTransaction>;
    private processingTasks: Map<string, { timestamp: number; retryCount: number }>;
    private readonly LOCK_TIMEOUT = 1000; // Reduced to 1 second
    private readonly MAX_RETRIES = 3;
    private readonly RETRY_DELAY = 200; // 200ms between retries

    constructor() {
        this.dependencyValidator = new DependencyValidator();
        this.logger = Logger.getInstance().child({ component: 'StatusManager' });
        this.transactions = new Map();
        this.processingTasks = new Map();

        // Cleanup stale locks periodically
        setInterval(() => this.cleanupStaleLocks(), this.LOCK_TIMEOUT);
    }

    /**
     * Cleanup stale locks
     */
    private cleanupStaleLocks(): void {
        const now = Date.now();
        for (const [taskId, { timestamp }] of this.processingTasks.entries()) {
            if (now - timestamp > this.LOCK_TIMEOUT) {
                this.processingTasks.delete(taskId);
                this.logger.warn('Cleaned up stale lock', { taskId });
            }
        }
    }

    /**
     * Determines if a task should be blocked based on dependencies
     * Updated to handle bulk operations and dependency states
     */
    async isBlocked(
        task: Task, 
        getTaskByPath: GetTaskByPath,
        context: { isBulkOperation?: boolean } = {}
    ): Promise<{ blocked: boolean; reason?: string }> {
        // Don't block completed or failed tasks
        if (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.FAILED) {
            return { blocked: false };
        }

        if (task.dependencies.length === 0) {
            return { blocked: false };
        }

        const depTasks = await Promise.all(task.dependencies.map(depPath => getTaskByPath(depPath)));
        
        // In bulk operations, only block if dependencies have failed
        if (context.isBulkOperation) {
            const hasFailedDeps = depTasks.some(depTask => depTask?.status === TaskStatus.FAILED);
            return {
                blocked: hasFailedDeps,
                reason: hasFailedDeps ? 'One or more dependencies have failed' : undefined
            };
        }

        // For completion, all dependencies must be completed
        if (task.status === TaskStatus.IN_PROGRESS) {
            const incompleteDeps = depTasks.filter(
                depTask => !depTask || depTask.status !== TaskStatus.COMPLETED
            );
            if (incompleteDeps.length > 0) {
                return {
                    blocked: true,
                    reason: `Dependencies not completed: ${incompleteDeps.map(d => d?.path).join(', ')}`
                };
            }
        }

        // For other transitions, block if any dependency has failed
        const failedDeps = depTasks.filter(depTask => depTask?.status === TaskStatus.FAILED);
        if (failedDeps.length > 0) {
            return {
                blocked: true,
                reason: `Failed dependencies: ${failedDeps.map(d => d?.path).join(', ')}`
            };
        }

        return { blocked: false };
    }

    /**
     * Validates and processes a status transition with rollback support
     * @param isBulkOperation Set to true to enable bulk operation mode with relaxed transition rules
     */
    async validateAndProcessStatusChange(
        task: Task,
        newStatus: TaskStatus,
        getTaskByPath: GetTaskByPath,
        updateTask: (path: string, updates: { status: TaskStatus }) => Promise<void>,
        isBulkOperation: boolean = false
    ): Promise<void> {
        const transactionId = generateShortId();
        this.transactions.set(transactionId, {
            id: transactionId,
            updates: [],
            timestamp: Date.now()
        });

        try {
            // Try to acquire lock with retries
            await this.acquireLockWithRetry(task.path);

            // Check if task should be automatically blocked
            const { blocked, reason } = await this.isBlocked(task, getTaskByPath, { isBulkOperation });
            if (blocked && newStatus !== TaskStatus.BLOCKED) {
                throw new TaskError(
                    ErrorCodes.TASK_STATUS,
                    'Task is blocked by dependencies',
                    {
                        path: task.path,
                        currentStatus: task.status,
                        requestedStatus: newStatus,
                        reason,
                        suggestion: reason || 'Resolve dependency issues before proceeding'
                    }
                );
            }

            // Validate the transition with bulk operation context
            await this.validateStatusTransition(task, newStatus, getTaskByPath, { isBulkOperation });

            // Process status change effects
            await this.propagateStatusChange(
                task,
                newStatus,
                getTaskByPath,
                updateTask,
                transactionId
            );

            // Commit transaction
            await this.commitTransaction(transactionId, updateTask);
        } catch (error) {
            // Rollback on error
            await this.rollbackTransaction(transactionId, updateTask);
            throw error;
        } finally {
            // Release lock
            this.releaseLock(task.path);
            this.transactions.delete(transactionId);
        }
    }

    /**
     * Acquires a lock for a task with retries
     */
    private async acquireLockWithRetry(taskPath: string): Promise<void> {
        let retryCount = 0;
        while (retryCount < this.MAX_RETRIES) {
            try {
                await this.acquireLock(taskPath);
                return;
            } catch (error) {
                retryCount++;
                if (retryCount === this.MAX_RETRIES) {
                    throw error;
                }
                await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
            }
        }
    }

    /**
     * Acquires a lock for a task
     */
    private async acquireLock(taskPath: string): Promise<void> {
        const taskLock = this.processingTasks.get(taskPath);
        if (taskLock) {
            const timeSinceLock = Date.now() - taskLock.timestamp;
            if (timeSinceLock < this.LOCK_TIMEOUT) {
                throw new TaskError(
                    ErrorCodes.OPERATION_FAILED,
                    'Task is currently being updated by another operation. Please try again shortly.',
                    {
                        path: taskPath,
                        timeout: this.LOCK_TIMEOUT - timeSinceLock,
                        retryAfter: Math.ceil((this.LOCK_TIMEOUT - timeSinceLock) / 1000),
                        suggestion: 'Retry operation after lock expiration'
                    }
                );
            }
            // Lock has expired, clean it up
            this.processingTasks.delete(taskPath);
        }
        this.processingTasks.set(taskPath, { timestamp: Date.now(), retryCount: 0 });
    }

    /**
     * Releases a lock for a task
     */
    private releaseLock(taskPath: string): void {
        this.processingTasks.delete(taskPath);
    }

    /**
     * Validates a status transition with support for bulk operations
     */
    private async validateStatusTransition(
        task: Task,
        newStatus: TaskStatus,
        getTaskByPath: GetTaskByPath,
        context: { isBulkOperation?: boolean } = {}
    ): Promise<void> {
        const isCompletedOrFailed = (status: TaskStatus): status is CompletedOrFailed => 
            status === TaskStatus.COMPLETED || status === TaskStatus.FAILED;
        
        const isPendingOrInProgress = (status: TaskStatus): status is PendingOrInProgress =>
            status === TaskStatus.PENDING || status === TaskStatus.IN_PROGRESS;

        // Special handling for bulk operations
        if (context.isBulkOperation) {
            // Allow direct completion in bulk operations when dependencies are satisfied
            if (newStatus === TaskStatus.COMPLETED) {
                const depTasks = await Promise.all(task.dependencies.map(depPath => getTaskByPath(depPath)));
                const dependenciesSatisfied = depTasks.every(depTask => depTask && depTask.status === TaskStatus.COMPLETED);

                if (dependenciesSatisfied) {
                    // Skip normal transition rules for bulk completion
                    return;
                }
            }

            // Allow resetting tasks in bulk operations
            if (newStatus === TaskStatus.PENDING) {
                return;
            }
        }

        // Allow reverting completed/failed tasks in bulk operations
        if (!context.isBulkOperation && isCompletedOrFailed(task.status) && isPendingOrInProgress(newStatus)) {
            throw new TaskError(
                ErrorCodes.TASK_STATUS,
                'Invalid status transition: Cannot revert completed or failed tasks to pending or in_progress state',
                { 
                    path: task.path, 
                    currentStatus: task.status, 
                    newStatus,
                    suggestion: 'Create new task for retry operations - completed/failed states are terminal'
                }
            );
        }

        // Validate dependencies for status transition
        if (!context.isBulkOperation) {
            await this.dependencyValidator.validateDependenciesForStatus(task, newStatus, getTaskByPath);
        }

        // Check dependencies and subtasks for completion
        if (newStatus === TaskStatus.COMPLETED && !context.isBulkOperation) {
            // Validate dependencies
            await this.dependencyValidator.validateDependenciesForCompletion(task, getTaskByPath);

            // Check subtasks for completion
            const subtasks = await Promise.all(task.subtasks.map(path => getTaskByPath(path)));
            const incompleteSubtasks = subtasks.filter(subtask => !subtask || subtask.status !== TaskStatus.COMPLETED);

            if (incompleteSubtasks.length > 0) {
                throw new TaskError(
                    ErrorCodes.TASK_STATUS,
                    'Cannot complete task: Some subtasks are still incomplete',
                    { 
                        path: task.path,
                        incompleteSubtasks: incompleteSubtasks.map(t => ({
                            path: t?.path,
                            status: t?.status,
                            name: t?.name
                        })),
                        suggestion: 'Parent completion requires all subtasks to be in completed state'
                    }
                );
            }
        }

        // Validate status transition based on current status
        this.validateStatusTransitionRules(task.status, newStatus, { 
            path: task.path,
            hasSubtasks: task.subtasks.length > 0,
            hasDependencies: task.dependencies.length > 0,
            isBulkOperation: context.isBulkOperation
        });
    }

    /**
     * Validates status transition rules with enhanced flexibility for bulk operations
     */
    private validateStatusTransitionRules(
        currentStatus: TaskStatus,
        newStatus: TaskStatus,
        context: { path: string; hasSubtasks: boolean; hasDependencies: boolean; isBulkOperation?: boolean } = { 
            path: 'unknown',
            hasSubtasks: false,
            hasDependencies: false,
            isBulkOperation: false
        }
    ): void {
        // Enhanced state machine with special handling for bulk operations
        const stateMachine: Record<TaskStatus, {
            allowedTransitions: Set<TaskStatus>;
            bulkAllowedTransitions?: Set<TaskStatus>; // Additional transitions allowed in bulk operations
            conditions?: (ctx: typeof context) => { allowed: boolean; reason?: string };
        }> = {
            [TaskStatus.PENDING]: {
                allowedTransitions: new Set([
                    TaskStatus.IN_PROGRESS,
                    TaskStatus.BLOCKED,
                    TaskStatus.FAILED,
                    TaskStatus.COMPLETED // Allow direct completion always
                ]),
                conditions: (ctx): { allowed: boolean; reason?: string } => {
                    // In bulk operations, allow any transition
                    if (ctx.isBulkOperation) {
                        return { allowed: true };
                    }
                    // For non-bulk operations, enforce normal rules
                    const allowed = !ctx.hasDependencies || newStatus === TaskStatus.BLOCKED || newStatus === TaskStatus.IN_PROGRESS;
                    const reason = ctx.hasDependencies ? 'Task has dependencies and must be blocked first' : undefined;
                    return { allowed, reason };
                }
            },
            [TaskStatus.IN_PROGRESS]: {
                allowedTransitions: new Set([
                    TaskStatus.COMPLETED,
                    TaskStatus.FAILED,
                    TaskStatus.BLOCKED,
                    TaskStatus.PENDING
                ]),
                conditions: (ctx): { allowed: boolean; reason?: string } => {
                    const allowed = (newStatus !== TaskStatus.COMPLETED || !ctx.hasSubtasks) || Boolean(ctx.isBulkOperation);
                    const reason = ctx.hasSubtasks && !ctx.isBulkOperation ? 'Cannot complete task with incomplete subtasks' : undefined;
                    return { allowed, reason };
                }
            },
            [TaskStatus.COMPLETED]: {
                allowedTransitions: new Set([
                    TaskStatus.FAILED,
                    TaskStatus.IN_PROGRESS
                ]),
                bulkAllowedTransitions: new Set([
                    TaskStatus.PENDING // Allow resetting in bulk operations
                ])
            },
            [TaskStatus.FAILED]: {
                allowedTransitions: new Set([
                    TaskStatus.IN_PROGRESS,
                    TaskStatus.PENDING
                ]),
                bulkAllowedTransitions: new Set([
                    TaskStatus.COMPLETED // Allow direct completion in bulk operations
                ])
            },
            [TaskStatus.BLOCKED]: {
                allowedTransitions: new Set([
                    TaskStatus.IN_PROGRESS,
                    TaskStatus.FAILED,
                    TaskStatus.PENDING
                ]),
                bulkAllowedTransitions: new Set([
                    TaskStatus.COMPLETED // Allow direct completion in bulk operations
                ]),
                conditions: (ctx): { allowed: boolean; reason?: string } => {
                    const allowed = (newStatus !== TaskStatus.IN_PROGRESS || !ctx.hasDependencies) || Boolean(ctx.isBulkOperation);
                    const reason = ctx.hasDependencies && !ctx.isBulkOperation ? 'Cannot start blocked task with incomplete dependencies' : undefined;
                    return { allowed, reason };
                }
            }
        };

        const stateConfig = stateMachine[currentStatus];
        const allowedTransitions = new Set([
            ...Array.from(stateConfig?.allowedTransitions || []),
            ...(context.isBulkOperation ? Array.from(stateConfig?.bulkAllowedTransitions || []) : [])
        ]);

        if (!allowedTransitions.has(newStatus)) {
            const allowedStates = Array.from(allowedTransitions);
            const guidance = allowedStates.map(state => {
                const guide = STATUS_TRANSITION_GUIDE[currentStatus]?.[state];
                return `${state}: ${guide || 'No specific guidance available'}`;
            });

            throw new TaskError(
                ErrorCodes.TASK_STATUS,
                'Invalid status transition',
                {
                    path: context.path,
                    currentStatus,
                    newStatus,
                    allowedTransitions: allowedStates,
                    guidance,
                    suggestion: `Consider these valid transitions from '${currentStatus}' status:\n${guidance.join('\n')}`
                }
            );
        }

        // Check additional conditions if they exist
        if (stateConfig.conditions) {
            const { allowed, reason } = stateConfig.conditions(context);
            if (!allowed) {
                throw new TaskError(
                    ErrorCodes.TASK_STATUS,
                    'Status transition condition failed',
                    {
                        path: context.path,
                        currentStatus,
                        newStatus,
                        reason,
                        suggestion: reason
                    }
                );
            }
        }
    }

    /**
     * Propagates status changes through task hierarchy with optimized locking
     */
    private async propagateStatusChange(
        task: Task,
        newStatus: TaskStatus,
        getTaskByPath: GetTaskByPath,
        updateTask: (path: string, updates: { status: TaskStatus }) => Promise<void>,
        transactionId: string
    ): Promise<void> {
        const transaction = this.transactions.get(transactionId)!;

        // Record status update
        transaction.updates.push({
            taskPath: task.path,
            oldStatus: task.status,
            newStatus,
            timestamp: Date.now()
        });

        // Update dependent tasks if task is being deleted or failed
        if (newStatus === TaskStatus.FAILED || task.status === TaskStatus.COMPLETED) {
            const dependentTasks = await this.getDependentTasks(task.path, getTaskByPath);
            await Promise.all(dependentTasks.map(async depTask => {
                if (depTask.status !== TaskStatus.BLOCKED && depTask.status !== TaskStatus.FAILED) {
                    try {
                        await this.acquireLockWithRetry(depTask.path);
                        await this.propagateStatusChange(
                            depTask,
                            TaskStatus.BLOCKED,
                            getTaskByPath,
                            updateTask,
                            transactionId
                        );
                    } finally {
                        this.releaseLock(depTask.path);
                    }
                }
            }));
        }

        // Update parent status if needed
        if (task.parentPath) {
            const parent = await getTaskByPath(task.parentPath);
            if (parent) {
                try {
                    await this.acquireLockWithRetry(parent.path);
                    const siblingTasks = await Promise.all(parent.subtasks.map(path => getTaskByPath(path)));
                    const siblings = siblingTasks.filter((t): t is Task => t !== null);

                    const newParentStatus = this.computeParentStatus(siblings, newStatus);
                    if (newParentStatus && newParentStatus !== parent.status) {
                        await this.propagateStatusChange(
                            parent,
                            newParentStatus,
                            getTaskByPath,
                            updateTask,
                            transactionId
                        );
                    }
                } finally {
                    this.releaseLock(parent.path);
                }
            }
        }

        // Update subtask status if needed
        if (newStatus === TaskStatus.BLOCKED) {
            await Promise.all(task.subtasks.map(async subtaskPath => {
                const subtask = await getTaskByPath(subtaskPath);
                if (subtask && subtask.status !== TaskStatus.BLOCKED) {
                    try {
                        await this.acquireLockWithRetry(subtaskPath);
                        await this.propagateStatusChange(
                            subtask,
                            TaskStatus.BLOCKED,
                            getTaskByPath,
                            updateTask,
                            transactionId
                        );
                    } finally {
                        this.releaseLock(subtaskPath);
                    }
                }
            }));
        }
    }

    /**
     * Gets tasks that depend on a given task
     */
    private async getDependentTasks(taskPath: string, getTaskByPath: GetTaskByPath): Promise<Task[]> {
        const taskPaths = Array.from(this.processingTasks.keys());
        const tasks = await Promise.all(taskPaths.map(path => getTaskByPath(path)));
        const validTasks = tasks.filter((t): t is Task => t !== null);
            
        return validTasks.filter(task => task.dependencies.includes(taskPath));
    }

    /**
     * Computes the appropriate parent status based on child statuses
     */
    private computeParentStatus(
        children: Task[],
        updatedChildStatus: TaskStatus
    ): TaskStatus | null {
        const statuses = new Set(children.map(c => c.status));
        statuses.add(updatedChildStatus);

        // Only update parent status in specific cases:
        
        // All completed -> completed
        if (Array.from(statuses).every(s => s === TaskStatus.COMPLETED)) {
            return TaskStatus.COMPLETED;
        }

        // All failed -> failed (don't propagate individual failures)
        if (Array.from(statuses).every(s => s === TaskStatus.FAILED)) {
            return TaskStatus.FAILED;
        }

        // All blocked -> blocked (don't propagate individual blocks)
        if (Array.from(statuses).every(s => s === TaskStatus.BLOCKED)) {
            return TaskStatus.BLOCKED;
        }

        // Don't automatically change parent status for in_progress
        // Let parent status be explicitly set
        return null;
    }

    /**
     * Commits a status transaction
     */
    private async commitTransaction(
        transactionId: string,
        updateTask: (path: string, updates: { status: TaskStatus }) => Promise<void>
    ): Promise<void> {
        const transaction = this.transactions.get(transactionId);
        if (!transaction) {
            throw new TaskError(
                ErrorCodes.OPERATION_FAILED,
                'Transaction not found - status update failed',
                { 
                    transactionId,
                    suggestion: 'Retry the status update operation'
                }
            );
        }

        // Apply all updates in order
        for (const update of transaction.updates) {
            await updateTask(update.taskPath, { status: update.newStatus });
        }
    }

    /**
     * Rolls back a status transaction
     */
    private async rollbackTransaction(
        transactionId: string,
        updateTask: (path: string, updates: { status: TaskStatus }) => Promise<void>
    ): Promise<void> {
        const transaction = this.transactions.get(transactionId);
        if (!transaction) {
            return;
        }

        // Rollback updates in reverse order
        for (const update of transaction.updates.reverse()) {
            try {
                await updateTask(update.taskPath, { status: update.oldStatus });
            } catch (error) {
                this.logger.error('Failed to rollback status update', {
                    transactionId,
                    path: update.taskPath,
                    error,
                    suggestion: 'Manual intervention may be required to restore task status'
                });
            }
        }
    }

    /**
     * Gets the computed status for a task based on its subtasks
     */
    async computeStatus(task: Task, getTaskByPath: GetTaskByPath): Promise<TaskStatus> {
        const subtaskTasks = await Promise.all(task.subtasks.map(path => getTaskByPath(path)));
        const subtasks = subtaskTasks.filter((t): t is Task => t !== null);

        if (subtasks.length === 0) {
            return task.status;
        }

        return this.computeParentStatus(subtasks, task.status) || task.status;
    }
}
