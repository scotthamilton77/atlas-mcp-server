import { Task, TaskStatus } from '../../../types/task.js';
import { BatchData, BatchResult, ValidationResult } from './common/batch-utils.js';
import { BaseBatchProcessor, BatchDependencies, BatchOptions } from './base-batch-processor.js';
import { detectDependencyCycle } from '../../validation/index.js';

interface TaskBatchData extends BatchData {
  task: Task;
  dependencies: string[];
}

export class DependencyAwareBatchProcessor extends BaseBatchProcessor {
  private dependencyGraph: Record<string, Set<string>> = {};

  constructor(dependencies: BatchDependencies, options: BatchOptions = {}) {
    super(dependencies, {
      ...options,
      validateBeforeProcess: true, // Always validate dependencies
    });
  }

  protected async validate(batch: BatchData[]): Promise<ValidationResult> {
    const errors: string[] = [];
    const tasks = batch as TaskBatchData[];

    try {
      // Clear any stale cache entries before validation
      if ('clearCache' in this.dependencies.storage) {
        await (this.dependencies.storage as any).clearCache();
      }

      // Build dependency graph
      this.buildDependencyGraph(tasks);

      // First pass: validate task existence and basic structure
      for (const task of tasks) {
        const existingTask = await this.dependencies.storage.getTask(task.task.path);
        if (!existingTask) {
          errors.push(`Task ${task.task.path} not found`);
          continue;
        }

        // Validate task matches stored version
        if (existingTask.metadata.version !== task.task.metadata.version) {
          errors.push(`Task ${task.task.path} has been modified by another process`);
          continue;
        }
      }

      // Check for circular dependencies using shared validation
      for (const taskData of tasks) {
        try {
          const hasCycle = await detectDependencyCycle(
            taskData.task,
            taskData.dependencies,
            this.dependencies.storage.getTask.bind(this.dependencies.storage)
          );
          if (hasCycle) {
            errors.push(`Circular dependency detected for task ${taskData.task.path}`);
          }
        } catch (error) {
          if (error instanceof Error) {
            errors.push(error.message);
          } else {
            errors.push('Unknown error checking dependencies');
          }
        }
      }

      // Validate each task's dependencies exist
      for (const task of tasks) {
        const missingDeps = await this.findMissingDependencies(task);
        if (missingDeps.length > 0) {
          errors.push(`Task ${task.id} has missing dependencies: ${missingDeps.join(', ')}`);
        }
      }

      // Validate dependency status
      for (const task of tasks) {
        const blockedDeps = await this.findBlockedDependencies(task);
        if (blockedDeps.length > 0) {
          errors.push(`Task ${task.id} has blocked dependencies: ${blockedDeps.join(', ')}`);
        }
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    } catch (error) {
      this.logger.error('Dependency validation failed', { error });
      errors.push(`Validation error: ${(error as Error).message}`);
      return { valid: false, errors };
    }
  }

  protected async process<T>(batch: BatchData[]): Promise<BatchResult<T>> {
    const tasks = batch as TaskBatchData[];
    const results: T[] = [];
    const errors: Error[] = [];
    const startTime = Date.now();

    try {
      // Process tasks in dependency order
      const processingOrder = this.getProcessingOrder();

      for (const taskId of processingOrder) {
        const task = tasks.find(t => t.id === taskId);
        if (!task) continue;

        try {
          // Process the task
          const result = await this.withRetry(
            async () => this.processTask(task),
            `Processing task ${task.id}`
          );

          results.push(result as T);

          this.logger.debug('Task processed successfully', {
            taskId: task.id,
            dependencies: task.dependencies,
          });
        } catch (error) {
          this.logger.error('Failed to process task', {
            error,
            taskId: task.id,
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
    } finally {
      // Clear dependency graph
      this.dependencyGraph = {};
    }
  }

  private buildDependencyGraph(tasks: TaskBatchData[]): void {
    this.dependencyGraph = {};

    for (const task of tasks) {
      if (!this.dependencyGraph[task.id]) {
        this.dependencyGraph[task.id] = new Set();
      }

      for (const dep of task.dependencies) {
        this.dependencyGraph[task.id].add(dep);
      }
    }
  }

  private async findMissingDependencies(task: TaskBatchData): Promise<string[]> {
    const missing: string[] = [];

    for (const depId of task.dependencies) {
      const depTask = await this.dependencies.storage.getTask(depId);
      if (!depTask) {
        missing.push(depId);
      }
    }

    return missing;
  }

  private async findBlockedDependencies(task: TaskBatchData): Promise<string[]> {
    const blocked: string[] = [];

    for (const depId of task.dependencies) {
      const depTask = await this.dependencies.storage.getTask(depId);
      if (depTask && depTask.status === TaskStatus.BLOCKED) {
        blocked.push(depId);
      }
    }

    return blocked;
  }

  private getProcessingOrder(): string[] {
    const visited = new Set<string>();
    const order: string[] = [];

    const visit = (taskId: string) => {
      if (visited.has(taskId)) return;
      visited.add(taskId);

      const dependencies = this.dependencyGraph[taskId] || new Set();
      for (const depId of dependencies) {
        visit(depId);
      }

      order.push(taskId);
    };

    for (const taskId of Object.keys(this.dependencyGraph)) {
      visit(taskId);
    }

    return order;
  }

  private async processTask(task: TaskBatchData): Promise<Task> {
    try {
      // Re-fetch task to ensure we have latest state
      const currentTask = await this.dependencies.storage.getTask(task.task.path);
      if (!currentTask) {
        throw new Error(`Task ${task.task.path} not found during processing`);
      }

      // Check dependencies are complete
      const incompleteDeps: string[] = [];
      const failedDeps: string[] = [];

      for (const depId of task.dependencies) {
        const depTask = await this.dependencies.storage.getTask(depId);
        if (!depTask) {
          incompleteDeps.push(depId);
        } else if (depTask.status === TaskStatus.CANCELLED) {
          failedDeps.push(depId);
        } else if (depTask.status !== TaskStatus.COMPLETED) {
          incompleteDeps.push(depId);
        }
      }

      // Handle dependency issues
      if (failedDeps.length > 0) {
        // If any dependencies failed, mark this task as failed
        return await this.dependencies.storage.updateTask(task.task.path, {
          status: TaskStatus.CANCELLED,
          metadata: {
            ...currentTask.metadata,
            failureReason: `Dependencies failed: ${failedDeps.join(', ')}`,
            updated: Date.now(),
            version: currentTask.metadata.version + 1,
          },
        });
      }

      if (incompleteDeps.length > 0) {
        // If dependencies are incomplete, mark as blocked
        return await this.dependencies.storage.updateTask(task.task.path, {
          status: TaskStatus.BLOCKED,
          metadata: {
            ...currentTask.metadata,
            blockedBy: incompleteDeps,
            updated: Date.now(),
            version: currentTask.metadata.version + 1,
          },
        });
      }

      // All dependencies complete, process the task
      const processedTask = await this.dependencies.storage.updateTask(task.task.path, {
        status: TaskStatus.COMPLETED,
        metadata: {
          ...currentTask.metadata,
          completedAt: Date.now(),
          updated: Date.now(),
          version: currentTask.metadata.version + 1,
        },
      });

      return processedTask;
    } catch (error) {
      this.logger.error('Failed to process task', {
        error,
        taskPath: task.task.path,
        dependencies: task.dependencies,
      });
      throw error;
    }
  }
}
