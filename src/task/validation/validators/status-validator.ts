import { Task, TaskStatus } from '../../../types/task.js';
import { ErrorCodes, createError } from '../../../errors/index.js';

/**
 * Validates task status transitions and dependencies
 */
export class StatusValidator {
    /**
     * Validates a status transition for a task
     */
    async validateStatusTransition(
        task: Task,
        newStatus: TaskStatus,
        getTaskByPath: (path: string) => Promise<Task | null>
    ): Promise<void> {
        // Define valid status transitions
        const validTransitions: Record<TaskStatus, TaskStatus[]> = {
            [TaskStatus.PENDING]: [TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED],
            [TaskStatus.IN_PROGRESS]: [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.BLOCKED],
            [TaskStatus.COMPLETED]: [], // No transitions from COMPLETED
            [TaskStatus.FAILED]: [TaskStatus.PENDING], // Can retry from FAILED
            [TaskStatus.BLOCKED]: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] // Can unblock
        };

        // Check if transition is valid
        if (!validTransitions[task.status]?.includes(newStatus)) {
            throw createError(
                ErrorCodes.TASK_STATUS,
                `Invalid status transition from ${task.status} to ${newStatus}. Valid transitions are: ${validTransitions[task.status]?.join(', ')}`,
                'StatusValidator.validateStatusTransition',
                undefined,
                {
                    taskPath: task.path,
                    currentStatus: task.status,
                    newStatus,
                    validTransitions: validTransitions[task.status]
                }
            );
        }

        // Check dependencies for COMPLETED status
        if (newStatus === TaskStatus.COMPLETED) {
            await this.validateCompletionDependencies(task, getTaskByPath);
        }

        // Check dependencies for IN_PROGRESS status
        if (newStatus === TaskStatus.IN_PROGRESS) {
            const blockedByDeps = await this.isBlockedByDependencies(task, getTaskByPath);
            if (blockedByDeps) {
                throw createError(
                    ErrorCodes.TASK_DEPENDENCY,
                    'Cannot start task: blocked by incomplete dependencies',
                    'StatusValidator.validateStatusTransition',
                    undefined,
                    {
                        taskPath: task.path,
                        dependencies: task.dependencies
                    }
                );
            }
        }
    }

    /**
     * Validates that all dependencies are completed before allowing completion
     */
    private async validateCompletionDependencies(
        task: Task,
        getTaskByPath: (path: string) => Promise<Task | null>
    ): Promise<void> {
        if (!Array.isArray(task.dependencies)) {
            throw createError(
                ErrorCodes.TASK_DEPENDENCY,
                'Task dependencies must be an array',
                'StatusValidator.validateCompletionDependencies'
            );
        }

        for (const depPath of task.dependencies) {
            const depTask = await getTaskByPath(depPath);
            if (!depTask || depTask.status !== TaskStatus.COMPLETED) {
                throw createError(
                    ErrorCodes.TASK_DEPENDENCY,
                    `Cannot complete task: dependency ${depPath} is not completed`,
                    'StatusValidator.validateCompletionDependencies',
                    undefined,
                    {
                        taskPath: task.path,
                        dependencyPath: depPath,
                        dependencyStatus: depTask?.status
                    }
                );
            }
        }
    }

    /**
     * Checks if a task is blocked by its dependencies
     */
    private async isBlockedByDependencies(
        task: Task,
        getTaskByPath: (path: string) => Promise<Task | null>
    ): Promise<boolean> {
        if (!Array.isArray(task.dependencies)) {
            throw createError(
                ErrorCodes.TASK_DEPENDENCY,
                'Task dependencies must be an array',
                'StatusValidator.isBlockedByDependencies'
            );
        }

        for (const depPath of task.dependencies) {
            const depTask = await getTaskByPath(depPath);
            if (!depTask || 
                [TaskStatus.FAILED, TaskStatus.BLOCKED, TaskStatus.PENDING].includes(depTask.status)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Validates status constraints between parent and child tasks
     */
    async validateParentChildStatus(
        task: Task,
        newStatus: TaskStatus,
        siblings: Task[],
        getTaskByPath: (path: string) => Promise<Task | null>
    ): Promise<void> {
        // Cannot complete if siblings are blocked
        if (newStatus === TaskStatus.COMPLETED && 
            siblings.some(s => s.status === TaskStatus.BLOCKED)) {
            throw createError(
                ErrorCodes.TASK_STATUS,
                'Cannot complete task while sibling tasks are blocked',
                'StatusValidator.validateParentChildStatus'
            );
        }

        // Cannot start if siblings have failed
        if (newStatus === TaskStatus.IN_PROGRESS && 
            siblings.some(s => s.status === TaskStatus.FAILED)) {
            throw createError(
                ErrorCodes.TASK_STATUS,
                'Cannot start task while sibling tasks have failed',
                'StatusValidator.validateParentChildStatus'
            );
        }

        // Check parent task status
        if (task.parentPath) {
            const parent = await getTaskByPath(task.parentPath);
            if (parent) {
                if (parent.status === TaskStatus.COMPLETED && newStatus !== TaskStatus.COMPLETED) {
                    throw createError(
                        ErrorCodes.TASK_STATUS,
                        'Cannot modify subtask status when parent is completed',
                        'StatusValidator.validateParentChildStatus'
                    );
                }

                if (newStatus === TaskStatus.COMPLETED) {
                    const subtasks = await Promise.all(
                        siblings.map(s => getTaskByPath(s.path))
                    );
                    
                    const incompleteSubtasks = subtasks.filter(
                        s => s && s.status !== TaskStatus.COMPLETED
                    );

                    if (incompleteSubtasks.length > 0) {
                        throw createError(
                            ErrorCodes.TASK_STATUS,
                            'Cannot complete task while other subtasks are incomplete',
                            'StatusValidator.validateParentChildStatus',
                            undefined,
                            {
                                incompleteTasks: incompleteSubtasks.map(s => s?.path)
                            }
                        );
                    }
                }
            }
        }
    }
}
