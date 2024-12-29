import { Logger } from '../../logging/index.js';
import { formatTimestamp } from '../../utils/date-formatter.js';
import { TaskStorage } from '../../types/storage.js';
import { TaskType, TaskStatus, Task } from '../../types/task.js';
import { bulkOperationsSchema } from './schemas/bulk-operations-schema.js';
import { ErrorCodes, createError } from '../../errors/index.js';
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
        throw createError(
          ErrorCodes.TASK_DUPLICATE,
          `Task already exists at path: ${validatedInput.path}`,
          'TaskValidator.validateCreate',
          'A task with this path already exists. Please use a different path.'
        );
      }

      // Check for reasoning content in description
      if (validatedInput.description) {
        if (validatedInput.description.toLowerCase().includes('reasoning:')) {
          throw createError(
            ErrorCodes.INVALID_INPUT,
            'Reasoning content detected in description field',
            'TaskValidator.validateCreate',
            'Please use the separate reasoning field for task reasoning. The description field should contain technical details, implementation steps, and success criteria.'
          );
        }
      }

      // Create dummy task for validation
      const task: Task = {
        path: validatedInput.path,
        name: validatedInput.name,
        type: validatedInput.type || TaskType.TASK,
        status: TaskStatus.PENDING,
        created: formatTimestamp(Date.now()),
        updated: formatTimestamp(Date.now()),
        version: 1,
        projectPath: validatedInput.path.split('/')[0],
        description: validatedInput.description,
        parentPath: validatedInput.parentPath,
        notes: validatedInput.notes || [],
        reasoning: validatedInput.reasoning,
        dependencies: validatedInput.dependencies || [],
        subtasks: [],
        metadata: validatedInput.metadata || {},
      };

      // Validate hierarchy if parent path provided
      if (validatedInput.parentPath) {
        const hierarchyResult = await this.validators.validateHierarchy(
          task,
          validatedInput.parentPath,
          this.storage.getTask.bind(this.storage),
          hierarchyMode
        );

        if (!hierarchyResult.valid && hierarchyMode === HierarchyValidationMode.STRICT) {
          throw createError(
            ErrorCodes.INVALID_INPUT,
            hierarchyResult.error || 'Hierarchy validation failed',
            'TaskValidator.validateCreate',
            undefined,
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
        throw createError(
          ErrorCodes.INVALID_INPUT,
          dependencyResult.error || 'Dependency validation failed',
          'TaskValidator.validateCreate',
          undefined,
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
        throw createError(
          ErrorCodes.TASK_NOT_FOUND,
          `Task not found: ${path}`,
          'TaskValidator.validateUpdate'
        );
      }

      // Check for reasoning content in description
      if (validatedUpdates.description) {
        if (validatedUpdates.description.toLowerCase().includes('reasoning:')) {
          throw createError(
            ErrorCodes.INVALID_INPUT,
            'Reasoning content detected in description field',
            'TaskValidator.validateUpdate',
            'Please use the separate reasoning field for task reasoning. The description field should contain technical details, implementation steps, and success criteria.'
          );
        }
      }

      // Validate type change
      if (validatedUpdates.type && validatedUpdates.type !== existingTask.type) {
        await this.validators.validateTypeChange(existingTask, validatedUpdates.type);
      }

      // Validate status change
      if (validatedUpdates.status && validatedUpdates.status !== existingTask.status) {
        await this.validators.validateStatusTransition(
          existingTask,
          validatedUpdates.status,
          this.storage.getTask.bind(this.storage)
        );
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
          throw createError(
            ErrorCodes.INVALID_INPUT,
            dependencyResult.error || 'Dependency validation failed',
            'TaskValidator.validateUpdate',
            undefined,
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
   * Sort tasks by dependency order
   */
  async sortTasksByDependencies(
    tasks: Array<{ path: string; dependencies: string[] }>
  ): Promise<string[]> {
    return await this.validators.sortTasksByDependencies(tasks);
  }

  /**
   * Validates bulk operations input and sorts tasks by dependencies
   */
  async validateBulkOperations(input: unknown): Promise<ValidationResult> {
    try {
      // Parse and validate schema
      const parsed = bulkOperationsSchema.parse(input);
      const errors: string[] = [];

      // Clear any existing pending parents
      this.validators.clearPendingParents();

      // Register all create operations as pending parents
      const createOps = parsed.operations
        .filter(op => op.type === 'create')
        .map(op => ({
          path: op.path,
          dependencies: (op.data as CreateTaskInput).dependencies || [],
          parentPath: (op.data as CreateTaskInput).parentPath,
        }));

      // Register all tasks that will be created
      createOps.forEach(op => {
        this.validators.registerPendingParent(op.path);
      });

      // Also register all tasks that will be created in the hierarchy validator
      this.validators.getHierarchyValidator().clearPendingParents();
      createOps.forEach(op => {
        this.validators.getHierarchyValidator().registerPendingParent(op.path);
      });

      try {
        // Build dependency graph including parent-child relationships
        const graph = new Map<string, Set<string>>();

        for (const op of createOps) {
          const dependencies = new Set<string>();

          // Add explicit dependencies
          op.dependencies?.forEach(dep => dependencies.add(dep));

          // Add parent as dependency if specified
          if (op.parentPath) {
            dependencies.add(op.parentPath);
          }

          graph.set(op.path, dependencies);
        }

        // Perform topological sort
        const sortedPaths = await this.validators.sortTasksByDependencyGraph(graph);

        // Reorder operations based on sorted paths
        const sortedOps = [];
        const updateOps = parsed.operations.filter(op => op.type !== 'create');

        // Add create operations in sorted order
        for (const path of sortedPaths) {
          const op = parsed.operations.find(o => o.type === 'create' && o.path === path);
          if (op) sortedOps.push(op);
        }

        // Add remaining operations
        sortedOps.push(...updateOps);
        parsed.operations = sortedOps;
      } catch (sortError) {
        this.logger.error('Failed to sort operations by dependencies', { error: sortError });
        errors.push(
          'Failed to sort operations: ' +
            (sortError instanceof Error ? sortError.message : String(sortError))
        );
        return { success: false, errors };
      }

      // Validate operations in order
      for (const op of parsed.operations) {
        try {
          if (op.type === 'create') {
            await this.validateCreate(
              op.data as CreateTaskInput,
              DependencyValidationMode.DEFERRED,
              HierarchyValidationMode.DEFERRED
            );
          } else if (op.type === 'update') {
            await this.validateUpdate(
              op.path,
              op.data as UpdateTaskInput,
              DependencyValidationMode.DEFERRED
            );
          }
        } catch (opError) {
          this.logger.error('Operation validation failed', {
            error: opError,
            operation: op,
          });
          errors.push(
            `${op.type} operation failed for path ${op.path}: ${opError instanceof Error ? opError.message : String(opError)}`
          );
        }
      }

      return {
        success: errors.length === 0,
        errors,
      };
    } catch (error) {
      this.logger.error('Bulk operations validation failed', { error });
      const errors = error instanceof Error ? [error.message] : ['Invalid bulk operations input'];
      return { success: false, errors };
    }
  }
}
