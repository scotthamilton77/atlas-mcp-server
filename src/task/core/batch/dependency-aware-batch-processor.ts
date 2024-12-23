import { Task, TaskStatus } from '../../../types/task.js';
import { BatchData, BatchResult, ValidationResult } from './common/batch-utils.js';
import { BaseBatchProcessor, BatchDependencies, BatchOptions } from './base-batch-processor.js';

interface TaskBatchData extends BatchData {
  task: Task;
  dependencies: string[];
}

interface DependencyGraph {
  [taskId: string]: Set<string>;
}

export class DependencyAwareBatchProcessor extends BaseBatchProcessor {
  private dependencyGraph: DependencyGraph = {};

  constructor(
    dependencies: BatchDependencies,
    options: BatchOptions = {}
  ) {
    super(dependencies, {
      ...options,
      validateBeforeProcess: true // Always validate dependencies
    });
  }

  protected async validate(batch: BatchData[]): Promise<ValidationResult> {
    const errors: string[] = [];
    const tasks = batch as TaskBatchData[];

    try {
      // Build dependency graph
      this.buildDependencyGraph(tasks);

      // Check for circular dependencies
      const circularDeps = this.findCircularDependencies();
      if (circularDeps.length > 0) {
        errors.push(`Circular dependencies detected: ${circularDeps.join(' -> ')}`);
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
          errors.push(
            `Task ${task.id} has blocked dependencies: ${blockedDeps.join(', ')}`
          );
        }
      }

      return {
        valid: errors.length === 0,
        errors
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
            dependencies: task.dependencies
          });
        } catch (error) {
          this.logger.error('Failed to process task', {
            error,
            taskId: task.id
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
          errorCount: errors.length
        }
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

  private findCircularDependencies(): string[] {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    const dfs = (taskId: string): boolean => {
      visited.add(taskId);
      recursionStack.add(taskId);
      path.push(taskId);

      const dependencies = this.dependencyGraph[taskId] || new Set();
      for (const depId of dependencies) {
        if (!visited.has(depId)) {
          if (dfs(depId)) return true;
        } else if (recursionStack.has(depId)) {
          // Found circular dependency
          path.push(depId); // Add the repeated dependency to show the cycle
          return true;
        }
      }

      path.pop();
      recursionStack.delete(taskId);
      return false;
    };

    for (const taskId of Object.keys(this.dependencyGraph)) {
      if (!visited.has(taskId)) {
        if (dfs(taskId)) {
          return path;
        }
      }
    }

    return [];
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
    // Check dependencies are complete
    for (const depId of task.dependencies) {
      const depTask = await this.dependencies.storage.getTask(depId);
      if (!depTask || depTask.status !== TaskStatus.COMPLETED) {
        throw new Error(`Dependency ${depId} is not completed`);
      }
    }

    // Process the task (implementation will vary based on task type)
    const processedTask = await this.dependencies.storage.updateTask(
      task.task.path,
      { status: TaskStatus.COMPLETED }
    );

    return processedTask;
  }
}
