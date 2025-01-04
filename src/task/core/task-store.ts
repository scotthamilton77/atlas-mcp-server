import { Logger } from '../../logging/index.js';
import { TransactionLogger } from '../../logging/transaction-logger.js';
import { TaskStorage } from '../../types/storage.js';
import { Task, TaskStatus, CreateTaskInput, UpdateTaskInput } from '../../types/task.js';
import { TaskIndexManager } from './indexing/index-manager.js';
import { TaskCacheManager } from '../manager/task-cache-manager.js';
import { TaskErrorFactory } from '../../errors/task-error.js';
import { TaskVisualizer } from '../../visualization/task-visualizer.js';
import path from 'path';

/**
 * Core task store implementation
 */
export class TaskStore {
  private readonly logger: Logger;
  private readonly transactionLogger: TransactionLogger;
  private readonly indexManager: TaskIndexManager;
  private readonly cacheManager: TaskCacheManager;

  private readonly visualizer: TaskVisualizer;

  constructor(
    private readonly storage: TaskStorage,
    config: { workspaceDir: string }
  ) {
    this.logger = Logger.getInstance().child({ component: 'TaskStore' });
    this.transactionLogger = TransactionLogger.getInstance();
    this.indexManager = new TaskIndexManager();
    this.cacheManager = new TaskCacheManager();

    // Initialize visualizer with workspace directory
    const visualizerDir = path.join(config.workspaceDir, 'visualizations');
    this.logger.info('Initializing task visualizer', { outputDir: visualizerDir });

    this.visualizer = new TaskVisualizer({
      outputDir: visualizerDir,
      formats: ['markdown', 'json'],
    });
  }

  /**
   * Initialize store
   */
  async initialize(): Promise<void> {
    try {
      await this.storage.initialize();

      // Initial visualization of all tasks
      const tasks = await this.storage.getTasksByPattern('**');
      await this.visualizer.updateVisualizations(tasks);

      this.logger.info('Task store initialized');
    } catch (error) {
      this.logger.error('Failed to initialize task store', { error });
      throw TaskErrorFactory.createTaskOperationError(
        'TaskStore.initialize',
        'Failed to initialize task store'
      );
    }
  }

  /**
   * Create a new task
   */
  async createTask(input: CreateTaskInput): Promise<Task> {
    const startTime = Date.now();
    try {
      const task = await this.storage.createTask(input);
      await this.indexManager.indexTask(task);
      this.cacheManager.set(task);

      // Update visualizations
      const allTasks = await this.storage.getTasksByPattern('**');
      await this.visualizer.updateVisualizations(allTasks);

      await this.transactionLogger.logTransaction(
        'createTask',
        task,
        {
          toStatus: task.status,
          dependencies: task.dependencies,
          metadata: task.metadata,
        },
        startTime
      );

      return task;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.transactionLogger.logTransaction(
        'createTask',
        { path: input.path } as Task, // Minimal task info for logging
        {
          error: errorMessage,
          metadata: input.metadata,
        },
        startTime
      );

      this.logger.error('Failed to create task', {
        error,
        context: { input },
      });
      throw error;
    }
  }

