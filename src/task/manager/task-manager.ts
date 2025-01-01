import { Resource } from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '../../logging/index.js';
import { TaskStorage } from '../../types/storage.js';
import { Task, TaskStatus, CreateTaskInput, UpdateTaskInput } from '../../types/task.js';
import { TaskValidator } from '../validation/task-validator.js';
import { TaskCacheManager } from './task-cache-manager.js';
import { TaskEventHandler } from './task-event-handler.js';
import { TaskResourceHandler } from '../core/task-resource-handler.js';
import { TaskErrorFactory } from '../../errors/task-error.js';
import { TaskTransactionManager } from '../core/transactions/task-transaction-manager.js';

export class TaskManager {
  private static instance: TaskManager;
  private readonly logger: Logger;
  private readonly validator: TaskValidator;
  private readonly cache: TaskCacheManager;
  private readonly events: TaskEventHandler;
  private readonly transactionManager: TaskTransactionManager;
  private readonly resourceHandler: TaskResourceHandler;

  protected constructor(private readonly storage: TaskStorage) {
    this.logger = Logger.getInstance().child({ component: 'TaskManager' });
    this.validator = new TaskValidator(storage);
    this.cache = new TaskCacheManager();
    this.resourceHandler = TaskResourceHandler.getInstance(storage);
    this.events = new TaskEventHandler(this.resourceHandler);
    this.transactionManager = new TaskTransactionManager(storage);
  }

  static async getInstance(storage?: TaskStorage): Promise<TaskManager> {
    if (!TaskManager.instance && !storage) {
      throw TaskErrorFactory.createTaskOperationError(
        'TaskManager.getInstance',
        'Storage must be provided when creating instance'
      );
    }

    if (!TaskManager.instance && storage) {
      TaskManager.instance = new TaskManager(storage);
      await TaskManager.instance.initialize();
    }

    return TaskManager.instance;
  }

  private async initialize(): Promise<void> {
    try {
      this.logger.info('Task manager initialized');
    } catch (error) {
      this.logger.error('Failed to initialize task manager', { error });
      throw TaskErrorFactory.createTaskOperationError(
        'TaskManager.initialize',
        'Failed to initialize task manager',
        { error }
      );
    }
  }

  async createTask(input: CreateTaskInput): Promise<Task> {
    try {
      const validationResult = await this.validator.validateCreate(input);

      if (!validationResult.success) {
        throw TaskErrorFactory.createTaskValidationError(
          'TaskManager.createTask',
          validationResult.errors.join('; '),
          {
            input,
            validationDetails: validationResult.details,
          }
        );
      }

      // Log warnings if any
      if (validationResult.warnings?.length) {
        this.logger.warn('Task creation validation warnings', {
          input,
          warnings: validationResult.warnings,
          details: validationResult.details,
        });
      }

      // Log performance metrics if available
      if (validationResult.details?.performance) {
        this.logger.debug('Task creation validation performance', {
          input,
          performance: validationResult.details.performance,
        });
      }

      const task = await this.storage.createTask(input);
      this.cache.set(task);
      await this.events.emitTaskCreated(task);
      return task;
    } catch (error) {
      this.logger.error('Failed to create task', { error, input });
      throw error;
    }
  }

