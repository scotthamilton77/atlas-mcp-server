import { Logger } from '../../logging/index.js';
import { TaskStorage } from '../../types/storage.js';
import { CreateTaskInput, UpdateTaskInput, TaskType, TaskStatus } from '../../types/task.js';
import { ErrorCodes, createError } from '../../errors/index.js';

export class TaskValidator {
  private readonly logger: Logger;

  constructor(private readonly storage: TaskStorage) {
    this.logger = Logger.getInstance().child({ component: 'TaskValidator' });
  }

  async validateCreate(input: CreateTaskInput): Promise<void> {
    try {
      // Validate required fields
      if (!input.name) {
        throw createError(
          ErrorCodes.INVALID_INPUT,
          'Task name is required'
        );
      }

      // Validate task type
      if (input.type && !Object.values(TaskType).includes(input.type)) {
        throw createError(
          ErrorCodes.INVALID_INPUT,
          `Invalid task type: ${input.type}`
        );
      }

      // Validate parent path if provided
      if (input.parentPath) {
        const parent = await this.storage.getTask(input.parentPath);
        if (!parent) {
          throw createError(
            ErrorCodes.INVALID_INPUT,
            `Parent task not found: ${input.parentPath}`
          );
        }

        // Validate parent-child relationship
        if (parent.type === TaskType.TASK) {
          throw createError(
            ErrorCodes.INVALID_INPUT,
            'TASK type cannot have child tasks'
          );
        }

        if (parent.type === TaskType.GROUP && input.type === TaskType.MILESTONE) {
          throw createError(
            ErrorCodes.INVALID_INPUT,
            'GROUP type cannot contain MILESTONE tasks'
          );
        }
      }

      // Validate dependencies if provided
      if (input.dependencies?.length) {
        await this.validateDependencies(input.dependencies);
      }

      // Validate metadata if provided
      if (input.metadata) {
        this.validateMetadata(input.metadata);
      }
    } catch (error) {
      this.logger.error('Task creation validation failed', {
        error,
        input
      });
      throw error;
    }
  }

  async validateUpdate(path: string, updates: UpdateTaskInput): Promise<void> {
    try {
      const existingTask = await this.storage.getTask(path);
      if (!existingTask) {
        throw createError(
          ErrorCodes.TASK_NOT_FOUND,
          `Task not found: ${path}`
        );
      }

      // Validate task type change
      if (updates.type && updates.type !== existingTask.type) {
        // Check if task has children when changing to TASK type
        if (updates.type === TaskType.TASK) {
          const hasChildren = await this.storage.hasChildren(path);
          if (hasChildren) {
            throw createError(
              ErrorCodes.INVALID_INPUT,
              'Cannot change to TASK type when task has children'
            );
          }
        }
      }

      // Validate status change
      if (updates.status) {
        await this.validateStatusChange(existingTask.status, updates.status, path);
      }

      // Validate dependencies change
      if (updates.dependencies) {
        await this.validateDependencies(updates.dependencies);
      }

      // Validate metadata updates
      if (updates.metadata) {
        this.validateMetadata(updates.metadata);
      }
    } catch (error) {
      this.logger.error('Task update validation failed', {
        error,
        path,
        updates
      });
      throw error;
    }
  }

  private async validateDependencies(dependencies: string[]): Promise<void> {
    const missingDeps: string[] = [];
    const circularDeps: string[] = [];

    for (const depPath of dependencies) {
      const depTask = await this.storage.getTask(depPath);
      if (!depTask) {
        missingDeps.push(depPath);
      } else {
        // Check for circular dependencies
        const depDeps = await this.getAllDependencies(depPath);
        if (dependencies.some(d => depDeps.includes(d))) {
          circularDeps.push(depPath);
        }
      }
    }

    if (missingDeps.length > 0) {
      throw createError(
        ErrorCodes.INVALID_INPUT,
        `Missing dependencies: ${missingDeps.join(', ')}`
      );
    }

    if (circularDeps.length > 0) {
      throw createError(
        ErrorCodes.INVALID_INPUT,
        `Circular dependencies detected: ${circularDeps.join(', ')}`
      );
    }
  }

  private async validateStatusChange(
    currentStatus: TaskStatus,
    newStatus: TaskStatus,
    path: string
  ): Promise<void> {
    // Validate status transition
    const validTransitions: Record<TaskStatus, TaskStatus[]> = {
      [TaskStatus.PENDING]: [
        TaskStatus.IN_PROGRESS,
        TaskStatus.BLOCKED,
        TaskStatus.FAILED
      ],
      [TaskStatus.IN_PROGRESS]: [
        TaskStatus.COMPLETED,
        TaskStatus.FAILED,
        TaskStatus.BLOCKED
      ],
      [TaskStatus.COMPLETED]: [TaskStatus.IN_PROGRESS],
      [TaskStatus.FAILED]: [TaskStatus.PENDING],
      [TaskStatus.BLOCKED]: [TaskStatus.PENDING, TaskStatus.FAILED]
    };

    if (!validTransitions[currentStatus]?.includes(newStatus)) {
      throw createError(
        ErrorCodes.INVALID_INPUT,
        `Invalid status transition from ${currentStatus} to ${newStatus}`
      );
    }

    // Additional validations for specific status changes
    if (newStatus === TaskStatus.COMPLETED) {
      // Check if all dependencies are completed
      const task = await this.storage.getTask(path);
      if (task?.dependencies.length) {
        for (const depPath of task.dependencies) {
          const depTask = await this.storage.getTask(depPath);
          if (!depTask || depTask.status !== TaskStatus.COMPLETED) {
            throw createError(
              ErrorCodes.INVALID_INPUT,
              `Cannot complete task: dependency ${depPath} is not completed`
            );
          }
        }
      }
    }
  }

  private validateMetadata(metadata: Record<string, unknown>): void {
    // Add any specific metadata validation rules here
    // For now, just ensure it's an object
    if (typeof metadata !== 'object' || metadata === null) {
      throw createError(
        ErrorCodes.INVALID_INPUT,
        'Metadata must be an object'
      );
    }
  }

  private async getAllDependencies(path: string): Promise<string[]> {
    const seen = new Set<string>();
    const dependencies: string[] = [];

    const traverse = async (taskPath: string) => {
      if (seen.has(taskPath)) return;
      seen.add(taskPath);

      const task = await this.storage.getTask(taskPath);
      if (task?.dependencies) {
        for (const depPath of task.dependencies) {
          dependencies.push(depPath);
          await traverse(depPath);
        }
      }
    };

    await traverse(path);
    return dependencies;
  }
}
