import { Task, TaskStatus } from '../../../types/task.js';
import { BatchData, BatchResult } from './common/batch-utils.js';
import { BaseBatchProcessor, BatchDependencies, BatchOptions } from './base-batch-processor.js';
import {
  DependencyValidationService,
  ValidationMode,
} from './services/dependency-validation-service.js';
import { StatusTransitionService } from './services/status-transition-service.js';

export interface UnifiedBatchOptions extends BatchOptions {
  validationMode?: ValidationMode;
  suggestSimilarPaths?: boolean;
  stopOnError?: boolean;
}

export interface BatchItemResult {
  path: string;
  success: boolean;
  task?: Task;
  error?: string;
  warnings?: string[];
  suggestions?: string[];
  statusEffects?: Array<{
    path: string;
    fromStatus: TaskStatus;
    toStatus: TaskStatus;
    reason: string;
  }>;
}

export class UnifiedBatchProcessor extends BaseBatchProcessor<BatchItemResult> {
  private readonly dependencyValidator: DependencyValidationService;
  private readonly statusTransitionService: StatusTransitionService;
  protected readonly unifiedOptions: Required<UnifiedBatchOptions>;

  constructor(dependencies: BatchDependencies, options: UnifiedBatchOptions = {}) {
    super(dependencies, options);

    this.unifiedOptions = {
      ...this.defaultOptions,
      validationMode: ValidationMode.STRICT,
      suggestSimilarPaths: true,
      stopOnError: false,
      ...options,
    };

    this.dependencyValidator = new DependencyValidationService(
      this.dependencies.storage.getTask.bind(this.dependencies.storage),
      async () => this.dependencies.storage.getTasksByPattern('**'),
      {
        validateStatus: true,
        suggestSimilar: this.unifiedOptions.suggestSimilarPaths,
        mode: this.unifiedOptions.validationMode,
      }
    );

    this.statusTransitionService = new StatusTransitionService(
      this.dependencies.storage.getTask.bind(this.dependencies.storage),
      async () => this.dependencies.storage.getTasksByPattern('**')
    );
  }

  protected async validate(batch: BatchData[]): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      // Basic validation
      if (!Array.isArray(batch)) {
        errors.push('Batch must be an array');
        return { valid: false, errors };
      }

      if (batch.length === 0) {
        errors.push('Batch cannot be empty');
        return { valid: false, errors };
      }

      if (batch.length > this.unifiedOptions.maxBatchSize) {
        errors.push(
          `Batch size (${batch.length}) exceeds maximum (${this.unifiedOptions.maxBatchSize})`
        );
        return { valid: false, errors };
      }

