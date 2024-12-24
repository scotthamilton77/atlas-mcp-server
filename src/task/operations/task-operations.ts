import { Logger } from '../../logging/index.js';
import { EventManager } from '../../events/event-manager.js';
import { EventTypes } from '../../types/events.js';
import { TaskStorage } from '../../types/storage.js';
import { Task, TaskStatus, TaskType, CreateTaskInput, UpdateTaskInput } from '../../types/task.js';
import { TaskValidator } from '../validation/task-validator.js';
import { ErrorCodes, createError } from '../../errors/index.js';
import { TransactionManager } from '../core/transactions/transaction-manager.js';
import { StatusUpdateBatch } from '../core/batch/status-update-batch.js';

interface TaskEvent {
  type: EventTypes;
  timestamp: number;
  taskId: string;
  task: Task;
  metadata?: Record<string, any>;
  changes?: {
    before: Partial<Task>;
    after: Partial<Task>;
  };
}

export class TaskOperations {
  private readonly logger: Logger;
  private readonly eventManager: EventManager;
  private readonly transactionManager: TransactionManager;
  private readonly eventSubscriptions: Map<string, { unsubscribe: () => void }> = new Map();
  private readonly HIGH_MEMORY_THRESHOLD = 0.7; // 70% memory pressure threshold
  private readonly MEMORY_CHECK_INTERVAL = 10000; // 10 seconds
  private memoryCheckInterval?: NodeJS.Timeout;
  private isShuttingDown = false;
  private static instance: TaskOperations | null = null;
  private static initializationPromise: Promise<TaskOperations> | null = null;
  private initialized = false;
  private readonly statusUpdateBatch: StatusUpdateBatch;

    private constructor(
        private readonly storage: TaskStorage,
        private readonly validator: TaskValidator
    ) {
        this.logger = Logger.getInstance().child({ component: 'TaskOperations' });
        this.eventManager = EventManager.getInstance();
        this.transactionManager = TransactionManager.getInstance(storage);
        this.statusUpdateBatch = new StatusUpdateBatch(storage);
        
        // Setup event listeners
        this.setupEventListeners();

        // Setup memory monitoring
        this.startMemoryMonitoring();
        
        // Log initial memory state
        this.logMemoryUsage('Initialization');
    }

  /**
   * Gets the TaskOperations instance
   */
  static async getInstance(storage: TaskStorage, validator: TaskValidator): Promise<TaskOperations> {
    // Return existing instance if available
    if (TaskOperations.instance && TaskOperations.instance.initialized) {
      return TaskOperations.instance;
    }

    // If initialization is in progress, wait for it
    if (TaskOperations.initializationPromise) {
      return TaskOperations.initializationPromise;
    }

    // Start new initialization with mutex
    TaskOperations.initializationPromise = (async () => {
      try {
        // Double-check instance hasn't been created while waiting
        if (TaskOperations.instance && TaskOperations.instance.initialized) {
          return TaskOperations.instance;
        }

        TaskOperations.instance = new TaskOperations(storage, validator);
        await TaskOperations.instance.initialize();
        return TaskOperations.instance;
      } catch (error) {
        throw createError(
          ErrorCodes.STORAGE_INIT,
          `Failed to initialize TaskOperations: ${error instanceof Error ? error.message : String(error)}`
        );
      } finally {
        TaskOperations.initializationPromise = null;
      }
    })();

    return TaskOperations.initializationPromise;
  }