  async updateTask(path: string, updates: UpdateTaskInput): Promise<Task> {
    try {
      const existingTask = await this.getTask(path);
      if (!existingTask) {
        throw TaskErrorFactory.createTaskNotFoundError('TaskManager.updateTask', path);
      }

      return await this.transactionManager.executeUpdate(existingTask, updates, {
        validateUpdate: async () => {
          const validationResult = await this.validator.validateUpdate(path, updates);

          // Log warnings and performance metrics even if validation succeeds
          if (validationResult.warnings?.length) {
            this.logger.warn('Task update validation warnings', {
              path,
              updates,
              warnings: validationResult.warnings,
              details: validationResult.details,
            });
          }

          if (validationResult.details?.performance) {
            this.logger.debug('Task update validation performance', {
              path,
              updates,
              performance: validationResult.details.performance,
            });
          }

          return validationResult;
        },
        handleDependencyUpdates: updates.dependencies
          ? () => this.handleDependencyUpdates(existingTask, updates.dependencies!)
          : undefined,
        handleStatusPropagation:
          updates.status !== undefined && updates.status !== existingTask.status
            ? () => this.handleStatusPropagation(existingTask, existingTask.status, updates.status!)
            : undefined,
        validateStatusTransition:
          updates.status !== undefined && updates.status !== existingTask.status
            ? () =>
                this.validator.getStatusValidationResult(
                  existingTask,
                  updates.status!,
                  this.getTask.bind(this)
                )
            : undefined,
        validateParentChildStatus:
          updates.status !== undefined && updates.status !== existingTask.status
            ? async () => {
                const siblings = existingTask.parentPath
                  ? await this.getChildren(existingTask.parentPath)
                  : [];
                return this.validator.validateParentChildStatus(
                  existingTask,
                  updates.status!,
                  siblings,
                  this.getTask.bind(this)
                );
              }
            : undefined,
        emitEvents: async (updatedTask: Task) => {
          if (updates.status !== undefined && updates.status !== existingTask.status) {
            await this.events.emitTaskStatusChanged(
              updatedTask,
              existingTask.status,
              updates.status,
              {
                reason: 'dependency_update',
                oldStatus: existingTask.status,
                newStatus: updates.status,
              }
            );
          }
          await this.events.emitTaskUpdated(updatedTask);
        },
        updateCache: (updatedTask: Task) => this.cache.set(updatedTask),
      });
    } catch (error) {
      this.logger.error('Failed to update task', { error, path, updates });
      throw error;
    }
  }

  private async handleDependencyUpdates(task: Task, newDependencies: string[]): Promise<void> {
    const addedDeps = newDependencies.filter(dep => !task.dependencies.includes(dep));
    const removedDeps = task.dependencies.filter(dep => !newDependencies.includes(dep));

    await this.events.emitTaskDependenciesChanged(task, {
      taskPath: task.path,
      addedDependencies: addedDeps,
      removedDependencies: removedDeps,
    });

    if (task.status === TaskStatus.COMPLETED) {
      for (const depPath of addedDeps) {
        const depTask = await this.getTask(depPath);
        if (depTask && depTask.status === TaskStatus.BLOCKED) {
          await this.updateTask(depPath, { status: TaskStatus.PENDING });
        }
      }
    }
  }

  private async handleStatusPropagation(
    task: Task,
    oldStatus: TaskStatus,
    newStatus: TaskStatus
  ): Promise<void> {
    if (task.parentPath && newStatus === TaskStatus.COMPLETED) {
      const parent = await this.getTask(task.parentPath);
      if (parent) {
        const siblings = await this.getChildren(task.parentPath);
        const allCompleted = siblings.every(s =>
          s.path === task.path ? true : s.status === TaskStatus.COMPLETED
        );

        if (allCompleted && parent.status !== TaskStatus.COMPLETED) {
          await this.storage.updateTask(parent.path, { status: TaskStatus.COMPLETED });
          await this.events.emitParentStatusPropagation(
            parent,
            parent.status,
            TaskStatus.COMPLETED,
            siblings.map(s => s.path)
          );
        }
      }
    }

    if (newStatus === TaskStatus.CANCELLED) {
      const children = await this.getChildren(task.path);
      const incompleteTasks = children.filter(child => child.status !== TaskStatus.COMPLETED);

      if (incompleteTasks.length > 0) {
        await Promise.all(
          incompleteTasks.map(child =>
            this.storage.updateTask(child.path, { status: TaskStatus.CANCELLED })
          )
        );

        await this.events.emitChildrenStatusPropagation(
          incompleteTasks,
          oldStatus,
          TaskStatus.CANCELLED,
          task.path
        );
      }
    }

    if (newStatus === TaskStatus.COMPLETED) {
      const dependentTasks = await this.storage.getDependentTasks(task.path);
      for (const depTask of dependentTasks) {
        const allDepsCompleted = await this.areAllDependenciesCompleted(depTask);
        if (allDepsCompleted && depTask.status === TaskStatus.BLOCKED) {
          await this.updateTask(depTask.path, { status: TaskStatus.PENDING });
        }
      }
    }
  }