  /**
   * Update an existing task
   */
  async updateTask(path: string, updates: UpdateTaskInput): Promise<Task> {
    const startTime = Date.now();
    try {
      const existingTask = await this.storage.getTask(path);
      if (!existingTask) {
        throw new Error(`Task not found: ${path}`);
      }
      const task = await this.storage.updateTask(path, updates);
      await this.indexManager.indexTask(task);
      this.cacheManager.set(task);

      // Update visualizations
      const allTasks = await this.storage.getTasksByPattern('**');
      await this.visualizer.updateVisualizations(allTasks);

      await this.transactionLogger.logTransaction(
        'updateTask',
        task,
        {
          fromStatus: existingTask.status,
          toStatus: updates.status,
          dependencies: updates.dependencies,
          metadata: updates.metadata,
          warnings: this.getUpdateWarnings(existingTask, updates),
        },
        startTime
      );

      return task;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.transactionLogger.logTransaction(
        'updateTask',
        { path } as Task,
        {
          error: errorMessage,
          metadata: updates.metadata,
        },
        startTime
      );

      this.logger.error('Failed to update task', {
        error,
        context: { path, updates },
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
      const cached = this.cacheManager.get(path);
      if (cached) {
        return cached;
      }

      // Check index
      const indexed = this.indexManager.getTask(path);
      if (indexed) {
        const task = await this.storage.getTask(path);
        if (task) {
          this.cacheManager.set(task);
          return task;
        }
      }

      // Get from storage
      const task = await this.storage.getTask(path);
      if (task) {
        await this.indexManager.indexTask(task);
        this.cacheManager.set(task);
      }

      return task;
    } catch (error) {
      this.logger.error('Failed to get task', {
        error,
        context: { path },
      });
      throw error;
    }
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
        const cached = this.cacheManager.get(path);
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
          await this.indexManager.indexTask(task);
          this.cacheManager.set(task);
          tasks.push(task);
        }
      }

      return tasks;
    } catch (error) {
      this.logger.error('Failed to get tasks', {
        error,
        context: { paths },
      });
      throw error;
    }
  }

  /**
   * Get tasks by pattern
   */
  async getTasksByPattern(pattern: string): Promise<Task[]> {
    try {
      // Check index first
      const indexed = this.indexManager.getTasksByPattern(pattern);
      if (indexed.length > 0) {
        return await this.getTasks(indexed.map(t => t.path));
      }

      // Get from storage
      const tasks = await this.storage.getTasksByPattern(pattern);
      for (const task of tasks) {
        await this.indexManager.indexTask(task);
        this.cacheManager.set(task);
      }

      return tasks;
    } catch (error) {
      this.logger.error('Failed to get tasks by pattern', {
        error,
        context: { pattern },
      });
      throw error;
    }
  }

  /**
   * Get tasks by status
   */
  async getTasksByStatus(status: TaskStatus): Promise<Task[]> {
    try {
      // Check index first
      const indexed = this.indexManager.getTasksByStatus(status);
      if (indexed.length > 0) {
        return await this.getTasks(indexed.map(t => t.path));
      }

      // Get from storage
      const tasks = await this.storage.getTasksByStatus(status);
      for (const task of tasks) {
        await this.indexManager.indexTask(task);
        this.cacheManager.set(task);
      }

      return tasks;
    } catch (error) {
      this.logger.error('Failed to get tasks by status', {
        error,
        context: { status },
      });
      throw error;
    }
  }

  /**
   * Get child tasks
   */
  async getChildren(parentPath: string): Promise<Task[]> {
    try {
      // Check index first
      const indexed = this.indexManager.getChildren(parentPath);
      if (indexed.length > 0) {
        return await this.getTasks(indexed.map(t => t.path));
      }

      // Get from storage
      const tasks = await this.storage.getChildren(parentPath);
      for (const task of tasks) {
        await this.indexManager.indexTask(task);
        this.cacheManager.set(task);
      }

      return tasks;
    } catch (error) {
      this.logger.error('Failed to get child tasks', {
        error,
        context: { parentPath },
      });
      throw error;
    }
  }

  /**
   * Delete a task
   */
  /**
   * Get warnings for task updates
   */
  private getUpdateWarnings(existingTask: Task, updates: UpdateTaskInput): string[] {
    const warnings: string[] = [];

    // Check for potentially risky status changes
    if (updates.status === 'COMPLETED' && existingTask.status === 'BLOCKED') {
      warnings.push('Completing task that was previously blocked');
    }

    // Check for dependency changes
    if (updates.dependencies && existingTask.dependencies) {
      const removedDeps = existingTask.dependencies.filter(
        dep => !updates.dependencies?.includes(dep)
      );
      if (removedDeps.length > 0) {
        warnings.push(`Removing dependencies: ${removedDeps.join(', ')}`);
      }
    }

    // Check metadata changes
    if (updates.metadata && existingTask.metadata) {
      const existingKeys = Object.keys(existingTask.metadata);
      const updatedKeys = Object.keys(updates.metadata);
      const removedKeys = existingKeys.filter(key => !updatedKeys.includes(key));
      if (removedKeys.length > 0) {
        warnings.push(`Removing metadata fields: ${removedKeys.join(', ')}`);
      }
    }

    return warnings;
  }

  async deleteTask(path: string): Promise<void> {
    const startTime = Date.now();
    try {
      const existingTask = await this.storage.getTask(path);
      if (!existingTask) {
        throw new Error(`Task not found: ${path}`);
      }
      await this.storage.deleteTask(path);
      await this.indexManager.removeTask(path);
      this.cacheManager.delete(path);

      // Update visualizations
      const allTasks = await this.storage.getTasksByPattern('**');
      await this.visualizer.updateVisualizations(allTasks);

      await this.transactionLogger.logTransaction(
        'deleteTask',
        existingTask,
        {
          fromStatus: existingTask.status,
          dependencies: existingTask.dependencies,
          metadata: existingTask.metadata,
        },
        startTime
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.transactionLogger.logTransaction(
        'deleteTask',
        { path } as Task,
        { error: errorMessage },
        startTime
      );

      this.logger.error('Failed to delete task', {
        error,
        context: { path },
      });
      throw error;
    }
  }

  /**
   * Delete multiple tasks
   */
  async deleteTasks(paths: string[]): Promise<void> {
    try {
      await this.storage.deleteTasks(paths);
      for (const path of paths) {
        await this.indexManager.removeTask(path);
        this.cacheManager.delete(path);
      }
    } catch (error) {
      this.logger.error('Failed to delete tasks', {
        error,
        context: { paths },
      });
      throw error;
    }
  }

  /**
   * Clear all tasks
   */
  async clearAllTasks(): Promise<void> {
    try {
      await this.storage.clearAllTasks();
      await this.indexManager.clearIndex();
      this.cacheManager.clear();

      // Update visualizations with empty task list
      await this.visualizer.updateVisualizations([]);
    } catch (error) {
      this.logger.error('Failed to clear all tasks', { error });
      throw error;
    }
  }

  /**
   * Get store metrics
   */
  async getMetrics(): Promise<{
    tasks: {
      totalTasks: number;
      byStatus: Record<TaskStatus, number>;
      byType: Record<string, number>;
      dependencyCount: number;
    };
    cache: {
      hitRate: number;
      memoryUsage: number;
      entryCount: number;
    };
  }> {
    const indexMetrics = this.indexManager.getMetrics();
    const cacheMetrics = this.cacheManager.getMetrics();

    return {
      tasks: {
        totalTasks: indexMetrics.totalTasks,
        byStatus: indexMetrics.byStatus,
        byType: indexMetrics.byType,
        dependencyCount: indexMetrics.dependencyCount,
      },
      cache: cacheMetrics,
    };
  }
}
