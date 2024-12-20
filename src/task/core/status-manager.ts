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
    taskId: string;
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

// Status transition guidance for error messages
const STATUS_TRANSITION_GUIDE: Record<TaskStatus, Partial<Record<TaskStatus, string>>> = {
    [TaskStatus.PENDING]: {
        [TaskStatus.IN_PROGRESS]: "Start work on the task",
        [TaskStatus.BLOCKED]: "Mark as blocked by dependencies"
    },
    [TaskStatus.IN_PROGRESS]: {
        [TaskStatus.COMPLETED]: "Mark work as completed",
        [TaskStatus.FAILED]: "Mark task as failed due to issues",
        [TaskStatus.BLOCKED]: "Mark as blocked by dependencies"
    },
    [TaskStatus.COMPLETED]: {
        [TaskStatus.FAILED]: "Mark as failed after verification issues"
    },
    [TaskStatus.FAILED]: {
        [TaskStatus.IN_PROGRESS]: "Retry the failed task"
    },
    [TaskStatus.BLOCKED]: {
        [TaskStatus.IN_PROGRESS]: "Resume work after resolving blockers",
        [TaskStatus.FAILED]: "Mark as failed due to unresolvable blockers"
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
     * Updated to allow parallel work and only block completion
     */
    isBlocked(task: Task, getTaskById: (id: string) => Task | null): boolean {
        // Don't block completed or failed tasks
        if (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.FAILED) {
            return false;
        }

        // Only enforce strict dependency checking for completion
        if (task.status === TaskStatus.IN_PROGRESS && task.dependencies.length > 0) {
            // Allow parallel work unless dependencies have failed
            return task.dependencies.some(depId => {
                const depTask = getTaskById(depId);
                return !depTask || depTask.status === TaskStatus.FAILED;
            });
        }

        // For all other cases, no blocking
        return false;
    }

    /**
     * Validates and processes a status transition with rollback support
     */
    async validateAndProcessStatusChange(
        task: Task,
        newStatus: TaskStatus,
        getTaskById: (id: string) => Task | null,
        updateTask: (taskId: string, updates: { status: TaskStatus }) => Promise<void>
    ): Promise<void> {
        const transactionId = generateShortId();
        this.transactions.set(transactionId, {
            id: transactionId,
            updates: [],
            timestamp: Date.now()
        });

        try {
            // Try to acquire lock with retries
            await this.acquireLockWithRetry(task.id);

            // Check if task should be automatically blocked
            if (this.isBlocked(task, getTaskById) && newStatus !== TaskStatus.BLOCKED) {
                throw new TaskError(
                    ErrorCodes.TASK_STATUS,
                    'Task is blocked by incomplete dependencies',
                    {
                        taskId: task.id,
                        currentStatus: task.status,
                        requestedStatus: newStatus,
                        suggestion: 'Complete all dependencies before proceeding'
                    }
                );
            }

            // Validate the transition
            await this.validateStatusTransition(task, newStatus, getTaskById);

            // Process status change effects
            await this.propagateStatusChange(
                task,
                newStatus,
                getTaskById,
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
            this.releaseLock(task.id);
            this.transactions.delete(transactionId);
        }
    }

    /**
     * Acquires a lock for a task with retries
     */
    private async acquireLockWithRetry(taskId: string): Promise<void> {
        let retryCount = 0;
        while (retryCount < this.MAX_RETRIES) {
            try {
                await this.acquireLock(taskId);
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
    private async acquireLock(taskId: string): Promise<void> {
        const taskLock = this.processingTasks.get(taskId);
        if (taskLock) {
            const timeSinceLock = Date.now() - taskLock.timestamp;
            if (timeSinceLock < this.LOCK_TIMEOUT) {
                throw new TaskError(
                    ErrorCodes.OPERATION_FAILED,
                    'Task is currently being updated by another operation. Please try again shortly.',
                    {
                        taskId,
                        timeout: this.LOCK_TIMEOUT - timeSinceLock,
                        retryAfter: Math.ceil((this.LOCK_TIMEOUT - timeSinceLock) / 1000),
                        suggestion: 'Wait a moment and retry the operation'
                    }
                );
            }
            // Lock has expired, clean it up
            this.processingTasks.delete(taskId);
        }
        this.processingTasks.set(taskId, { timestamp: Date.now(), retryCount: 0 });
    }

    /**
     * Releases a lock for a task
     */
    private releaseLock(taskId: string): void {
        this.processingTasks.delete(taskId);
    }

    /**
     * Validates a status transition
     */
    private async validateStatusTransition(
        task: Task,
        newStatus: TaskStatus,
        getTaskById: (id: string) => Task | null
    ): Promise<void> {
        // Cannot transition from completed/failed to pending/in_progress
        const isCompletedOrFailed = (status: TaskStatus): status is CompletedOrFailed => 
            status === TaskStatus.COMPLETED || status === TaskStatus.FAILED;
        
        const isPendingOrInProgress = (status: TaskStatus): status is PendingOrInProgress =>
            status === TaskStatus.PENDING || status === TaskStatus.IN_PROGRESS;

        if (isCompletedOrFailed(task.status) && isPendingOrInProgress(newStatus)) {
            throw new TaskError(
                ErrorCodes.TASK_STATUS,
                'Invalid status transition: Cannot revert completed or failed tasks to pending or in_progress state',
                { 
                    taskId: task.id, 
                    currentStatus: task.status, 
                    newStatus,
                    suggestion: 'Create a new task instead of reverting a completed/failed task'
                }
            );
        }

        // Validate dependencies for status transition
        await this.dependencyValidator.validateDependenciesForStatus(task, newStatus, getTaskById);

        // Check dependencies for completion
        if (newStatus === TaskStatus.COMPLETED) {
            // Validate dependencies
            await this.dependencyValidator.validateDependenciesForCompletion(task, getTaskById);

            // Check subtasks for completion
            const incompleteSubtasks = task.subtasks
                .map(id => getTaskById(id))
                .filter(subtask => !subtask || subtask.status !== TaskStatus.COMPLETED);

            if (incompleteSubtasks.length > 0) {
                throw new TaskError(
                    ErrorCodes.TASK_STATUS,
                    'Cannot complete task: Some subtasks are still incomplete',
                    { 
                        taskId: task.id,
                        incompleteSubtasks: incompleteSubtasks.map(t => ({
                            id: t?.id,
                            status: t?.status,
                            name: t?.name
                        })),
                        suggestion: 'Complete all subtasks before marking the parent task as completed'
                    }
                );
            }
        }

        // Validate status transition based on current status
        this.validateStatusTransitionRules(task.status, newStatus);
    }

    /**
     * Validates status transition rules with more flexible transitions
     */
    private validateStatusTransitionRules(
        currentStatus: TaskStatus,
        newStatus: TaskStatus
    ): void {
        const allowedTransitions: Record<TaskStatus, Set<TaskStatus>> = {
            [TaskStatus.PENDING]: new Set([
                TaskStatus.IN_PROGRESS,
                TaskStatus.BLOCKED,
                TaskStatus.FAILED // Allow direct failure from pending
            ]),
            [TaskStatus.IN_PROGRESS]: new Set([
                TaskStatus.COMPLETED,
                TaskStatus.FAILED,
                TaskStatus.BLOCKED,
                TaskStatus.PENDING // Allow reverting to pending if needed
            ]),
            [TaskStatus.COMPLETED]: new Set([
                TaskStatus.FAILED, // Allow marking as failed after completion
                TaskStatus.IN_PROGRESS // Allow reopening if needed
            ]),
            [TaskStatus.FAILED]: new Set([
                TaskStatus.IN_PROGRESS, // Allow retry
                TaskStatus.PENDING // Allow reset
            ]),
            [TaskStatus.BLOCKED]: new Set([
                TaskStatus.IN_PROGRESS,
                TaskStatus.FAILED,
                TaskStatus.PENDING // Allow reset when unblocked
            ])
        };

        if (!allowedTransitions[currentStatus]?.has(newStatus)) {
            const allowedStates = Array.from(allowedTransitions[currentStatus] || []);
            const guidance = allowedStates.map(state => {
                const guide = STATUS_TRANSITION_GUIDE[currentStatus]?.[state];
                return `${state}: ${guide || 'No specific guidance available'}`;
            });

            throw new TaskError(
                ErrorCodes.TASK_STATUS,
                'Invalid status transition',
                {
                    currentStatus,
                    newStatus,
                    allowedTransitions: allowedStates,
                    guidance,
                    suggestion: `Consider these valid transitions from '${currentStatus}' status:\n${guidance.join('\n')}`
                }
            );
        }
    }

    /**
     * Propagates status changes through task hierarchy with optimized locking
     */
    private async propagateStatusChange(
        task: Task,
        newStatus: TaskStatus,
        getTaskById: (id: string) => Task | null,
        updateTask: (taskId: string, updates: { status: TaskStatus }) => Promise<void>,
        transactionId: string
    ): Promise<void> {
        const transaction = this.transactions.get(transactionId)!;

        // Record status update
        transaction.updates.push({
            taskId: task.id,
            oldStatus: task.status,
            newStatus,
            timestamp: Date.now()
        });

        // Update dependent tasks if task is being deleted or failed
        if (newStatus === TaskStatus.FAILED || task.status === TaskStatus.COMPLETED) {
            const dependentTasks = this.getDependentTasks(task.id, getTaskById);
            await Promise.all(dependentTasks.map(async depTask => {
                if (depTask.status !== TaskStatus.BLOCKED && depTask.status !== TaskStatus.FAILED) {
                    try {
                        await this.acquireLockWithRetry(depTask.id);
                        await this.propagateStatusChange(
                            depTask,
                            TaskStatus.BLOCKED,
                            getTaskById,
                            updateTask,
                            transactionId
                        );
                    } finally {
                        this.releaseLock(depTask.id);
                    }
                }
            }));
        }

        // Update parent status if needed
        if (task.parentId && !task.parentId.startsWith('ROOT-')) {
            const parent = getTaskById(task.parentId);
            if (parent) {
                try {
                    await this.acquireLockWithRetry(parent.id);
                    const siblings = parent.subtasks
                        .map(id => getTaskById(id))
                        .filter((t): t is Task => t !== null);

                    const newParentStatus = this.computeParentStatus(siblings, newStatus);
                    if (newParentStatus && newParentStatus !== parent.status) {
                        await this.propagateStatusChange(
                            parent,
                            newParentStatus,
                            getTaskById,
                            updateTask,
                            transactionId
                        );
                    }
                } finally {
                    this.releaseLock(parent.id);
                }
            }
        }

        // Update subtask status if needed
        if (newStatus === TaskStatus.BLOCKED) {
            await Promise.all(task.subtasks.map(async subtaskId => {
                const subtask = getTaskById(subtaskId);
                if (subtask && subtask.status !== TaskStatus.BLOCKED) {
                    try {
                        await this.acquireLockWithRetry(subtaskId);
                        await this.propagateStatusChange(
                            subtask,
                            TaskStatus.BLOCKED,
                            getTaskById,
                            updateTask,
                            transactionId
                        );
                    } finally {
                        this.releaseLock(subtaskId);
                    }
                }
            }));
        }
    }

    /**
     * Gets tasks that depend on a given task
     */
    private getDependentTasks(taskId: string, getTaskById: (id: string) => Task | null): Task[] {
        const allTasks = Array.from(this.processingTasks.keys())
            .map(id => getTaskById(id))
            .filter((t): t is Task => t !== null);
            
        return allTasks.filter(task => task.dependencies.includes(taskId));
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
        updateTask: (taskId: string, updates: { status: TaskStatus }) => Promise<void>
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
            await updateTask(update.taskId, { status: update.newStatus });
        }
    }

    /**
     * Rolls back a status transaction
     */
    private async rollbackTransaction(
        transactionId: string,
        updateTask: (taskId: string, updates: { status: TaskStatus }) => Promise<void>
    ): Promise<void> {
        const transaction = this.transactions.get(transactionId);
        if (!transaction) {
            return;
        }

        // Rollback updates in reverse order
        for (const update of transaction.updates.reverse()) {
            try {
                await updateTask(update.taskId, { status: update.oldStatus });
            } catch (error) {
                this.logger.error('Failed to rollback status update', {
                    transactionId,
                    taskId: update.taskId,
                    error,
                    suggestion: 'Manual intervention may be required to restore task status'
                });
            }
        }
    }

    /**
     * Gets the computed status for a task based on its subtasks
     */
    computeStatus(task: Task, getTaskById: (id: string) => Task | null): TaskStatus {
        const subtasks = task.subtasks
            .map(id => getTaskById(id))
            .filter((t): t is Task => t !== null);

        if (subtasks.length === 0) {
            return task.status;
        }

        return this.computeParentStatus(subtasks, task.status) || task.status;
    }
}