  private async areAllDependenciesCompleted(task: Task): Promise<boolean> {
    for (const depPath of task.dependencies) {
      const depTask = await this.getTask(depPath);
      if (!depTask || depTask.status !== TaskStatus.COMPLETED) {
        return false;
      }
    }
    return true;
  }

  async getTask(path: string): Promise<Task | null> {
    try {
      const cached = this.cache.get(path);
      if (cached) {
        return cached;
      }

      const task = await this.storage.getTask(path);
      if (task) {
        this.cache.set(task);
      }

      return task;
    } catch (error) {
      this.logger.error('Failed to get task', { error, path });
      throw error;
    }
  }

  async getTaskByPath(path: string): Promise<Task | null> {
    return this.getTask(path);
  }

  async getTasks(paths: string[]): Promise<Task[]> {
    try {
      const tasks: Task[] = [];
      const uncached: string[] = [];

      for (const path of paths) {
        const cached = this.cache.get(path);
        if (cached) {
          tasks.push(cached);
        } else {
          uncached.push(path);
        }
      }

      if (uncached.length > 0) {
        const fromStorage = await this.storage.getTasks(uncached);
        for (const task of fromStorage) {
          this.cache.set(task);
          tasks.push(task);
        }
      }

      return tasks;
    } catch (error) {
      this.logger.error('Failed to get tasks', { error, paths });
      throw error;
    }
  }

  async getTasksByPattern(pattern: string): Promise<Task[]> {
    try {
      const tasks = await this.storage.getTasksByPattern(pattern);
      tasks.forEach(task => this.cache.set(task));
      return tasks;
    } catch (error) {
      this.logger.error('Failed to get tasks by pattern', { error, pattern });
      throw error;
    }
  }

  async listTasks(pattern: string): Promise<Task[]> {
    return this.getTasksByPattern(pattern);
  }

  async getTasksByStatus(status: TaskStatus): Promise<Task[]> {
    try {
      const tasks = await this.storage.getTasksByStatus(status);
      tasks.forEach(task => this.cache.set(task));
      return tasks;
    } catch (error) {
      this.logger.error('Failed to get tasks by status', { error, status });
      throw error;
    }
  }

  async getChildren(parentPath: string): Promise<Task[]> {
    try {
      const tasks = await this.storage.getChildren(parentPath);
      tasks.forEach(task => this.cache.set(task));
      return tasks;
    } catch (error) {
      this.logger.error('Failed to get child tasks', { error, parentPath });
      throw error;
    }
  }

  async deleteTask(path: string): Promise<void> {
    try {
      const task = await this.getTask(path);
      if (!task) {
        throw TaskErrorFactory.createTaskNotFoundError('TaskManager.deleteTask', path);
      }

      await this.storage.deleteTask(path);
      this.cache.delete(path);
      await this.events.emitTaskDeleted(task);
    } catch (error) {
      this.logger.error('Failed to delete task', { error, path });
      throw error;
    }
  }

  async deleteTasks(paths: string[]): Promise<void> {
    try {
      const tasks = await this.getTasks(paths);
      await this.storage.deleteTasks(paths);
      paths.forEach(path => this.cache.delete(path));
      for (const task of tasks) {
        await this.events.emitTaskDeleted(task);
      }
    } catch (error) {
      this.logger.error('Failed to delete tasks', { error, paths });
      throw error;
    }
  }

  async clearAllTasks(confirm = false): Promise<void> {
    if (!confirm) {
      throw TaskErrorFactory.createTaskOperationError(
        'TaskManager.clearAllTasks',
        'Confirmation required to clear all tasks'
      );
    }

    try {
      await this.storage.clearAllTasks();
      this.cache.clear();
      await this.events.emitAllTasksCleared();
    } catch (error) {
      this.logger.error('Failed to clear all tasks', { error });
      throw error;
    }
  }

  async sortTasksByDependencies(
    tasks: { path: string; dependencies: string[] }[]
  ): Promise<string[]> {
    const visited = new Set<string>();
    const sorted: string[] = [];
    const visiting = new Set<string>();

    const visit = async (path: string, deps: string[]) => {
      if (visited.has(path)) return;
      if (visiting.has(path)) {
        throw TaskErrorFactory.createTaskOperationError(
          'TaskManager.sortTasksByDependencies',
          'Circular dependency detected',
          { path }
        );
      }

      visiting.add(path);

      for (const dep of deps) {
        const depTask = tasks.find(t => t.path === dep);
        if (depTask) {
          await visit(depTask.path, depTask.dependencies);
        }
      }

      visiting.delete(path);
      visited.add(path);
      sorted.push(path);
    };

    for (const task of tasks) {
      await visit(task.path, task.dependencies);
    }

    return sorted;
  }

