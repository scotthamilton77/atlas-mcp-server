import { TaskStatus } from '../../../types/task.js';
import { ErrorCodes, createError } from '../../../errors/index.js';
import { BaseTask } from '../schemas/index.js';

/**
 * Validates task status transitions and dependencies
 */
export class StatusValidator {
    /**
     * Validates a status transition for a task
     */
    async validateStatusTransition(
        task: BaseTask,
        newStatus: TaskStatus,
        getTaskByPath: (path: string) => Promise<BaseTask | null>
    ): Promise<void> {
        // Cannot transition from COMPLETED/FAILED back to IN_PROGRESS
        if ((task.status === TaskStatus.COMPLETED || task.status === TaskStatus.FAILED) &&
            newStatus === TaskStatus.IN_PROGRESS) {
            throw createError(
                ErrorCodes.TASK_STATUS,
                `Cannot transition from ${task.status} to ${newStatus}`,
                'StatusValidator.validateStatusTransition',
                undefined,
                {
                    taskPath: task.path,
                    currentStatus: task.status,
                    newStatus
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
        task: BaseTask,
        getTaskByPath: (path: string) => Promise<BaseTask | null>
    ): Promise<void> {
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
        task: BaseTask,
        getTaskByPath: (path: string) => Promise<BaseTask | null>
    ): Promise<boolean> {
        for (const depPath of task.dependencies) {
            const depTask = await getTaskByPath(depPath);
            if (!depTask || 
                depTask.status === TaskStatus.FAILED || 
                depTask.status === TaskStatus.BLOCKED || 
                depTask.status === TaskStatus.PENDING) {
                return true;
            }
        }
        return false;
    }

    /**
     * Validates status constraints between parent and child tasks
     */
    async validateParentChildStatus(
        _task: BaseTask, // Prefix with underscore to indicate intentionally unused
        newStatus: TaskStatus,
        siblings: BaseTask[]
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
    }
}
