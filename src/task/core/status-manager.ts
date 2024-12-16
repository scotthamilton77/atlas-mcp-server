/**
 * Task Status Manager
 * 
 * Handles task status transitions and propagation, including:
 * - Status transition validation
 * - Parent status updates
 * - Child status propagation
 * - Status dependency enforcement
 */

import { Task, TaskStatus, TaskStatuses } from '../../types/task.js';
import { TaskError, ErrorCodes } from '../../errors/index.js';
import { DependencyValidator } from './dependency-validator.js';

export class StatusManager {
    private dependencyValidator: DependencyValidator;

    constructor() {
        this.dependencyValidator = new DependencyValidator();
    }

    /**
     * Validates and processes a status transition
     * 
     * @param task - Task to update
     * @param newStatus - New status to transition to
     * @param getTaskById - Function to retrieve a task by ID
     * @param updateTask - Function to update a task
     * @throws {TaskError} If status transition is invalid
     */
    async validateAndProcessStatusChange(
        task: Task,
        newStatus: TaskStatus,
        getTaskById: (id: string) => Task | null,
        updateTask: (taskId: string, updates: { status: TaskStatus }) => Promise<void>
    ): Promise<void> {
        // Validate the transition
        await this.validateStatusTransition(task, newStatus, getTaskById);

        // Process status change effects
        await this.propagateStatusChange(task, newStatus, getTaskById, updateTask);
    }

    /**
     * Validates a status transition
     * 
     * @param task - Task to validate
     * @param newStatus - New status to transition to
     * @param getTaskById - Function to retrieve a task by ID
     * @throws {TaskError} If status transition is invalid
     */
    private async validateStatusTransition(
        task: Task,
        newStatus: TaskStatus,
        getTaskById: (id: string) => Task | null
    ): Promise<void> {
        // Cannot transition from completed/failed to pending/in_progress
        if (
            (task.status === TaskStatuses.COMPLETED || task.status === TaskStatuses.FAILED) &&
            (newStatus === TaskStatuses.PENDING || newStatus === TaskStatuses.IN_PROGRESS)
        ) {
            throw new TaskError(
                ErrorCodes.TASK_STATUS,
                'Cannot transition from completed/failed to pending/in_progress'
            );
        }

        // Check dependencies for completion
        if (newStatus === TaskStatuses.COMPLETED) {
            // Validate dependencies
            await this.dependencyValidator.validateDependenciesForCompletion(task, getTaskById);

            // Check subtasks for completion
            for (const subtaskId of task.subtasks) {
                const subtask = getTaskById(subtaskId);
                if (!subtask || subtask.status !== TaskStatuses.COMPLETED) {
                    throw new TaskError(
                        ErrorCodes.TASK_STATUS,
                        'Cannot complete task with incomplete subtasks'
                    );
                }
            }
        }
    }

    /**
     * Propagates status changes through task hierarchy
     * 
     * @param task - Task with updated status
     * @param newStatus - New status
     * @param getTaskById - Function to retrieve a task by ID
     * @param updateTask - Function to update a task
     */
    private async propagateStatusChange(
        task: Task,
        newStatus: TaskStatus,
        getTaskById: (id: string) => Task | null,
        updateTask: (taskId: string, updates: { status: TaskStatus }) => Promise<void>
    ): Promise<void> {
        // Update parent status if needed
        if (!task.parentId.startsWith('ROOT-')) {
            const parent = getTaskById(task.parentId);
            if (parent) {
                const siblings = parent.subtasks
                    .map(id => getTaskById(id))
                    .filter((t): t is Task => t !== null);

                let newParentStatus: TaskStatus | null = null;

                // All completed -> completed
                if (siblings.every(s => s.status === TaskStatuses.COMPLETED)) {
                    newParentStatus = TaskStatuses.COMPLETED;
                }
                // Any failed -> failed
                else if (siblings.some(s => s.status === TaskStatuses.FAILED)) {
                    newParentStatus = TaskStatuses.FAILED;
                }
                // Any blocked -> blocked
                else if (siblings.some(s => s.status === TaskStatuses.BLOCKED)) {
                    newParentStatus = TaskStatuses.BLOCKED;
                }
                // Any in progress -> in progress
                else if (siblings.some(s => s.status === TaskStatuses.IN_PROGRESS)) {
                    newParentStatus = TaskStatuses.IN_PROGRESS;
                }

                if (newParentStatus && newParentStatus !== parent.status) {
                    await updateTask(parent.id, { status: newParentStatus });
                }
            }
        }

        // Update subtask status if needed
        if (newStatus === TaskStatuses.BLOCKED) {
            for (const subtaskId of task.subtasks) {
                const subtask = getTaskById(subtaskId);
                if (subtask && subtask.status !== TaskStatuses.BLOCKED) {
                    await updateTask(subtaskId, { status: TaskStatuses.BLOCKED });
                }
            }
        }
    }

    /**
     * Determines if a task's status should be blocked based on dependencies
     * 
     * @param task - Task to check
     * @param getTaskById - Function to retrieve a task by ID
     * @returns Whether the task should be blocked
     */
    isBlocked(task: Task, getTaskById: (id: string) => Task | null): boolean {
        // Check if any dependencies are not completed
        return task.dependencies.some(depId => {
            const depTask = getTaskById(depId);
            return !depTask || depTask.status !== TaskStatuses.COMPLETED;
        });
    }

    /**
     * Gets the computed status for a task based on its subtasks
     * 
     * @param task - Task to compute status for
     * @param getTaskById - Function to retrieve a task by ID
     * @returns Computed status
     */
    computeStatus(task: Task, getTaskById: (id: string) => Task | null): TaskStatus {
        const subtasks = task.subtasks
            .map(id => getTaskById(id))
            .filter((t): t is Task => t !== null);

        if (subtasks.length === 0) {
            return task.status;
        }

        if (subtasks.every(s => s.status === TaskStatuses.COMPLETED)) {
            return TaskStatuses.COMPLETED;
        }

        if (subtasks.some(s => s.status === TaskStatuses.FAILED)) {
            return TaskStatuses.FAILED;
        }

        if (subtasks.some(s => s.status === TaskStatuses.BLOCKED)) {
            return TaskStatuses.BLOCKED;
        }

        if (subtasks.some(s => s.status === TaskStatuses.IN_PROGRESS)) {
            return TaskStatuses.IN_PROGRESS;
        }

        return TaskStatuses.PENDING;
    }
}
