import { TaskStatus } from '../../../types/task.js';
import { DependencyValidator, DependencyValidationMode } from './dependency-validator.js';
import { HierarchyValidator, HierarchyValidationMode } from './hierarchy-validator.js';
import { StatusValidator } from './status-validator.js';
import type { Task } from '../../../types/task.js';

/**
 * Coordinates all task validation rules
 */
export class TaskValidators {
  readonly dependencyValidator: DependencyValidator;
  readonly hierarchyValidator: HierarchyValidator;
  readonly statusValidator: StatusValidator;

  constructor() {
    this.dependencyValidator = new DependencyValidator();
    this.hierarchyValidator = new HierarchyValidator();
    this.statusValidator = new StatusValidator();
  }

  /**
   * Ensure all task arrays are initialized
   */
  ensureTaskArrays(taskInput: Partial<Task>): Task {
    return {
      ...taskInput,
      dependencies: taskInput.dependencies || [],
      planningNotes: taskInput.planningNotes || [],
      progressNotes: taskInput.progressNotes || [],
      completionNotes: taskInput.completionNotes || [],
      troubleshootingNotes: taskInput.troubleshootingNotes || [],
      metadata: taskInput.metadata || {},
      statusMetadata: taskInput.statusMetadata || {},
    } as Task;
  }

  /**
   * Validate task dependencies
   */
  async validateDependencyConstraints(
    task: Task,
    dependencies: string[],
    getTaskByPath: (path: string) => Promise<Task | null>,
    mode: DependencyValidationMode = DependencyValidationMode.STRICT
  ): Promise<{
    valid: boolean;
    error?: string;
    missingDependencies?: string[];
  }> {
    return await this.dependencyValidator.validateDependencyConstraints(
      task,
      dependencies,
      getTaskByPath,
      mode
    );
  }

  /**
   * Validate task hierarchy
   */
  async validateHierarchy(
    parentPath: string,
    getTaskByPath: (path: string) => Promise<Task | null>,
    mode: HierarchyValidationMode = HierarchyValidationMode.STRICT
  ): Promise<{
    valid: boolean;
    error?: string;
    missingParents?: string[];
  }> {
    // For now, just validate parent exists in strict mode
    if (mode === HierarchyValidationMode.STRICT) {
      const parent = await getTaskByPath(parentPath);
      if (!parent) {
        return {
          valid: false,
          error: `Parent task not found: ${parentPath}`,
          missingParents: [parentPath],
        };
      }
    }
    return { valid: true };
  }

  /**
   * Validate status transition
   */
  async validateStatusTransition(
    task: Task,
    newStatus: TaskStatus,
    getTaskByPath: (path: string) => Promise<Task | null>
  ): Promise<{ status: TaskStatus; autoTransition?: boolean }> {
    return await this.statusValidator.validateStatusTransition(task, newStatus, getTaskByPath);
  }

  /**
   * Sort tasks by dependency order
   */
  async sortTasksByDependencies(
    tasks: Array<{ path: string; dependencies: string[] }>
  ): Promise<string[]> {
    return await this.dependencyValidator.sortTasksByDependencies(tasks);
  }

  /**
   * Detect dependency cycles
   */
  async detectDependencyCycle(
    task: Task,
    dependencies: string[],
    getTaskByPath: (path: string) => Promise<Task | null>
  ): Promise<boolean> {
    return await this.dependencyValidator.detectDependencyCycle(task, dependencies, getTaskByPath);
  }
}
