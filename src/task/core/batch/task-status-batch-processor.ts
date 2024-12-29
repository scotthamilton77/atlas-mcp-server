import { Task, TaskStatus } from '../../../types/task.js';
import { BatchData, BatchResult, ValidationResult, TaskBatchData } from './common/batch-utils.js';
import { BaseBatchProcessor, BatchDependencies, BatchOptions } from './base-batch-processor.js';
import { validateTaskStatusTransition } from '../../validation/index.js';

export interface TaskStatusBatchConfig extends BatchOptions {
  updateDependents?: boolean;
}

export class TaskStatusBatchProcessor extends BaseBatchProcessor<Task> {
  private readonly config: Required<TaskStatusBatchConfig> & Required<BatchOptions>;

  constructor(dependencies: BatchDependencies, config: TaskStatusBatchConfig = {}) {
    super(dependencies, config);
    this.config = Object.assign(
      {},
      this.defaultOptions,
      {
        updateDependents: true,
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

    // Clear any stale cache entries before validation
    if ('clearCache' in this.dependencies.storage) {
      await (this.dependencies.storage as any).clearCache();
    }

    // First pass: validate all status transitions
    for (const task of tasks) {
      const newStatus = task.metadata?.newStatus as TaskStatus;

      if (!newStatus) {
        errors.push(`Task ${task.path} is missing new status in metadata`);
        continue;
      }

      try {
        // Use shared validation utility for status transitions
        await validateTaskStatusTransition(
          task,
          newStatus,
          this.dependencies.storage.getTask.bind(this.dependencies.storage)
        );
      } catch (error) {
        if (error instanceof Error) {
          errors.push(error.message);
        } else {
          errors.push('Unknown validation error occurred');
        }
      }
    }

    // Second pass: validate parent-child status consistency
    for (const task of tasks) {
      const newStatus = task.metadata?.newStatus as TaskStatus;
      if (!newStatus || !task.parentPath) continue;

      const parent = await this.dependencies.storage.getTask(task.parentPath);
      if (!parent) continue;

      const siblings = await this.dependencies.storage.getSubtasks(parent.path);
      const siblingStatuses = new Set(siblings.map((t: Task) => t.status));

      // Check for invalid status combinations
      if (newStatus === TaskStatus.COMPLETED && siblingStatuses.has(TaskStatus.BLOCKED)) {
        errors.push(`Cannot complete task ${task.path} while sibling tasks are blocked`);
      }

      if (newStatus === TaskStatus.IN_PROGRESS && siblingStatuses.has(TaskStatus.FAILED)) {
        errors.push(`Cannot start task ${task.path} while sibling tasks have failed`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
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
          newStatus: task.metadata?.newStatus,
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
        errorCount: errors.length,
      },
    };

    this.logMetrics(result);
    return result;
  }

  private async updateTaskStatus(task: Task, newStatus: TaskStatus): Promise<Task> {
    return await this.dependencies.storage.updateTask(task.path, {
      status: newStatus,
      metadata: {
        ...task.metadata,
        statusUpdatedAt: Date.now(),
        previousStatus: task.status,
      },
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
