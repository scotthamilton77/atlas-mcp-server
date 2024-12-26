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
        switch (parentType) {
            case TaskType.MILESTONE:
                // Milestones can contain tasks and groups
                if (childType !== TaskType.TASK && childType !== TaskType.GROUP) {
                    throw createError(
                        ErrorCodes.INVALID_INPUT,
                        `MILESTONE can only contain TASK or GROUP types, not ${childType}`,
                        'HierarchyValidator.validateTaskHierarchy'
                    );
                }
                break;

            case TaskType.GROUP:
                // Groups can contain tasks
                if (childType !== TaskType.TASK) {
                    throw createError(
                        ErrorCodes.INVALID_INPUT,
                        `GROUP can only contain TASK type, not ${childType}`,
                        'HierarchyValidator.validateTaskHierarchy'
                    );
                }
                break;

            case TaskType.TASK:
                // Tasks cannot contain other tasks
                throw createError(
                    ErrorCodes.INVALID_INPUT,
                    `TASK type cannot contain any subtasks (attempted to add ${childType})`,
                    'HierarchyValidator.validateTaskHierarchy'
                );

            default:
                throw createError(
                    ErrorCodes.INVALID_INPUT,
                    `Unknown task type: ${parentType}`,
                    'HierarchyValidator.validateTaskHierarchy'
                );
        }
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
        newType: TaskType,
        hasChildren: boolean
    ): Promise<void> {
        // Cannot change to TASK type when task has children
        if (newType === TaskType.TASK && hasChildren) {
            throw createError(
                ErrorCodes.INVALID_INPUT,
                'Cannot change to TASK type when task has children',
                'HierarchyValidator.validateTypeChange',
                undefined,
                {
                    taskPath: task.path,
                    currentType: task.type,
                    newType
                }
            );
        }

        // Additional type change validations can be added here
        // For example:
        // - Validate parent type constraints
        // - Check child type constraints
        // - Validate status constraints for type
    }
}
