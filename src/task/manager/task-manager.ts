import {
  Task,
  TaskStatus,
  CreateTaskInput,
  UpdateTaskInput,
  TaskResponse,
} from '../../types/task.js';
import { TaskStorage } from '../../types/storage.js';
import { Logger } from '../../logging/index.js';
import { TaskErrorFactory } from '../../errors/task-error.js';
import { TaskOperations } from '../operations/task-operations.js';
import { TaskStatusBatchProcessor } from '../core/batch/task-status-batch-processor.js';
import { DependencyAwareBatchProcessor } from '../core/batch/dependency-aware-batch-processor.js';
import { TaskValidator } from '../validation/task-validator.js';
import { TaskEventHandler } from './task-event-handler.js';
import { TaskCacheManager } from './task-cache-manager.js';
import { DependencyValidationMode } from '../validation/validators/dependency-validator.js';
import { HierarchyValidationMode } from '../validation/validators/hierarchy-validator.js';
import { ToolHandler } from '../../tools/handler.js';

interface TaskManagerMetadata {
  timestamp: number;
  requestId: string;
  projectPath: string;
  affectedPaths: string[];
  pagination?: {
    limit: number;
    offset: number;
  };
  operationCount?: number;
  successCount?: number;
}

export class TaskManager {
  private static logger: Logger;
  private operations!: TaskOperations;
  private readonly validator: TaskValidator;
  private readonly statusBatchProcessor: TaskStatusBatchProcessor;
  private readonly dependencyBatchProcessor: DependencyAwareBatchProcessor;
  private readonly eventHandler: TaskEventHandler;
  private readonly cacheManager: TaskCacheManager;
  private static instance: TaskManager | null = null;
  private initialized = false;
  private static initializationMutex = new Set<string>();
  private static instanceId = Math.random().toString(36).substr(2, 9);
  private toolHandler!: ToolHandler;

  private constructor(readonly storage: TaskStorage) {
    TaskManager.initLogger();
    this.validator = new TaskValidator(storage);
    this.eventHandler = new TaskEventHandler();
    this.cacheManager = new TaskCacheManager();

    const batchDeps = {
      storage,
      validator: this.validator,
      logger: TaskManager.logger,
      cacheManager: this.cacheManager,
    };
    this.statusBatchProcessor = new TaskStatusBatchProcessor(batchDeps);
    this.dependencyBatchProcessor = new DependencyAwareBatchProcessor(batchDeps);
  }

  private static initLogger(): void {
    if (!TaskManager.logger) {
      TaskManager.logger = Logger.getInstance().child({
        component: 'TaskManager',
        context: {
          instanceId: TaskManager.instanceId,
        },
      });
    }
  }

