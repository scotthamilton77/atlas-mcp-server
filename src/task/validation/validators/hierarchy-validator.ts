import { ErrorCodes, createError } from '../../../errors/index.js';
import { BaseTask } from '../schemas/index.js';
import { TaskType } from '../../../types/task.js';

/**
 * Validates task hierarchy relationships
 */
export class HierarchyValidator {
    /**
     * Validates parent-child task type relationships
     */
    validateTaskHierarchy(parentType: TaskType, childType: TaskType): void {
        // Validate parent type
        if (parentType !== TaskType.TASK && parentType !== TaskType.MILESTONE) {
            throw createError(
                ErrorCodes.INVALID_INPUT,
                `Invalid parent task type: ${parentType}. Must be TASK or MILESTONE`,
                'HierarchyValidator.validateTaskHierarchy'
            );
        }

        // Validate child type
        if (childType !== TaskType.TASK && childType !== TaskType.MILESTONE) {
            throw createError(
                ErrorCodes.INVALID_INPUT,
                `Invalid child task type: ${childType}. Must be TASK or MILESTONE`,
                'HierarchyValidator.validateTaskHierarchy'
            );
        }

        // Both TASK and MILESTONE can contain any valid task type
    }

    /**
     * Validates parent-child relationship for a task
     */
    async validateParentChild(
        task: BaseTask,
        parentPath: string | undefined,
        getTaskByPath: (path: string) => Promise<BaseTask | null>
    ): Promise<void> {
        if (!parentPath) return;

        const parent = await getTaskByPath(parentPath);
        if (!parent) {
            throw createError(
                ErrorCodes.INVALID_INPUT,
                `Parent task not found: ${parentPath}`,
                'HierarchyValidator.validateParentChild'
            );
        }

        // Validate parent-child type relationship
        this.validateTaskHierarchy(parent.type, task.type);

        // Validate path hierarchy matches parent-child relationship
        if (!task.path.startsWith(parent.path + '/')) {
            throw createError(
                ErrorCodes.INVALID_INPUT,
                'Task path must be a child of parent path',
                'HierarchyValidator.validateParentChild',
                undefined,
                {
                    taskPath: task.path,
                    parentPath: parent.path
                }
            );
        }
    }

    /**
     * Validates type change for a task
     */
    async validateTypeChange(
        task: BaseTask,
        newType: TaskType
    ): Promise<void> {
        // Only allow TASK or MILESTONE types
        if (newType !== TaskType.TASK && newType !== TaskType.MILESTONE) {
            throw createError(
                ErrorCodes.INVALID_INPUT,
                `Invalid task type: ${newType}. Must be TASK or MILESTONE`,
                'HierarchyValidator.validateTypeChange',
                undefined,
                {
                    taskPath: task.path,
                    currentType: task.type,
                    newType
                }
            );
        }

        // Both TASK and MILESTONE can have children, so no need to check hasChildren
    }
}
