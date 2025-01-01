import { Task, TaskStatus } from '../../../types/task.js';
import { BatchData, BatchResult, ValidationResult } from './common/batch-utils.js';
import { BaseBatchProcessor, BatchDependencies, BatchOptions } from './base-batch-processor.js';
import { TaskValidators } from '../../validation/validators/index.js';

interface StatusBatchData extends BatchData {
  task: Task;
  newStatus: TaskStatus;
}

export class TaskStatusBatchProcessor extends BaseBatchProcessor {
  private readonly validators: TaskValidators;

  constructor(dependencies: BatchDependencies, options: BatchOptions = {}) {
    super(dependencies, {
      ...options,
      validateBeforeProcess: true, // Always validate status transitions
    });
    this.validators = new TaskValidators();
  }

  protected async validate(batch: BatchData[]): Promise<ValidationResult> {
    const errors: string[] = [];
    const tasks = batch as StatusBatchData[];

    try {
      // Clear any stale cache entries before validation
      if ('clearCache' in this.dependencies.storage) {
        await (this.dependencies.storage as any).clearCache();
      }

      // Validate each status transition
      for (const task of tasks) {
        try {
          await this.validators.validateStatusTransition(
            task.task,
            task.newStatus,
            this.dependencies.storage.getTask.bind(this.dependencies.storage)
          );
        } catch (error) {
          errors.push(
            `Invalid status transition for task ${task.task.path}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    } catch (error) {
      this.logger.error('Status validation failed', { error });
      errors.push(`Validation error: ${(error as Error).message}`);
      return { valid: false, errors };
    }
  }

  protected async process<T>(batch: BatchData[]): Promise<BatchResult<T>> {
    const tasks = batch as StatusBatchData[];
    const results: T[] = [];
    const errors: Error[] = [];
    const startTime = Date.now();

    try {
      for (const task of tasks) {
        try {
          // Process the status update
          const result = await this.withRetry(
            async () => this.processStatusUpdate(task),
            `Updating status for task ${task.task.path}`
          );

          results.push(result as T);

          this.logger.debug('Task status updated successfully', {
            taskPath: task.task.path,
            oldStatus: task.task.status,
            newStatus: task.newStatus,
          });
        } catch (error) {
          this.logger.error('Failed to update task status', {
            error,
            taskPath: task.task.path,
          });
          errors.push(error as Error);
        }
      }

      const endTime = Date.now();
      const result: BatchResult<T> = {
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
    } catch (error) {
      this.logger.error('Batch processing failed', { error });
      throw error;
    }
  }

  private async processStatusUpdate(task: StatusBatchData): Promise<Task> {
    try {
      // Re-fetch task to ensure we have latest state
      const currentTask = await this.dependencies.storage.getTask(task.task.path);
      if (!currentTask) {
        throw new Error(`Task ${task.task.path} not found during processing`);
      }

      // Update task status
      const updatedTask = await this.dependencies.storage.updateTask(task.task.path, {
        status: task.newStatus,
        metadata: {
          ...currentTask.metadata,
          statusUpdated: Date.now(),
          previousStatus: currentTask.status,
          version: currentTask.metadata.version + 1,
        },
      });

      return updatedTask;
    } catch (error) {
      this.logger.error('Failed to update task status', {
        error,
        taskPath: task.task.path,
        newStatus: task.newStatus,
      });
      throw error;
    }
  }
}
