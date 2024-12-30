/**
 * Task manager singleton
 */
import { Logger } from '../../logging/index.js';
import { TaskStorage } from '../../types/storage.js';
import { Task, TaskStatus, CreateTaskInput, UpdateTaskInput } from '../../types/task.js';
import { TaskValidator } from '../validation/task-validator.js';
import { TaskCacheManager } from './task-cache-manager.js';
import { TaskEventHandler } from './task-event-handler.js';
import { TaskErrorFactory } from '../../errors/task-error.js';

export class TaskManager {
  private static instance: TaskManager;
  private readonly logger: Logger;
  private readonly validator: TaskValidator;
  private readonly cache: TaskCacheManager;
  private readonly events: TaskEventHandler;

  protected constructor(private readonly storage: TaskStorage) {
    this.logger = Logger.getInstance().child({ component: 'TaskManager' });
    this.validator = new TaskValidator(storage);
    this.cache = new TaskCacheManager();
    this.events = new TaskEventHandler();
  }

  /**
   * Get task manager instance
   */
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

  /**
   * Initialize task manager
   */
  private async initialize(): Promise<void> {
    try {
      // Storage is already initialized in createStorage()
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

  /**
   * Create a new task
   */
  async createTask(input: CreateTaskInput): Promise<Task> {
    try {
      // Validate input
      await this.validator.validateCreate(input);

      // Create task
      const task = await this.storage.createTask(input);

      // Update cache
      this.cache.set(task);

      // Emit event
      await this.events.emitTaskCreated(task);

      return task;
    } catch (error) {
      this.logger.error('Failed to create task', {
        error,
        input,
      });
      throw error;
    }
  }

  /**
   * Update an existing task
   */
  async updateTask(path: string, updates: UpdateTaskInput): Promise<Task> {
    try {
      // Validate updates
      await this.validator.validateUpdate(path, updates);

      // Update task
      const task = await this.storage.updateTask(path, updates);

      // Update cache
      this.cache.set(task);

      // Emit event
      await this.events.emitTaskUpdated(task);

      return task;
    } catch (error) {
      this.logger.error('Failed to update task', {
        error,
        path,
        updates,
      });
      throw error;
    }
  }

  /**
   * Get a task by path
   */
  async getTask(path: string): Promise<Task | null> {
    try {
      // Check cache first
      const cached = this.cache.get(path);
      if (cached) {
        return cached;
      }

      // Get from storage
      const task = await this.storage.getTask(path);
      if (task) {
        this.cache.set(task);
      }

      return task;
    } catch (error) {
      this.logger.error('Failed to get task', {
        error,
        path,
      });
      throw error;
    }
  }

  /**
   * Get task by path (alias for getTask)
   */
  async getTaskByPath(path: string): Promise<Task | null> {
    return this.getTask(path);
  }

  /**
   * Get multiple tasks by paths
   */
  async getTasks(paths: string[]): Promise<Task[]> {
    try {
      const tasks: Task[] = [];
      const uncached: string[] = [];

      // Check cache first
      for (const path of paths) {
        const cached = this.cache.get(path);
        if (cached) {
          tasks.push(cached);
        } else {
          uncached.push(path);
        }
      }

      // Get remaining from storage
      if (uncached.length > 0) {
        const fromStorage = await this.storage.getTasks(uncached);
        for (const task of fromStorage) {
          this.cache.set(task);
          tasks.push(task);
        }
      }

      return tasks;
    } catch (error) {
      this.logger.error('Failed to get tasks', {
        error,
        paths,
      });
      throw error;
    }
  }

  /**
   * Get tasks by pattern
   */
  async getTasksByPattern(pattern: string): Promise<Task[]> {
    try {
      const tasks = await this.storage.getTasksByPattern(pattern);
      tasks.forEach(task => this.cache.set(task));
      return tasks;
    } catch (error) {
      this.logger.error('Failed to get tasks by pattern', {
        error,
        pattern,
      });
      throw error;
    }
  }

  /**
   * List tasks (alias for getTasksByPattern)
   */
  async listTasks(pattern: string): Promise<Task[]> {
    return this.getTasksByPattern(pattern);
  }

  /**
   * Get tasks by status
   */
  async getTasksByStatus(status: TaskStatus): Promise<Task[]> {
    try {
      const tasks = await this.storage.getTasksByStatus(status);
      tasks.forEach(task => this.cache.set(task));
      return tasks;
    } catch (error) {
      this.logger.error('Failed to get tasks by status', {
        error,
        status,
      });
      throw error;
    }
  }

  /**
   * Get child tasks
   */
  async getChildren(parentPath: string): Promise<Task[]> {
    try {
      const tasks = await this.storage.getChildren(parentPath);
      tasks.forEach(task => this.cache.set(task));
      return tasks;
    } catch (error) {
      this.logger.error('Failed to get child tasks', {
        error,
        parentPath,
      });
      throw error;
    }
  }

  /**
   * Delete a task
   */
  async deleteTask(path: string): Promise<void> {
    try {
      // Get task first for event
      const task = await this.getTask(path);
      if (!task) {
        throw TaskErrorFactory.createTaskNotFoundError('TaskManager.deleteTask', path);
      }

      // Delete task
      await this.storage.deleteTask(path);

      // Remove from cache
      this.cache.delete(path);

      // Emit event
      await this.events.emitTaskDeleted(task);
    } catch (error) {
      this.logger.error('Failed to delete task', {
        error,
        path,
      });
      throw error;
    }
  }

  /**
   * Delete multiple tasks
   */
  async deleteTasks(paths: string[]): Promise<void> {
    try {
      // Get tasks first for events
      const tasks = await this.getTasks(paths);

      // Delete tasks
      await this.storage.deleteTasks(paths);

      // Remove from cache
      paths.forEach(path => this.cache.delete(path));

      // Emit events
      for (const task of tasks) {
        await this.events.emitTaskDeleted(task);
      }
    } catch (error) {
      this.logger.error('Failed to delete tasks', {
        error,
        paths,
      });
      throw error;
    }
  }

  /**
   * Clear all tasks
   */
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

  /**
   * Sort tasks by dependencies
   */
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

  /**
   * Vacuum database
   */
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

  /**
   * Repair task relationships
   */
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

  /**
   * Subscribe to task events
   */
  onTaskEvent(
    event: 'created' | 'updated' | 'deleted' | 'cleared',
    handler: (task?: Task) => Promise<void>
  ): void {
    this.events.subscribe(event, handler);
  }

  /**
   * Unsubscribe from task events
   */
  offTaskEvent(
    event: 'created' | 'updated' | 'deleted' | 'cleared',
    handler: (task?: Task) => Promise<void>
  ): void {
    this.events.unsubscribe(event, handler);
  }

  /**
   * Get storage instance
   */
  getStorage(): TaskStorage {
    return this.storage;
  }

  /**
   * Get task metrics
   */
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

  /**
   * Clear all caches
   */
  async clearCaches(): Promise<void> {
    this.cache.clear();
    await this.storage.clearCache();
  }

  /**
   * Close task manager and cleanup resources
   */
  async close(): Promise<void> {
    await this.storage.close();
    this.cache.clear();
    this.events.removeAllListeners();
  }
}