  async vacuumDatabase(analyze = false): Promise<void> {
    try {
      await this.storage.vacuum();
      if (analyze) {
        await this.storage.analyze();
      }
    } catch (error) {
      this.logger.error('Failed to vacuum database', { error });
      throw error;
    }
  }

  async repairRelationships(dryRun = false): Promise<{
    fixed: number;
    issues: string[];
  }> {
    try {
      return await this.storage.repairRelationships(dryRun);
    } catch (error) {
      this.logger.error('Failed to repair relationships', { error });
      throw error;
    }
  }

  onTaskEvent(
    event: 'created' | 'updated' | 'deleted' | 'cleared',
    handler: (task?: Task) => Promise<void>
  ): void {
    this.events.subscribe(event, handler);
  }

  offTaskEvent(
    event: 'created' | 'updated' | 'deleted' | 'cleared',
    handler: (task?: Task) => Promise<void>
  ): void {
    this.events.unsubscribe(event, handler);
  }

  getStorage(): TaskStorage {
    return this.storage;
  }

  async getMetrics(): Promise<{
    tasks: {
      total: number;
      byStatus: Record<TaskStatus, number>;
      noteCount: number;
      dependencyCount: number;
    };
    cache: {
      hitRate: number;
      memoryUsage: number;
      entryCount: number;
    };
  }> {
    const metrics = await this.storage.getMetrics();
    const cacheMetrics = this.cache.getMetrics();

    return {
      tasks: metrics.tasks,
      cache: cacheMetrics,
    };
  }

  async clearCaches(): Promise<void> {
    this.cache.clear();
    await this.storage.clearCache();
  }

  async close(): Promise<void> {
    await this.storage.close();
    this.cache.clear();
    this.events.removeAllListeners();
  }

  // Resource-related methods
  async getTaskResource(uri: string): Promise<Resource> {
    return this.resourceHandler.getTaskResource(uri);
  }

  async listTaskResources(): Promise<Resource[]> {
    const resources = await this.resourceHandler.listTaskResources();
    // Add the dynamic task list resource
    resources.push({
      uri: 'tasklist://current',
      name: 'Current Task List Overview',
      mimeType: 'application/json',
      description: 'Dynamic overview of all tasks including status counts, recent updates, and metrics. Updates in real-time when accessed.'
    });
    return resources;
  }

  async getHierarchyResource(rootPath: string): Promise<Resource> {
    const tasks = await this.getTasksByPattern(`${rootPath}/*`);
    return {
      uri: `hierarchy://${rootPath}`,
      name: `Task Hierarchy: ${rootPath}`,
      mimeType: 'application/json',
      text: JSON.stringify(tasks.map(task => ({
        id: task.id,
        path: task.path,
        name: task.name,
        type: task.type,
        status: task.status,
        parentPath: task.parentPath,
        dependencies: task.dependencies
      })), null, 2)
    };
  }

  async getStatusResource(taskPath: string): Promise<Resource> {
    const task = await this.getTask(taskPath);
    if (!task) {
      throw new Error(`Task not found: ${taskPath}`);
    }

    const children = await this.getChildren(taskPath);
    const dependencies = await this.getTasks(task.dependencies);

    return {
      uri: `status://${taskPath}`,
      name: `Task Status: ${task.name}`,
      mimeType: 'application/json',
      text: JSON.stringify({
        task: {
          id: task.id,
          path: task.path,
          name: task.name,
          status: task.status,
          statusMetadata: task.statusMetadata
        },
        children: children.map(child => ({
          id: child.id,
          path: child.path,
          name: child.name,
          status: child.status
        })),
        dependencies: dependencies.map(dep => ({
          id: dep.id,
          path: dep.path,
          name: dep.name,
          status: dep.status
        }))
      }, null, 2)
    };
  }
}
