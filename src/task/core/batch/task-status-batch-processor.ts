import { Task, TaskStatus } from '../../../types/task.js';
import { BatchData, BatchResult, ValidationResult, TaskBatchData } from './common/batch-utils.js';
import { BaseBatchProcessor, BatchDependencies, BatchOptions } from './base-batch-processor.js';

export interface TaskStatusBatchConfig extends BatchOptions {
  allowedTransitions?: Record<TaskStatus, TaskStatus[]>;
  validateDependencies?: boolean;
  updateDependents?: boolean;
}

const DEFAULT_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.PENDING]: [TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED],
  [TaskStatus.IN_PROGRESS]: [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.BLOCKED],
  [TaskStatus.COMPLETED]: [TaskStatus.IN_PROGRESS],
  [TaskStatus.FAILED]: [TaskStatus.PENDING],
  [TaskStatus.BLOCKED]: [TaskStatus.PENDING]
};

export class TaskStatusBatchProcessor extends BaseBatchProcessor<Task> {
  private readonly config: Required<TaskStatusBatchConfig> & Required<BatchOptions>;

  constructor(
    dependencies: BatchDependencies,
    config: TaskStatusBatchConfig = {}
  ) {
    super(dependencies, config);
    this.config = Object.assign(
      {},
      this.defaultOptions,
      {
        allowedTransitions: DEFAULT_TRANSITIONS,
        validateDependencies: true,
        updateDependents: true
      },
      config
    ) as Required<TaskStatusBatchConfig> & Required<BatchOptions>;
  }

  protected async validate(batch: BatchData[]): Promise<ValidationResult> {
    const errors: string[] = [];
    const tasks = batch.map(item => (item as TaskBatchData).data);

    if (!Array.isArray(batch)) {
      errors.push('Batch must be an array');
      return { valid: false, errors };
    }

    if (batch.length === 0) {
      errors.push('Batch cannot be empty');
      return { valid: false, errors };
    }

    for (const task of tasks) {
      const currentStatus = task.status;
      const newStatus = task.metadata?.newStatus as TaskStatus;

      if (!newStatus) {
        errors.push(`Task ${task.path} is missing new status in metadata`);
        continue;
      }

      const allowedTransitions = this.config.allowedTransitions[currentStatus];
      if (!allowedTransitions?.includes(newStatus)) {
        errors.push(
          `Invalid status transition for task ${task.path}: ${currentStatus} -> ${newStatus}`
        );
      }

      if (this.config.validateDependencies && newStatus === TaskStatus.COMPLETED) {
        const invalidDeps = await this.validateDependencies(task);
        errors.push(...invalidDeps);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  protected async process(batch: BatchData[]): Promise<BatchResult<Task>> {
    const tasks = batch.map(item => (item as TaskBatchData).data);
    const results: Task[] = [];
    const errors: Error[] = [];
    const startTime = Date.now();

    for (const task of tasks) {
      try {
        const newStatus = task.metadata?.newStatus as TaskStatus;
        const updatedTask = await this.updateTaskStatus(task, newStatus);
        results.push(updatedTask);

        if (this.config.updateDependents) {
          await this.updateDependentTasks(updatedTask);
        }
      } catch (error) {
        errors.push(error as Error);
        this.logger.error('Failed to update task status', {
          error,
          taskPath: task.path,
          newStatus: task.metadata?.newStatus
        });
      }
    }

    const endTime = Date.now();
    const result: BatchResult<Task> = {
      results,
      errors,
      metadata: {
        processingTime: endTime - startTime,
        successCount: results.length,
        errorCount: errors.length
      }
    };

    this.logMetrics(result);
    return result;
  }

  private async validateDependencies(task: Task): Promise<string[]> {
    const errors: string[] = [];

    for (const depPath of task.dependencies) {
      const depTask = await this.dependencies.storage.getTask(depPath);
      if (!depTask) {
        errors.push(`Task ${task.path} has missing dependency: ${depPath}`);
      } else if (depTask.status !== TaskStatus.COMPLETED) {
        errors.push(
          `Task ${task.path} has incomplete dependency: ${depPath} (${depTask.status})`
        );
      }
    }

    return errors;
  }

  private async updateTaskStatus(task: Task, newStatus: TaskStatus): Promise<Task> {
    return await this.dependencies.storage.updateTask(task.path, {
      status: newStatus,
      metadata: {
        ...task.metadata,
        statusUpdatedAt: Date.now(),
        previousStatus: task.status
      }
    });
  }

  private async updateDependentTasks(task: Task): Promise<void> {
    const dependentTasks = await this.dependencies.storage.getDependentTasks(task.path);

    for (const depTask of dependentTasks) {
      if (task.status === TaskStatus.BLOCKED || task.status === TaskStatus.FAILED) {
        await this.updateTaskStatus(depTask, TaskStatus.BLOCKED);
      } else if (task.status === TaskStatus.COMPLETED) {
        const allDepsCompleted = await this.areAllDependenciesCompleted(depTask);
        if (allDepsCompleted && depTask.status === TaskStatus.BLOCKED) {
          await this.updateTaskStatus(depTask, TaskStatus.PENDING);
        }
      }
    }
  }

  private async areAllDependenciesCompleted(task: Task): Promise<boolean> {
    for (const depPath of task.dependencies) {
      const depTask = await this.dependencies.storage.getTask(depPath);
      if (!depTask || depTask.status !== TaskStatus.COMPLETED) {
        return false;
      }
    }
    return true;
  }
}
