import { Logger } from '../../logging/index.js';
import { formatTimestamp } from '../../utils/date-formatter.js';
import { TaskStorage } from '../../types/storage.js';
import { TaskType, TaskStatus, Task } from '../../types/task.js';
import { bulkOperationsSchema } from './schemas/bulk-operations-schema.js';
import { TaskErrorFactory } from '../../errors/task-error.js';
import {
  taskMetadataSchema,
  createTaskSchema,
  updateTaskSchema,
  CreateTaskInput,
  UpdateTaskInput,
} from './schemas/index.js';
import { TaskValidators } from './validators/index.js';
import { DependencyValidationMode } from './validators/dependency-validator.js';
import { HierarchyValidationMode } from './validators/hierarchy-validator.js';

export interface ValidationResult {
  success: boolean;
  errors: string[];
}

/**
 * Main task validator that coordinates all validation rules
 */
export class TaskValidator {
  private readonly logger: Logger;
  private readonly validators: TaskValidators;

  constructor(private readonly storage: TaskStorage) {
    this.logger = Logger.getInstance().child({ component: 'TaskValidator' });
    this.validators = new TaskValidators();
  }

  /**
   * Get the create task schema
   */
  getCreateTaskSchema(): any {
    return createTaskSchema;
  }

  /**
   * Get the update task schema
   */
  getUpdateTaskSchema(): any {
    return updateTaskSchema;
  }

  /**
   * Get the bulk operations schema
   */
  getBulkOperationsSchema(): any {
    return bulkOperationsSchema;
  }

  /**
   * Validates task creation input
   */
  async validateCreate(
    input: CreateTaskInput,
    dependencyMode: DependencyValidationMode = DependencyValidationMode.STRICT,
    hierarchyMode: HierarchyValidationMode = HierarchyValidationMode.STRICT
  ): Promise<void> {
    try {
      // Validate schema first
      const validatedInput = createTaskSchema.parse(input);

      // Check for existing task
      const existingTask = await this.storage.getTask(validatedInput.path);
      if (existingTask) {
        throw TaskErrorFactory.createTaskValidationError(
          'TaskValidator.validateCreate',
          `Task already exists at path: ${validatedInput.path}`,
          { input }
        );
      }

      // Create dummy task for validation
      const now = Date.now();
      const task: Task = {
        id: `task_${now}_${Math.random().toString(36).substr(2, 9)}`,
        path: validatedInput.path,
        name: validatedInput.name,
        type: validatedInput.type || TaskType.TASK,
        status: TaskStatus.PENDING,
        created: formatTimestamp(now),
        updated: formatTimestamp(now),
        version: 1,
        projectPath: validatedInput.path.split('/')[0],
        description: validatedInput.description,
        parentPath: validatedInput.parentPath,
        dependencies: validatedInput.dependencies || [],
        metadata: validatedInput.metadata || {},
        statusMetadata: {},
        planningNotes: validatedInput.planningNotes || [],
        progressNotes: validatedInput.progressNotes || [],
        completionNotes: validatedInput.completionNotes || [],
        troubleshootingNotes: validatedInput.troubleshootingNotes || [],
      };

      // Validate hierarchy if parent path provided
      if (validatedInput.parentPath) {
        const hierarchyResult = await this.validators.validateHierarchy(
          validatedInput.parentPath,
          this.storage.getTask.bind(this.storage),
          hierarchyMode
        );

        if (!hierarchyResult.valid && hierarchyMode === HierarchyValidationMode.STRICT) {
          throw TaskErrorFactory.createTaskValidationError(
            'TaskValidator.validateCreate',
            hierarchyResult.error || 'Hierarchy validation failed',
            { missingParents: hierarchyResult.missingParents }
          );
        }
      }

      // Validate dependencies with specified mode
      const dependencyResult = await this.validators.validateDependencyConstraints(
        task,
        validatedInput.dependencies || [],
        this.storage.getTask.bind(this.storage),
        dependencyMode
      );

      if (!dependencyResult.valid && dependencyMode === DependencyValidationMode.STRICT) {
        throw TaskErrorFactory.createTaskDependencyError(
          'TaskValidator.validateCreate',
          dependencyResult.error || 'Dependency validation failed',
          { missingDependencies: dependencyResult.missingDependencies }
        );
      }

      // Validate metadata if provided
      if (validatedInput.metadata) {
        taskMetadataSchema.parse(validatedInput.metadata);
      }
    } catch (error) {
      this.logger.error('Task creation validation failed', {
        error,
        input,
      });
      throw error;
    }
  }

  /**
   * Validates task update input
   */
  async validateUpdate(
    path: string,
    updates: UpdateTaskInput,
    mode: DependencyValidationMode = DependencyValidationMode.STRICT
  ): Promise<void> {
    try {
      // Validate schema first
      const validatedUpdates = updateTaskSchema.parse(updates);

      // Get existing task
      const existingTask = await this.storage.getTask(path);
      if (!existingTask) {
        throw TaskErrorFactory.createTaskNotFoundError('TaskValidator.validateUpdate', path);
      }

      // Validate dependencies with specified mode
      if (validatedUpdates.dependencies) {
        const dependencyResult = await this.validators.validateDependencyConstraints(
          existingTask,
          validatedUpdates.dependencies,
          this.storage.getTask.bind(this.storage),
          mode
        );

        if (!dependencyResult.valid && mode === DependencyValidationMode.STRICT) {
          throw TaskErrorFactory.createTaskDependencyError(
            'TaskValidator.validateUpdate',
            dependencyResult.error || 'Dependency validation failed',
            { missingDependencies: dependencyResult.missingDependencies }
          );
        }
      }

      // Validate metadata updates
      if (validatedUpdates.metadata) {
        taskMetadataSchema.parse({
          ...existingTask.metadata,
          ...validatedUpdates.metadata,
        });
      }
    } catch (error) {
      this.logger.error('Task update validation failed', {
        error,
        path,
        updates,
      });
      throw error;
    }
  }

  /**
   * Validate status transition
   */
  async validateStatusTransition(
    task: Task,
    newStatus: TaskStatus,
    getTaskByPath: (path: string) => Promise<Task | null>
  ): Promise<{ status: TaskStatus; autoTransition?: boolean }> {
    const validTask = this.validators.ensureTaskArrays(task);
    return await this.validators.statusValidator.validateStatusTransition(
      validTask,
      newStatus,
      getTaskByPath
    );
  }

  /**
   * Get status validation result
   */
  async getStatusValidationResult(
    task: Task,
    newStatus: TaskStatus,
    getTaskByPath: (path: string) => Promise<Task | null>
  ): Promise<{ status: TaskStatus; autoTransition?: boolean }> {
    const validTask = this.validators.ensureTaskArrays(task);
    return await this.validators.statusValidator.validateStatusTransition(
      validTask,
      newStatus,
      getTaskByPath
    );
  }

  /**
   * Validate parent-child status constraints
   */
  async validateParentChildStatus(
    task: Task,
    newStatus: TaskStatus,
    siblings: Task[],
    getTaskByPath: (path: string) => Promise<Task | null>
  ): Promise<{ parentUpdate?: { path: string; status: TaskStatus } }> {
    const validTask = this.validators.ensureTaskArrays(task);
    return await this.validators.statusValidator.validateParentChildStatus(
      validTask,
      newStatus,
      siblings,
      getTaskByPath
    );
  }

  /**
   * Sort tasks by dependency order
   */
  async sortTasksByDependencies(
    tasks: Array<{ path: string; dependencies: string[] }>
  ): Promise<string[]> {
    return await this.validators.sortTasksByDependencies(tasks);
  }
}
