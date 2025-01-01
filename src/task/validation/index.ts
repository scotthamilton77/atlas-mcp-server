import { Task, TaskStatus, CreateTaskInput, UpdateTaskInput } from '../../types/task.js';
import { TaskValidator } from './task-validator.js';
import { TaskErrorFactory } from '../../errors/task-error.js';
import { TaskStorage } from '../../types/storage.js';
import { DependencyValidationMode } from './validators/dependency-validator.js';
import { HierarchyValidationMode } from './validators/hierarchy-validator.js';

let validator: TaskValidator | undefined;

/**
 * Initialize validator with storage
 */
export function initializeValidator(storage: TaskStorage): void {
  validator = new TaskValidator(storage);
}

/**
 * Get validator instance
 */
function getValidator(): TaskValidator {
  if (!validator) {
    throw TaskErrorFactory.createTaskValidationError(
      'getValidator',
      'Validator not initialized. Call initializeValidator first.',
      {}
    );
  }
  return validator;
}

/**
 * Validate task creation
 */
export async function validateCreate(
  input: CreateTaskInput,
  dependencyMode: DependencyValidationMode = DependencyValidationMode.STRICT,
  hierarchyMode: HierarchyValidationMode = HierarchyValidationMode.STRICT
): Promise<void> {
  try {
    await getValidator().validateCreate(input, dependencyMode, hierarchyMode);
  } catch (error) {
    throw TaskErrorFactory.createTaskValidationError(
      'validateCreate',
      error instanceof Error ? error.message : String(error),
      { input }
    );
  }
}

/**
 * Validate task update
 */
export async function validateUpdate(
  path: string,
  updates: UpdateTaskInput,
  mode: DependencyValidationMode = DependencyValidationMode.STRICT
): Promise<void> {
  try {
    await getValidator().validateUpdate(path, updates, mode);
  } catch (error) {
    throw TaskErrorFactory.createTaskValidationError(
      'validateUpdate',
      error instanceof Error ? error.message : String(error),
      { path, updates }
    );
  }
}

/**
 * Validate task status transition
 */
export async function validateStatusTransition(
  task: Task,
  newStatus: TaskStatus,
  getTaskByPath: (path: string) => Promise<Task | null>
): Promise<void> {
  try {
    await getValidator().validateStatusTransition(task, newStatus, getTaskByPath);
  } catch (error) {
    throw TaskErrorFactory.createTaskValidationError(
      'validateStatusTransition',
      error instanceof Error ? error.message : String(error),
      { task, newStatus }
    );
  }
}

/**
 * Get status validation result
 */
export async function getStatusValidationResult(
  task: Task,
  newStatus: TaskStatus,
  getTaskByPath: (path: string) => Promise<Task | null>
): Promise<{ status: TaskStatus; autoTransition?: boolean }> {
  try {
    return await getValidator().getStatusValidationResult(task, newStatus, getTaskByPath);
  } catch (error) {
    throw TaskErrorFactory.createTaskValidationError(
      'getStatusValidationResult',
      error instanceof Error ? error.message : String(error),
      { task, newStatus }
    );
  }
}

/**
 * Validate parent-child status constraints
 */
export async function validateParentChildStatus(
  task: Task,
  newStatus: TaskStatus,
  siblings: Task[],
  getTaskByPath: (path: string) => Promise<Task | null>
): Promise<{ parentUpdate?: { path: string; status: TaskStatus } }> {
  try {
    return await getValidator().validateParentChildStatus(task, newStatus, siblings, getTaskByPath);
  } catch (error) {
    throw TaskErrorFactory.createTaskValidationError(
      'validateParentChildStatus',
      error instanceof Error ? error.message : String(error),
      { task, newStatus, siblings }
    );
  }
}

/**
 * Sort tasks by dependency order
 */
export async function sortTasksByDependencies(
  tasks: Array<{ path: string; dependencies: string[] }>
): Promise<string[]> {
  try {
    return await getValidator().sortTasksByDependencies(tasks);
  } catch (error) {
    throw TaskErrorFactory.createTaskValidationError(
      'sortTasksByDependencies',
      error instanceof Error ? error.message : String(error),
      { tasks }
    );
  }
}
