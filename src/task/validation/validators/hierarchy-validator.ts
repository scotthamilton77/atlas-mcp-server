import { Task, TaskType } from '../../../types/task.js';
import { ErrorCodes, createError } from '../../../errors/index.js';

export class HierarchyValidator {
    /**
     * Validates parent-child relationship between tasks
     */
    async validateParentChild(
        _task: Task,
        parentPath: string | undefined,
        getTaskByPath: (path: string) => Promise<Task | null>
    ): Promise<void> {
        if (!parentPath) return;

        const parent = await getTaskByPath(parentPath);
        if (!parent) {
            throw createError(
                ErrorCodes.VALIDATION_ERROR,
                `Parent task not found: ${parentPath}`,
                'validateParentChild'
            );
        }

        // Both TASK and MILESTONE can have subtasks
        // No additional validation needed for now
    }

    /**
     * Validates task type change
     */
    async validateTypeChange(task: Task, newType: TaskType): Promise<void> {
        if (task.type === newType) return;

        // Validate type change is allowed
        if (task.type === TaskType.MILESTONE && newType === TaskType.TASK) {
            throw createError(
                ErrorCodes.VALIDATION_ERROR,
                'Cannot change MILESTONE to TASK if it has subtasks',
                'validateTypeChange'
            );
        }
    }
}
