import { Task, TaskStatus, TaskType } from '../../types/task.js';
import { TaskValidators } from './validators/index.js';

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
  type TaskResponse,
  type CreateTaskInput,
  type UpdateTaskInput,
} from './schemas/index.js';

// Export validators
export {
  StatusValidator,
  DependencyValidator,
  HierarchyValidator,
  TaskValidators,
} from './validators/index.js';

// Create validator instance for utility functions
const validators = new TaskValidators();

/**
 * Ensures a task has all required arrays initialized
 */
const ensureTaskArrays = (task: Partial<Task>): Task =>
  ({
    ...task,
    notes: task.notes || [],
    dependencies: task.dependencies || [],
    subtasks: task.subtasks || [],
    metadata: task.metadata || {},
  }) as Task;

/**
 * Validates task status transition
 */
export const validateTaskStatusTransition = async (
  task: Partial<Task>,
  newStatus: TaskStatus,
  getTaskByPath: (path: string) => Promise<Task | null>
): Promise<void> => {
  const validTask = ensureTaskArrays(task);
  await validators.validateStatusTransition(validTask, newStatus, getTaskByPath);
};

/**
 * Detects dependency cycles
 */
export const detectDependencyCycle = async (
  task: Partial<Task>,
  newDeps: string[],
  getTaskByPath: (path: string) => Promise<Task | null>
): Promise<boolean> => {
  const validTask = ensureTaskArrays(task);
  return validators.detectDependencyCycle(validTask, newDeps, getTaskByPath);
};

/**
 * Validates task hierarchy
 */
export const isValidTaskHierarchy = (_parentType: TaskType, _childType: TaskType): boolean => {
  // Both TASK and MILESTONE can have subtasks
  // No additional validation needed for now
  return true;
};

// Re-export types needed by validation
export { TaskStatus, TaskType };