  private async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.debug('Task operations already initialized');
      return;
    }

    try {
      this.initialized = true;
      this.logger.debug('Task operations initialized');
    } catch (error) {
      this.logger.error('Failed to initialize task operations', { error });
      throw error;
    }
  }

  private setupEventListeners(): void {
    // Setup event listeners with strong references and explicit cleanup
    const setupListener = (type: EventTypes) => {
      const handler = (event: TaskEvent) => {
        this.logger.debug(`${type} event received`, { taskId: event.taskId });
      };
      const subscription = this.eventManager.on(type, handler);
      this.eventSubscriptions.set(type, subscription);
    };

    setupListener(EventTypes.TASK_CREATED);
    setupListener(EventTypes.TASK_UPDATED);
    setupListener(EventTypes.TASK_DELETED);
    setupListener(EventTypes.TASK_STATUS_CHANGED);
  }

  private startMemoryMonitoring(): void {
    // Monitor memory usage periodically
    this.memoryCheckInterval = setInterval(() => {
      const memoryUsage = process.memoryUsage();
      const heapUsed = memoryUsage.heapUsed / memoryUsage.heapTotal;

      this.logger.debug('Memory usage', {
        heapUsed: `${(heapUsed * 100).toFixed(1)}%`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
        external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
        arrayBuffers: `${Math.round(memoryUsage.arrayBuffers / 1024 / 1024)}MB`
      });

      if (heapUsed > this.HIGH_MEMORY_THRESHOLD) {
        this.logger.warn('High memory usage detected', {
          heapUsed: `${(heapUsed * 100).toFixed(1)}%`
        });
        
        // Force cleanup when memory pressure is high
        this.cleanupResources(true);
        
        // Force GC if available
        if (global.gc) {
          this.logger.info('Forcing garbage collection');
          global.gc();
        }
      }

      // Check for stale transactions
      this.cleanupStaleTransactions();
    }, this.MEMORY_CHECK_INTERVAL);

    // Ensure cleanup on process exit
    process.once('beforeExit', () => {
      if (this.memoryCheckInterval) {
        clearInterval(this.memoryCheckInterval);
        this.memoryCheckInterval = undefined;
      }
    });
  }

  private async cleanupResources(force: boolean = false): Promise<void> {
    try {
      const startTime = Date.now();
      let cleanedCount = 0;

      // Clean up event subscriptions
      if (force) {
        for (const [type, subscription] of this.eventSubscriptions.entries()) {
          subscription.unsubscribe();
          this.eventSubscriptions.delete(type);
          cleanedCount++;
        }
      }

      // Force garbage collection if available
      if (global.gc && (force || cleanedCount > 0)) {
        global.gc();
      }

      const endTime = Date.now();
      this.logger.info('Resource cleanup completed', {
        duration: endTime - startTime,
        cleanedCount,
        forced: force,
        remainingSubscriptions: this.eventSubscriptions.size,
        memoryUsage: this.getMemoryMetrics()
      });
    } catch (error) {
      this.logger.error('Error during resource cleanup', { error });
    }
  }

  private cleanupStaleTransactions(): void {
    // Transaction cleanup is now handled by TransactionManager
  }

  private getMemoryMetrics(): Record<string, string> {
    const memoryUsage = process.memoryUsage();
    return {
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
      external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
      arrayBuffers: `${Math.round(memoryUsage.arrayBuffers / 1024 / 1024)}MB`,
      heapUsedPercentage: `${((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100).toFixed(1)}%`
    };
  }

  private logMemoryUsage(context: string): void {
    this.logger.info(`Memory usage - ${context}`, this.getMemoryMetrics());
  }

  async cleanup(): Promise<void> {
    try {
      this.isShuttingDown = true;
      this.logMemoryUsage('Cleanup start');

      // Stop memory monitoring
      if (this.memoryCheckInterval) {
        clearInterval(this.memoryCheckInterval);
        this.memoryCheckInterval = undefined;
      }

      // Cleanup event subscriptions
      for (const [type, subscription] of this.eventSubscriptions.entries()) {
        subscription.unsubscribe();
        this.eventSubscriptions.delete(type);
      }

      // Force final cleanup
      await this.cleanupResources(true);

      // Final garbage collection
      if (global.gc) {
        this.logger.info('Forcing final garbage collection');
        global.gc();
      }

      this.logMemoryUsage('Cleanup end');
      this.logger.info('Task operations cleanup completed', {
        finalMetrics: {
          eventSubscriptions: this.eventSubscriptions.size,
          ...this.getMemoryMetrics()
        }
      });
    } catch (error) {
      this.logger.error('Error during task operations cleanup', { error });
      throw error;
    }
  }

  async createTask(input: CreateTaskInput): Promise<Task> {
    if (!this.initialized) {
      throw createError(ErrorCodes.OPERATION_FAILED, 'Task operations not initialized');
    }
    if (this.isShuttingDown) {
      throw createError(ErrorCodes.OPERATION_FAILED, 'System is shutting down');
    }

    // Set defaults
    const taskInput: CreateTaskInput = {
      ...input,
      type: input.type || TaskType.TASK // Default to TASK type if not provided
    };

    // Validate input
    await this.validator.validateCreate(taskInput);

    const transaction = await this.transactionManager.begin({
      timeout: 10000,
      requireLock: true
    });

    try {
      // Create task with processed input containing defaults
      const task = await this.storage.createTask(taskInput);

      // Add operation to transaction
      transaction.operations.push({
        id: `create-${Date.now()}`,
        type: 'create',
        timestamp: Date.now(),
        path: task.path,
        task
      });

      // Emit event
      this.eventManager.emit({
        type: EventTypes.TASK_CREATED,
        timestamp: Date.now(),
        taskId: task.path,
        task,
        metadata: { input }
      });

      await this.transactionManager.commit(transaction);
      return task;
    } catch (error) {
      await this.transactionManager.rollback(transaction);
      this.logger.error('Failed to create task', { error, input });
      throw error;
    }
  }

  async updateTask(path: string, updates: UpdateTaskInput): Promise<Task> {
    if (!this.initialized) {
      throw createError(
        ErrorCodes.OPERATION_FAILED,
        'Task operations not initialized'
      );
    }
    if (this.isShuttingDown) {
      throw createError(
        ErrorCodes.OPERATION_FAILED,
        'System is shutting down'
      );
    }

    // Get existing task
    const existingTask = await this.storage.getTask(path);
    if (!existingTask) {
      throw createError(ErrorCodes.TASK_NOT_FOUND, `Task not found: ${path}`);
    }

    // Validate updates
    await this.validator.validateUpdate(path, updates);

    const transaction = await this.transactionManager.begin({
      timeout: 10000,
      requireLock: true
    });

    try {
      // Update task with system fields
      const updatedTask = await this.storage.updateTask(path, {
        ...updates,
        version: existingTask.version + 1,
        updated: Date.now(),
        // Preserve other system fields
        created: existingTask.created,
        projectPath: existingTask.projectPath
      });

      // Add operation to transaction
      transaction.operations.push({
        id: `update-${Date.now()}`,
        type: 'update',
        timestamp: Date.now(),
        path: updatedTask.path,
        task: updatedTask,
        previousState: existingTask
      });

      // Handle status changes in batch
      if (updates.status && updates.status !== existingTask.status) {
        await this.handleStatusChange(existingTask, updatedTask);
        await this.statusUpdateBatch.execute();
      }

      // Emit update event
      this.eventManager.emit({
        type: EventTypes.TASK_UPDATED,
        timestamp: Date.now(),
        taskId: updatedTask.path,
        task: updatedTask,
        changes: {
          before: existingTask,
          after: updatedTask
        }
      });

      await this.transactionManager.commit(transaction);
      return updatedTask;
    } catch (error) {
      this.logger.error('Failed to update task', {
        error,
        path,
        updates
      });
      throw error;
    }
  }

  async deleteTask(path: string): Promise<void> {
    if (!this.initialized) {
      throw createError(ErrorCodes.OPERATION_FAILED, 'Task operations not initialized');
    }
    if (this.isShuttingDown) {
      throw createError(ErrorCodes.OPERATION_FAILED, 'System is shutting down');
    }

    // Get existing task
    const existingTask = await this.storage.getTask(path);
    if (!existingTask) {
      throw createError(ErrorCodes.TASK_NOT_FOUND, `Task not found: ${path}`);
    }

    const transaction = await this.transactionManager.begin({
      timeout: 10000,
      requireLock: true
    });

    try {
      // Delete task
      await this.storage.deleteTask(path);

      // Add operation to transaction
      transaction.operations.push({
        id: `delete-${Date.now()}`,
        type: 'delete',
        timestamp: Date.now(),
        path: existingTask.path,
        tasks: [existingTask]
      });

      // Emit delete event
      this.eventManager.emit({
        type: EventTypes.TASK_DELETED,
        timestamp: Date.now(),
        taskId: existingTask.path,
        task: existingTask
      });

      await this.transactionManager.commit(transaction);
    } catch (error) {
      this.logger.error('Failed to delete task', {
        error,
        path
      });
      throw error;
    }
  }

  private async handleStatusChange(
    oldTask: Task,
    newTask: Task
  ): Promise<void> {
    try {
      // Clear cache before status updates
      if ('clearCache' in this.storage) {
        await (this.storage as any).clearCache();
      }

      // Emit status change event
      this.eventManager.emit({
        type: EventTypes.TASK_STATUS_CHANGED,
        timestamp: Date.now(),
        taskId: newTask.path,
        task: newTask,
        changes: {
          before: { status: oldTask.status },
          after: { status: newTask.status }
        }
      });

      // Update parent task status if needed
      if (newTask.parentPath) {
        const parent = await this.storage.getTask(newTask.parentPath);
        if (parent) {
          const siblings = await this.storage.getSubtasks(parent.path);
          const allCompleted = siblings.every(t => t.status === TaskStatus.COMPLETED);
          const anyFailed = siblings.some(t => t.status === TaskStatus.FAILED);
          const anyBlocked = siblings.some(t => t.status === TaskStatus.BLOCKED);
          const anyInProgress = siblings.some(t => t.status === TaskStatus.IN_PROGRESS);

          let newParentStatus = parent.status;
          if (allCompleted) {
            newParentStatus = TaskStatus.COMPLETED;
          } else if (anyFailed) {
            newParentStatus = TaskStatus.FAILED;
          } else if (anyBlocked) {
            newParentStatus = TaskStatus.BLOCKED;
          } else if (anyInProgress) {
            newParentStatus = TaskStatus.IN_PROGRESS;
          }

          if (newParentStatus !== parent.status) {
            await this.updateTask(parent.path, {
              status: newParentStatus,
              metadata: {
                ...parent.metadata,
                statusUpdatedAt: Date.now(),
                previousStatus: parent.status
              }
            });
          }
        }
      }

      // Handle blocked status
      if (newTask.status === TaskStatus.BLOCKED) {
        await this.handleBlockedStatus(newTask);
      }

      // Handle completed status
      if (newTask.status === TaskStatus.COMPLETED) {
        await this.handleCompletedStatus(newTask);
      }

      // Handle failed status
      if (newTask.status === TaskStatus.FAILED) {
        await this.handleFailedStatus(newTask);
      }
    } catch (error) {
      this.logger.error('Failed to handle status change', {
        error,
        oldStatus: oldTask.status,
        newStatus: newTask.status,
        taskPath: newTask.path
      });
      throw error;
    }
  }

  private async handleFailedStatus(task: Task): Promise<void> {
    // Block dependent tasks when a task fails
    const dependentTasks = await this.storage.getDependentTasks(task.path);
    
    for (const depTask of dependentTasks) {
      if (depTask.status !== TaskStatus.FAILED) {
        await this.updateTask(depTask.path, {
          status: TaskStatus.BLOCKED,
            metadata: {
              ...depTask.metadata,
              blockedBy: task.path,
              blockReason: `Dependency task ${task.path} failed`,
              blockTimestamp: Date.now()
            }
        });
      }
    }
  }

  private async handleBlockedStatus(task: Task): Promise<void> {
    // Update dependent tasks to blocked status
    const dependentTasks = await this.storage.getDependentTasks(task.path);
    
    for (const depTask of dependentTasks) {
      if (depTask.status !== TaskStatus.BLOCKED) {
        await this.updateTask(depTask.path, {
          status: TaskStatus.BLOCKED,
            metadata: {
              ...depTask.metadata,
              blockedBy: task.path,
              blockTimestamp: Date.now()
            }
        });
      }
    }
  }

  private async handleCompletedStatus(task: Task): Promise<void> {
    // Check if dependent tasks can be unblocked
    const dependentTasks = await this.storage.getDependentTasks(task.path);
    
    for (const depTask of dependentTasks) {
      if (depTask.status === TaskStatus.BLOCKED) {
        // Check if all dependencies are completed
        const allDepsCompleted = await this.areAllDependenciesCompleted(depTask);
        
        if (allDepsCompleted) {
          await this.updateTask(depTask.path, {
            status: TaskStatus.PENDING,
            metadata: {
              ...depTask.metadata,
              blockedBy: undefined,
              blockTimestamp: undefined,
              unblockTimestamp: Date.now()
            }
          });
        }
      }
    }
  }

  private async areAllDependenciesCompleted(task: Task): Promise<boolean> {
    for (const depPath of task.dependencies) {
      const depTask = await this.storage.getTask(depPath);
      if (!depTask || depTask.status !== TaskStatus.COMPLETED) {
        return false;
      }
    }
    return true;
  }
}