      // Validate each item
      for (const item of batch) {
        if (!item.id) {
          errors.push('Each batch item must have an id');
          continue;
        }

        // Get task if it exists
        const task = await this.dependencies.storage.getTask(item.id);
        if (!task) {
          errors.push(`Task not found: ${item.id}`);
          continue;
        }

        // Validate dependencies
        const depValidation = await this.dependencyValidator.validateDependencies(
          task,
          task.dependencies,
          this.unifiedOptions.validationMode
        );

        if (!depValidation.valid) {
          const errorMessage = depValidation.errors
            .map(e => `${e.message}${e.suggestion ? ` (${e.suggestion})` : ''}`)
            .join('; ');

          errors.push(`Dependency validation failed for ${item.id}: ${errorMessage}`);
        }
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    } catch (error) {
      this.logger.error('Batch validation failed', { error });
      errors.push(error instanceof Error ? error.message : 'Unknown validation error');
      return { valid: false, errors };
    }
  }

  protected async process(batch: BatchData[]): Promise<BatchResult<BatchItemResult>> {
    const results: BatchItemResult[] = [];
    const errors: Error[] = [];
    const startTime = Date.now();

    try {
      // Sort batch items by dependency order
      const sortedBatch = await this.sortBatchByDependencies(batch);

      for (const item of sortedBatch) {
        try {
          const result = await this.processItem(item);
          results.push(result);

          if (!result.success && this.unifiedOptions.stopOnError) {
            this.logger.warn('Stopping batch processing due to error', {
              item,
              error: result.error,
            });
            break;
          }
        } catch (error) {
          const errorResult: BatchItemResult = {
            path: item.id,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
          results.push(errorResult);
          errors.push(error as Error);

          if (this.unifiedOptions.stopOnError) {
            break;
          }
        }
      }

      const endTime = Date.now();
      return {
        results,
        errors,
        metadata: {
          processingTime: endTime - startTime,
          successCount: results.filter(r => r.success).length,
          errorCount: results.filter(r => !r.success).length,
        },
      };
    } catch (error) {
      this.logger.error('Batch processing failed', { error });
      throw error;
    }
  }

  private async sortBatchByDependencies(batch: BatchData[]): Promise<BatchData[]> {
    const taskMap = new Map<string, Task>();
    const dependencyGraph = new Map<string, Set<string>>();

    // Build dependency graph
    for (const item of batch) {
      const task = await this.dependencies.storage.getTask(item.id);
      if (task) {
        taskMap.set(item.id, task);
        dependencyGraph.set(item.id, new Set(task.dependencies));
      }
    }

    // Topological sort
    const sorted: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (id: string) => {
      if (visited.has(id)) return;
      if (visiting.has(id)) {
        throw new Error(`Circular dependency detected: ${id}`);
      }

      visiting.add(id);

      const deps = dependencyGraph.get(id) || new Set();
      for (const dep of deps) {
        if (taskMap.has(dep)) {
          visit(dep);
        }
      }

      visiting.delete(id);
      visited.add(id);
      sorted.push(id);
    };

    // Visit all nodes
    for (const item of batch) {
      if (!visited.has(item.id)) {
        visit(item.id);
      }
    }

    // Map back to batch items
    return sorted
      .map(id => batch.find(item => item.id === id))
      .filter((item): item is BatchData => item !== undefined);
  }

  private async processItem(item: BatchData): Promise<BatchItemResult> {
    const task = await this.dependencies.storage.getTask(item.id);
    if (!task) {
      return {
        path: item.id,
        success: false,
        error: `Task not found: ${item.id}`,
      };
    }

    try {
      // Validate dependencies
      const depValidation = await this.dependencyValidator.validateDependencies(
        task,
        task.dependencies,
        this.unifiedOptions.validationMode
      );

      // Collect suggestions
      const suggestions = depValidation.details?.suggestions
        ?.filter(s => s.similarity > 0.7)
        .map(s => s.similarPaths)
        .flat();

      // If dependency validation failed in strict mode, return error
      if (!depValidation.valid && this.unifiedOptions.validationMode === ValidationMode.STRICT) {
        return {
          path: item.id,
          success: false,
          error: depValidation.errors.map(e => e.message).join('; '),
          warnings: depValidation.warnings,
          suggestions,
        };
      }

      // Validate status transition if status is being updated
      if ('status' in item) {
        const statusValidation = await this.statusTransitionService.validateTransition(
          task,
          item.status as TaskStatus
        );

        if (!statusValidation.allowed) {
          return {
            path: item.id,
            success: false,
            error: statusValidation.error || 'Invalid status transition',
            warnings: statusValidation.warnings,
            statusEffects: statusValidation.details?.propagation,
          };
        }

        // Update task with new status
        const updatedTask = await this.dependencies.storage.updateTask(task.path, {
          status: statusValidation.newStatus,
          metadata: {
            ...task.metadata,
            statusUpdated: Date.now(),
            previousStatus: task.status,
            statusReason: statusValidation.details?.reason,
          },
        });

        return {
          path: item.id,
          success: true,
          task: updatedTask,
          warnings: statusValidation.warnings,
          statusEffects: statusValidation.details?.propagation,
        };
      }

      // Process other updates
      const updatedTask = await this.dependencies.storage.updateTask(task.path, item);

      return {
        path: item.id,
        success: true,
        task: updatedTask,
        warnings: depValidation.warnings,
        suggestions,
      };
    } catch (error) {
      this.logger.error('Failed to process batch item', {
        error,
        item,
      });

      return {
        path: item.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error processing item',
      };
    }
  }
}
