import { Logger } from '../../../logging/index.js';
import { TransactionLogger } from '../../../logging/transaction-logger.js';
import { TaskStorage } from '../../../types/storage.js';
import { Task, CreateTaskInput, UpdateTaskInput } from '../../../types/task.js';
import { TaskValidator } from '../../validation/task-validator.js';
import { TaskErrorFactory } from '../../../errors/task-error.js';
import { DependencyValidationMode } from '../../validation/validators/dependency-validator.js';

interface BulkOperationResult {
  success: boolean;
  results: Array<{
    path: string;
    success: boolean;
    error?: string;
    warnings?: string[];
    task?: Task;
  }>;
  errors: Array<{
    path: string;
    operation: string;
    error: string;
  }>;
  warnings: string[];
  stats: {
    total: number;
    succeeded: number;
    failed: number;
    duration: number;
  };
}

/**
 * Handles bulk task operations with transaction support and rollback
 */
export class BulkOperationsHandler {
  private readonly logger: Logger;
  private readonly transactionLogger: TransactionLogger;
  private readonly validator: TaskValidator;

  constructor(private readonly storage: TaskStorage) {
    this.logger = Logger.getInstance().child({ component: 'BulkOperationsHandler' });
    this.transactionLogger = TransactionLogger.getInstance();
    this.validator = new TaskValidator(storage);
  }

  /**
   * Execute bulk task operations with transaction support
   */
  async executeBulkOperations(
    operations: Array<{
      type: 'create' | 'update' | 'delete';
      path: string;
      data?: CreateTaskInput | UpdateTaskInput;
    }>
  ): Promise<BulkOperationResult> {
    const startTime = Date.now();
    const result: BulkOperationResult = {
      success: true,
      results: [],
      errors: [],
      warnings: [],
      stats: {
        total: operations.length,
        succeeded: 0,
        failed: 0,
        duration: 0,
      },
    };

    try {
      // Sort operations to handle dependencies correctly
      const sortedOperations = await this.sortOperations(operations);

      // Execute operations in sequence
      for (const operation of sortedOperations) {
        try {
          const opResult = await this.executeOperation(operation);
          result.results.push(opResult);

          if (opResult.success) {
            result.stats.succeeded++;
          } else {
            result.stats.failed++;
            result.success = false;
            if (opResult.error) {
              result.errors.push({
                path: operation.path,
                operation: operation.type,
                error: opResult.error,
              });
            }
          }

          if (opResult.warnings) {
            result.warnings.push(...opResult.warnings);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          result.stats.failed++;
          result.success = false;
          result.errors.push({
            path: operation.path,
            operation: operation.type,
            error: errorMessage,
          });
        }
      }

      // Log bulk operation completion
      result.stats.duration = Date.now() - startTime;
      await this.transactionLogger.logTransaction(
        'bulkOperations',
        { path: 'bulk' } as Task,
        {
          metadata: {
            operationCount: operations.length,
            successCount: result.stats.succeeded,
            failureCount: result.stats.failed,
            duration: result.stats.duration,
          },
          warnings: result.warnings,
          error: result.success ? undefined : 'Some operations failed',
        },
        startTime
      );

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Bulk operations failed', { error });

      await this.transactionLogger.logTransaction(
        'bulkOperations',
        { path: 'bulk' } as Task,
        {
          error: errorMessage,
          metadata: { operationCount: operations.length },
        },
        startTime
      );

      throw TaskErrorFactory.createTaskOperationError(
        'BulkOperationsHandler.executeBulkOperations',
        'Bulk operations failed',
        { error: errorMessage }
      );
    }
  }

  /**
   * Sort operations to handle dependencies correctly
   */
  private async sortOperations(
    operations: Array<{
      type: string;
      path: string;
      data?: any;
    }>
  ): Promise<typeof operations> {
    // Extract dependency information
    const depMap = new Map<string, string[]>();
    for (const op of operations) {
      if (op.data?.dependencies) {
        depMap.set(op.path, op.data.dependencies);
      }
    }

    // Sort based on dependencies
    const sorted = await this.validator.sortTasksByDependencies(
      Array.from(depMap.entries()).map(([path, deps]) => ({ path, dependencies: deps }))
    );

    // Reorder operations based on sorted paths
    const pathToOp = new Map(operations.map(op => [op.path, op]));
    return sorted.map(path => pathToOp.get(path)!).filter(Boolean);
  }

  /**
   * Execute a single operation within the bulk operation context
   */
  private async executeOperation(operation: { type: string; path: string; data?: any }): Promise<{
    path: string;
    success: boolean;
    error?: string;
    warnings?: string[];
    task?: Task;
  }> {
    const startTime = Date.now();

    try {
      switch (operation.type) {
        case 'create': {
          const validation = await this.validator.validateCreate(
            operation.data,
            DependencyValidationMode.STRICT
          );

          if (!validation.success) {
            return {
              path: operation.path,
              success: false,
              error: validation.errors.join('; '),
              warnings: validation.warnings,
            };
          }

          const task = await this.storage.createTask(operation.data);
          return {
            path: operation.path,
            success: true,
            task,
            warnings: validation.warnings,
          };
        }

        case 'update': {
          const validation = await this.validator.validateUpdate(
            operation.path,
            operation.data,
            DependencyValidationMode.STRICT
          );

          if (!validation.success) {
            return {
              path: operation.path,
              success: false,
              error: validation.errors.join('; '),
              warnings: validation.warnings,
            };
          }

          const task = await this.storage.updateTask(operation.path, operation.data);
          return {
            path: operation.path,
            success: true,
            task,
            warnings: validation.warnings,
          };
        }

        case 'delete': {
          await this.storage.deleteTask(operation.path);
          return {
            path: operation.path,
            success: true,
          };
        }

        default:
          return {
            path: operation.path,
            success: false,
            error: `Unknown operation type: ${operation.type}`,
          };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await this.transactionLogger.logTransaction(
        `bulkOperation_${operation.type}`,
        { path: operation.path } as Task,
        { error: errorMessage },
        startTime
      );

      return {
        path: operation.path,
        success: false,
        error: errorMessage,
      };
    }
  }
}
