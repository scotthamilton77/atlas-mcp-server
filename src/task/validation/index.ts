import { TaskStatus, TaskType } from '../../types/task.js';
import { StatusValidator } from './validators/status-validator.js';
import { DependencyValidator } from './validators/dependency-validator.js';
import { HierarchyValidator } from './validators/hierarchy-validator.js';
import { BaseTask } from './schemas/base-schema.js';

// Export main validator
export { TaskValidator } from './task-validator.js';

// Export schemas
export {
    taskMetadataSchema,
    baseTaskSchema,
    createTaskSchema,
    updateTaskSchema,
    taskResponseSchema,
    type TaskMetadata,
    type BaseTask,
    type TaskResponse,
    type CreateTaskInput,
    type UpdateTaskInput
} from './schemas/index.js';

// Export validators and their functions
export {
    StatusValidator,
    DependencyValidator,
    HierarchyValidator,
    TaskValidators
} from './validators/index.js';

// Export validation functions
export const validateTaskStatusTransition = async (
    task: BaseTask,
    newStatus: TaskStatus,
    getTaskByPath: (path: string) => Promise<BaseTask | null>
): Promise<void> => {
    const validator = new StatusValidator();
    await validator.validateStatusTransition(task, newStatus, getTaskByPath);
};

export const detectDependencyCycle = async (
    task: BaseTask,
    newDeps: string[],
    getTaskByPath: (path: string) => Promise<BaseTask | null>
): Promise<boolean> => {
    const validator = new DependencyValidator();
    return validator.detectDependencyCycle(task, newDeps, getTaskByPath);
};

export const isValidTaskHierarchy = (parentType: TaskType, childType: TaskType): boolean => {
    const validator = new HierarchyValidator();
    try {
        validator.validateTaskHierarchy(parentType, childType);
        return true;
    } catch {
        return false;
    }
};

// Re-export types needed by validation
export { TaskStatus, TaskType };