  private async initializeComponents(): Promise<void> {
    // Initialize tool handler first to ensure tools are available
    this.toolHandler = new ToolHandler(this);

    // Then initialize other components
    this.operations = await TaskOperations.getInstance(this.storage, this.validator);
    this.cacheManager.setStorage(this.storage);

    // Wait for tool handler to be ready
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  static async getInstance(storage: TaskStorage): Promise<TaskManager> {
    const mutexKey = `taskmanager-${TaskManager.instanceId}`;

    if (TaskManager.instance?.initialized) {
      return TaskManager.instance;
    }

    while (TaskManager.initializationMutex.has(mutexKey)) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    if (TaskManager.instance?.initialized) {
      return TaskManager.instance;
    }

    TaskManager.initializationMutex.add(mutexKey);

    try {
      if (!TaskManager.instance) {
        TaskManager.instance = new TaskManager(storage);
      }

      if (!TaskManager.instance.initialized) {
        await TaskManager.instance.initialize();
      }

      return TaskManager.instance;
    } catch (error) {
      TaskManager.instance = null;
      throw TaskErrorFactory.createTaskInitializationError(
        'TaskManager.getInstance',
        error instanceof Error ? error : new Error(String(error))
      );
    } finally {
      TaskManager.initializationMutex.delete(mutexKey);
    }
  }

  private async initialize(): Promise<void> {
    if (this.initialized) {
      TaskManager.logger.debug('Task manager already initialized');
      return;
    }

    try {
      TaskManager.logger.info('Initializing task manager components', {
        context: {
          operation: 'initialize',
          timestamp: Date.now(),
        },
      });

      await this.initializeComponents();
      this.initialized = true;

      TaskManager.logger.info('Task manager initialization completed', {
        context: {
          operation: 'initialize',
          timestamp: Date.now(),
          components: ['toolHandler', 'operations', 'cacheManager'],
        },
      });
    } catch (error) {
      TaskManager.logger.error('Failed to initialize task manager', { error });
      throw TaskErrorFactory.createTaskInitializationError(
        'TaskManager.initialize',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  private createResponse<T>(data: T, metadata: Partial<TaskManagerMetadata>): TaskResponse<T> {
    const baseMetadata = {
      timestamp: Date.now(),
      requestId: Math.random().toString(36).substring(7),
      projectPath: this.getProjectPath(data),
      affectedPaths: this.getAffectedPaths(data),
      ...metadata,
    };

    return {
      success: true,
      data,
      metadata: baseMetadata,
    };
  }

  private getProjectPath(data: unknown): string {
    if (data && typeof data === 'object' && 'projectPath' in data) {
      return (data as { projectPath: string }).projectPath;
    }
    if (Array.isArray(data) && data[0] && typeof data[0] === 'object' && 'projectPath' in data[0]) {
      return (data[0] as { projectPath: string }).projectPath;
    }
    return 'unknown';
  }

  private getAffectedPaths(data: unknown): string[] {
    if (data && typeof data === 'object' && 'path' in data) {
      return [(data as { path: string }).path];
    }
    if (Array.isArray(data)) {
      return data.map(item =>
        item && typeof item === 'object' && 'path' in item
          ? (item as { path: string }).path
          : 'unknown'
      );
    }
    return [];
  }

  async createTask(
    input: CreateTaskInput,
    options: {
      dependencyMode?: DependencyValidationMode;
      hierarchyMode?: HierarchyValidationMode;
    } = {}
  ): Promise<TaskResponse<Task>> {
    try {
      if (!input.name) {
        throw TaskErrorFactory.createTaskValidationError(
          'TaskManager.createTask',
          'Task name is required',
          { input }
        );
      }

      const result = await this.operations.createTask(input, options);
      await this.cacheManager.indexTask(result);

      TaskManager.logger.info('Task created successfully', {
        taskId: result.path,
        type: result.type,
        parentPath: input.parentPath,
      });

      this.eventHandler.emitTaskCreated(result.path, result, { input });

      return this.createResponse(result, {});
    } catch (error) {
      TaskManager.logger.error('Failed to create task', {
        error,
        input,
        context: {
          path: input.path,
          parentPath: input.parentPath,
          type: input.type,
        },
      });
      throw error;
    }
  }

  async updateTask(path: string, updates: UpdateTaskInput): Promise<TaskResponse<Task>> {
    try {
      const oldTask = await this.cacheManager.getTaskByPath(path);
      if (!oldTask) {
        throw TaskErrorFactory.createTaskNotFoundError('TaskManager.updateTask', path);
      }

      const result = await this.operations.updateTask(path, updates);
      await this.cacheManager.indexTask(result);

      TaskManager.logger.info('Task updated successfully', {
        taskId: result.path,
        updates,
        oldStatus: oldTask.status,
        newStatus: result.status,
      });

      this.eventHandler.emitTaskUpdated(result.path, result, oldTask);

      return this.createResponse(result, {});
    } catch (error) {
      TaskManager.logger.error('Failed to update task', {
        error,
        context: {
          path,
          updates,
          operation: 'updateTask',
        },
      });
      throw error;
    }
  }

  async updateTaskStatuses(
    updates: { path: string; status: TaskStatus }[]
  ): Promise<TaskResponse<Task[]>> {
    try {
      const batch = updates.map(update => ({
        id: update.path,
        data: {
          path: update.path,
          metadata: { newStatus: update.status },
        },
      }));

      const result = await this.statusBatchProcessor.execute(batch);

      if (result.errors.length > 0) {
        throw TaskErrorFactory.createTaskStatusError(
          'TaskManager.updateTaskStatuses',
          'Failed to update task statuses',
          {
            errors: result.errors,
            updates,
          }
        );
      }

      const tasks = result.results as Task[];

      for (const task of tasks) {
        await this.cacheManager.indexTask(task);
      }

      return this.createResponse(tasks, {
        operationCount: updates.length,
        successCount: tasks.length,
      });
    } catch (error) {
      TaskManager.logger.error('Failed to update task statuses', {
        error,
        updates,
      });
      throw error;
    }
  }

  async updateTaskDependencies(
    updates: { path: string; dependencies: string[] }[]
  ): Promise<TaskResponse<Task[]>> {
    try {
      const batch = updates.map(update => ({
        id: update.path,
        data: {
          path: update.path,
          dependencies: update.dependencies,
        },
      }));

      const result = await this.dependencyBatchProcessor.execute(batch);

      if (result.errors.length > 0) {
        throw TaskErrorFactory.createTaskDependencyError(
          'TaskManager.updateTaskDependencies',
          'Failed to update task dependencies',
          {
            errors: result.errors,
            updates,
          }
        );
      }

      const tasks = result.results as Task[];

      for (const task of tasks) {
        await this.cacheManager.indexTask(task);
      }

      return this.createResponse(tasks, {
        operationCount: updates.length,
        successCount: tasks.length,
      });
    } catch (error) {
      TaskManager.logger.error('Failed to update task dependencies', {
        error,
        updates,
      });
      throw error;
    }
  }

  async getTaskByPath(path: string): Promise<Task | null> {
    try {
      return await this.cacheManager.getTaskByPath(path);
    } catch (error) {
      TaskManager.logger.error('Failed to get task by path', { error, path });
      throw TaskErrorFactory.createTaskStorageError(
        'TaskManager.getTaskByPath',
        error instanceof Error ? error : new Error(String(error)),
        { path }
      );
    }
  }

  async listTasks(
    pathPattern: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<TaskResponse<Task[]>> {
    try {
      const tasks = await this.cacheManager.getTasksByPattern(pathPattern, limit, offset);
      return this.createResponse(tasks, {
        pagination: { limit, offset },
      });
    } catch (error) {
      TaskManager.logger.error('Failed to list tasks', { error, pathPattern });
      throw TaskErrorFactory.createTaskStorageError(
        'TaskManager.listTasks',
        error instanceof Error ? error : new Error(String(error)),
        { pathPattern, limit, offset }
      );
    }
  }

  async getTasksByStatus(
    status: TaskStatus,
    limit: number = 100,
    offset: number = 0
  ): Promise<TaskResponse<Task[]>> {
    try {
      const tasks = await this.cacheManager.getTasksByStatus(status, undefined, limit, offset);
      return this.createResponse(tasks, {
        pagination: { limit, offset },
      });
    } catch (error) {
      TaskManager.logger.error('Failed to get tasks by status', { error, status });
      throw TaskErrorFactory.createTaskStorageError(
        'TaskManager.getTasksByStatus',
        error instanceof Error ? error : new Error(String(error)),
        { status, limit, offset }
      );
    }
  }

  async getSubtasks(
    parentPath: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<TaskResponse<Task[]>> {
    try {
      const tasks = await this.cacheManager.getTasksByParent(parentPath, limit, offset);
      return this.createResponse(tasks, {
        pagination: { limit, offset },
      });
    } catch (error) {
      TaskManager.logger.error('Failed to get subtasks', { error, parentPath });
      throw TaskErrorFactory.createTaskStorageError(
        'TaskManager.getSubtasks',
        error instanceof Error ? error : new Error(String(error)),
        { parentPath, limit, offset }
      );
    }
  }

  async deleteTask(path: string): Promise<TaskResponse<void>> {
    try {
      const task = await this.storage.getTask(path);
      if (task) {
        this.eventHandler.emitTaskDeleted(path, task);
        await this.cacheManager.unindexTask(task);
      }
      await this.operations.deleteTask(path);
      return this.createResponse(undefined, {
        affectedPaths: [path],
      });
    } catch (error) {
      TaskManager.logger.error('Failed to delete task', {
        error,
        context: {
          path,
          operation: 'deleteTask',
        },
      });
      throw TaskErrorFactory.createTaskOperationError(
        'TaskManager.deleteTask',
        'Failed to delete task',
        { path, error }
      );
    }
  }

  async clearAllTasks(confirm: boolean): Promise<void> {
    if (!confirm) {
      throw TaskErrorFactory.createTaskValidationError(
        'TaskManager.clearAllTasks',
        'Must explicitly confirm task deletion',
        {
          context: 'Clear all tasks',
          required: 'explicit confirmation',
        }
      );
    }

    try {
      const tasks = await this.storage.getTasksByPattern('*');
      const taskCount = tasks.length;

      await this.storage.beginTransaction();

      try {
        await this.storage.clearAllTasks();
        await this.cacheManager.clearCaches();

        if (global.gc) {
          global.gc();
        }

        await this.storage.commitTransaction();

        try {
          await this.storage.vacuum();
          await this.storage.analyze();
          await this.storage.checkpoint();
        } catch (optimizeError) {
          TaskManager.logger.warn('Failed to optimize database after clearing tasks', {
            error: optimizeError,
            operation: 'clearAllTasks',
          });
        }

        TaskManager.logger.info('Database and caches reset', {
          tasksCleared: taskCount,
          operation: 'clearAllTasks',
        });
      } catch (error) {
        await this.storage.rollbackTransaction();
        throw error;
      }
    } catch (error) {
      TaskManager.logger.error('Failed to clear tasks', {
        error,
        context: {
          operation: 'clearAllTasks',
          confirm,
        },
      });
      throw TaskErrorFactory.createTaskOperationError(
        'TaskManager.clearAllTasks',
        'Failed to clear all tasks',
        { confirm, error }
      );
    }
  }

  async vacuumDatabase(analyze: boolean = true): Promise<void> {
    try {
      await this.storage.vacuum();
      if (analyze) {
        await this.storage.analyze();
      }
      await this.storage.checkpoint();
      TaskManager.logger.info('Database optimized', { analyzed: analyze });
    } catch (error) {
      TaskManager.logger.error('Failed to optimize database', { error });
      throw TaskErrorFactory.createTaskStorageError(
        'TaskManager.vacuumDatabase',
        error instanceof Error ? error : new Error(String(error)),
        { analyze }
      );
    }
  }

  async repairRelationships(
    dryRun: boolean = false,
    pathPattern?: string
  ): Promise<{ fixed: number; issues: string[] }> {
    try {
      const result = await this.storage.repairRelationships(dryRun);
      if (!dryRun) {
        await this.initialize();
      }
      TaskManager.logger.info('Relationship repair completed', {
        dryRun,
        pathPattern,
        fixed: result.fixed,
        issueCount: result.issues.length,
      });
      return result;
    } catch (error) {
      TaskManager.logger.error('Failed to repair relationships', { error });
      throw TaskErrorFactory.createTaskOperationError(
        'TaskManager.repairRelationships',
        'Failed to repair relationships',
        { dryRun, pathPattern, error }
      );
    }
  }

  getMemoryStats(): { heapUsed: number; heapTotal: number; rss: number } {
    return this.cacheManager.getMemoryStats();
  }

  async cleanup(): Promise<void> {
    try {
      this.cacheManager.cleanup();

      try {
        if (this.statusBatchProcessor) {
          await (this.statusBatchProcessor as any).cleanup?.();
        }
        if (this.dependencyBatchProcessor) {
          await (this.dependencyBatchProcessor as any).cleanup?.();
        }
      } catch (batchError) {
        TaskManager.logger.warn('Error cleaning up batch processors', { error: batchError });
      }

      try {
        if (this.operations) {
          await (this.operations as any).cleanup?.();
        }
      } catch (opsError) {
        TaskManager.logger.warn('Error cleaning up operations', { error: opsError });
      }

      if (this.storage) {
        await this.storage.close();
      }

      if (global.gc) {
        global.gc();
      }

      TaskManager.logger.info('Task manager cleanup completed');
    } catch (error) {
      TaskManager.logger.error('Failed to cleanup task manager', { error });
      throw TaskErrorFactory.createTaskOperationError(
        'TaskManager.cleanup',
        'Failed to cleanup task manager',
        { error }
      );
    }
  }

  async close(): Promise<void> {
    await this.cleanup();
  }

  async listTools() {
    if (!this.toolHandler) {
      // Ensure tool handler is initialized
      this.toolHandler = new ToolHandler(this);
      // Wait for tool handler to be ready
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return this.toolHandler.listTools();
  }

  async handleToolCall(request: { method: string; params?: any }) {
    if (!request.params) {
      throw TaskErrorFactory.createTaskValidationError(
        'TaskManager.handleToolCall',
        'Missing params in tool call request',
        { request }
      );
    }
    // Transform the request to match ToolHandler's expected format
    const toolRequest = {
      params: {
        name: request.params.name as string,
        arguments: request.params.arguments as Record<string, unknown> | undefined,
      },
    };
    return this.toolHandler.handleToolCall(toolRequest);
  }

  async clearCaches(): Promise<void> {
    try {
      await this.cacheManager.clearCaches();
      TaskManager.logger.info('Caches cleared successfully');
    } catch (error) {
      TaskManager.logger.error('Failed to clear caches', { error });
      throw TaskErrorFactory.createTaskOperationError(
        'TaskManager.clearCaches',
        'Failed to clear caches',
        { error }
      );
    }
  }

  /**
   * Sort tasks by dependency order for bulk operations
   */
  async sortTasksByDependencies(
    tasks: Array<{ path: string; dependencies: string[] }>
  ): Promise<string[]> {
    try {
      return await this.validator.sortTasksByDependencies(tasks);
    } catch (error) {
      TaskManager.logger.error('Failed to sort tasks by dependencies', { error });
      throw TaskErrorFactory.createTaskDependencyError(
        'TaskManager.sortTasksByDependencies',
        'Failed to sort tasks by dependencies',
        { tasks, error }
      );
    }
  }

  async bulkTaskOperations(input: {
    operations: Array<{
      type: 'create' | 'update' | 'delete';
      path: string;
      data?: CreateTaskInput | UpdateTaskInput;
    }>;
  }): Promise<TaskResponse<Task[]>> {
    try {
      // Validate input against schema
      const validationResult = await this.validator.validateBulkOperations(input);
      if (!validationResult.success) {
        throw TaskErrorFactory.createTaskValidationError(
          'TaskManager.bulkTaskOperations',
          'Invalid bulk operations input',
          { errors: validationResult.errors }
        );
      }

      // Start transaction
      await this.storage.beginTransaction();
      const results: Task[] = [];
      const affectedPaths: string[] = [];
      const errors: Array<{ operation: number; error: string }> = [];

      try {
        // Create tasks sequentially in order
        for (const [index, op] of input.operations.entries()) {
          if (op.type !== 'create') continue;
          try {
            // Create task and wait for it to be stored
            const created = await this.createTask(op.data as CreateTaskInput, {
              dependencyMode: DependencyValidationMode.DEFERRED,
              hierarchyMode: HierarchyValidationMode.DEFERRED,
            });

            if (created.data) {
              // Store the task in results
              results.push(created.data);
              affectedPaths.push(created.data.path);

              // Wait for the task to be indexed
              await this.cacheManager.indexTask(created.data);

              // Wait for any parent updates to complete
              if (created.data.parentPath) {
                const parent = await this.storage.getTask(created.data.parentPath);
                if (parent) {
                  await this.storage.updateTask(parent.path, {
                    subtasks: [...parent.subtasks, created.data.path],
                  });
                }
              }
            }
          } catch (opError) {
            errors.push({
              operation: index,
              error: opError instanceof Error ? opError.message : String(opError),
            });
            throw TaskErrorFactory.createTaskOperationError(
              'TaskManager.bulkTaskOperations',
              'One or more operations failed',
              { errors }
            );
          }
        }

        // Then process updates and deletes
        for (const [index, op] of input.operations.entries()) {
          if (op.type === 'create') continue;

          try {
            switch (op.type) {
              case 'update': {
                if (!op.data) {
                  throw TaskErrorFactory.createTaskValidationError(
                    'TaskManager.bulkTaskOperations',
                    'Update operation requires data',
                    { operation: op }
                  );
                }
                const updated = await this.updateTask(op.path, op.data as UpdateTaskInput);
                if (updated.data) {
                  results.push(updated.data);
                  affectedPaths.push(updated.data.path);
                }
                break;
              }
              case 'delete': {
                await this.deleteTask(op.path);
                affectedPaths.push(op.path);
                break;
              }
              default:
                throw TaskErrorFactory.createTaskValidationError(
                  'TaskManager.bulkTaskOperations',
                  `Invalid operation type: ${op.type}`,
                  { operation: op }
                );
            }
          } catch (opError) {
            errors.push({
              operation: index,
              error: opError instanceof Error ? opError.message : String(opError),
            });

            // If any operation fails, rollback and report all errors
            throw TaskErrorFactory.createTaskOperationError(
              'TaskManager.bulkTaskOperations',
              'One or more operations failed',
              { errors }
            );
          }
        }

        await this.storage.commitTransaction();

        return this.createResponse(results, {
          operationCount: input.operations.length,
          successCount: results.length,
        });
      } catch (error) {
        await this.storage.rollbackTransaction();
        throw error;
      }
    } catch (error) {
      TaskManager.logger.error('Failed to execute bulk operations', {
        error,
        operations: input.operations,
      });
      throw error;
    }
  }
}
