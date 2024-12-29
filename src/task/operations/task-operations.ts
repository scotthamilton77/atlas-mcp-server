import { Logger } from '../../logging/index.js';
import { EventManager } from '../../events/event-manager.js';
import { EventTypes } from '../../types/events.js';
import { TaskStorage } from '../../types/storage.js';
import { Task, TaskStatus, TaskType, CreateTaskInput, UpdateTaskInput } from '../../types/task.js';
import { TaskValidator } from '../validation/task-validator.js';
import { ErrorCodes, createError } from '../../errors/index.js';
import { TransactionManager } from '../core/transactions/transaction-manager.js';
import { Transaction } from '../../types/transaction.js';
import { StatusUpdateBatch } from '../core/batch/status-update-batch.js';
import { DependencyValidationMode } from '../validation/validators/dependency-validator.js';
import { HierarchyValidationMode } from '../validation/validators/hierarchy-validator.js';

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

  static async getInstance(
    storage: TaskStorage,
    validator: TaskValidator
  ): Promise<TaskOperations> {
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
          `Failed to initialize TaskOperations: ${error instanceof Error ? error.message : String(error)}`,
          'TaskOperations.getInstance'
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
        arrayBuffers: `${Math.round(memoryUsage.arrayBuffers / 1024 / 1024)}MB`,
      });

      if (heapUsed > this.HIGH_MEMORY_THRESHOLD) {
        this.logger.warn('High memory usage detected', {
          heapUsed: `${(heapUsed * 100).toFixed(1)}%`,
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
        memoryUsage: this.getMemoryMetrics(),
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
      heapUsedPercentage: `${((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100).toFixed(1)}%`,
    };
  }

  private logMemoryUsage(context: string): void {
    this.logger.info(`Memory usage - ${context}`, this.getMemoryMetrics());
  }

  async createTask(
    input: CreateTaskInput,
    options: {
      dependencyMode?: DependencyValidationMode;
      hierarchyMode?: HierarchyValidationMode;
    } = {}
  ): Promise<Task> {
    if (!this.initialized) {
      throw createError(
        ErrorCodes.OPERATION_FAILED,
        'Task operations not initialized',
        'TaskOperations.createTask'
      );
    }
    if (this.isShuttingDown) {
      throw createError(
        ErrorCodes.OPERATION_FAILED,
        'System is shutting down',
        'TaskOperations.createTask'
      );
    }

    // Set defaults
    const taskInput: CreateTaskInput = {
      ...input,
      type: input.type || TaskType.TASK, // Default to TASK type if not provided
    };

    // Validate input with validation modes
    await this.validator.validateCreate(taskInput, options.dependencyMode, options.hierarchyMode);

    const transaction = await this.transactionManager.begin({
      timeout: 10000,
      requireLock: true,
    });

    try {
      // Create task with processed input containing defaults
      const task = await this.storage.createTask(taskInput);

      // If task has a parent, update parent's subtasks array
      if (taskInput.parentPath) {
        const parent = await this.storage.getTask(taskInput.parentPath);
        if (parent) {
          const updatedParent = await this.storage.updateTask(parent.path, {
            subtasks: [...parent.subtasks, task.path],
            metadata: {
              ...parent.metadata,
              version: parent.version + 1,
              updated: Date.now(),
            },
          });

          // Add parent update to transaction
          transaction.operations.push({
            id: `update-parent-${Date.now()}`,
            type: 'update',
            timestamp: Date.now(),
            path: parent.path,
            task: updatedParent,
            previousState: parent,
          });
        }
      }

      // Add operation to transaction
      transaction.operations.push({
        id: `create-${Date.now()}`,
        type: 'create',
        timestamp: Date.now(),
        path: task.path,
        task,
      });

      // Emit event
      this.eventManager.emit({
        type: EventTypes.TASK_CREATED,
        timestamp: Date.now(),
        taskId: task.path,
        task,
        metadata: { input },
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
        'Task operations not initialized',
        'TaskOperations.updateTask'
      );
    }
    if (this.isShuttingDown) {
      throw createError(
        ErrorCodes.OPERATION_FAILED,
        'System is shutting down',
        'TaskOperations.updateTask'
      );
    }

    // Get existing task
    const existingTask = await this.storage.getTask(path);
    if (!existingTask) {
      throw createError(
        ErrorCodes.TASK_NOT_FOUND,
        `Task not found: ${path}`,
        'TaskOperations.updateTask'
      );
    }

    // Validate updates
    await this.validator.validateUpdate(path, updates);

    const transaction = await this.transactionManager.begin({
      timeout: 10000,
      requireLock: true,
    });

    try {
      // Update task with system fields
      const updatedTask = await this.storage.updateTask(path, {
        ...updates,
        metadata: {
          ...updates.metadata,
          version: existingTask.version + 1,
          updated: Date.now(),
        },
      });

      // Add operation to transaction
      transaction.operations.push({
        id: `update-${Date.now()}`,
        type: 'update',
        timestamp: Date.now(),
        path: updatedTask.path,
        task: updatedTask,
        previousState: existingTask,
      });

      // Handle status changes
      if (updates.status && updates.status !== existingTask.status) {
        // First handle the status change
        await this.handleStatusChange(existingTask, updatedTask, transaction);

        // Then update parent status if needed
        if (updatedTask.parentPath) {
          const parent = await this.storage.getTask(updatedTask.parentPath);
          if (parent) {
            const siblings = await this.storage.getSubtasks(parent.path);
            const now = Date.now();

            // Determine new parent status based on subtask states
            let newParentStatus = parent.status;

            // If any subtask is in progress, parent should be in progress
            if (
              updatedTask.status === TaskStatus.IN_PROGRESS ||
              siblings.some(t => t.status === TaskStatus.IN_PROGRESS)
            ) {
              newParentStatus = TaskStatus.IN_PROGRESS;
            }
            // If all subtasks are completed, parent should be completed
            else if (siblings.every(t => t.status === TaskStatus.COMPLETED)) {
              newParentStatus = TaskStatus.COMPLETED;
            }
            // If any subtask is blocked, parent should be blocked
            else if (
              updatedTask.status === TaskStatus.BLOCKED ||
              siblings.some(t => t.status === TaskStatus.BLOCKED)
            ) {
              newParentStatus = TaskStatus.BLOCKED;
            }
            // If any subtask has failed, parent should be failed
            else if (
              updatedTask.status === TaskStatus.FAILED ||
              siblings.some(t => t.status === TaskStatus.FAILED)
            ) {
              newParentStatus = TaskStatus.FAILED;
            }

            // Only update if status needs to change
            if (newParentStatus !== parent.status) {
              const updatedParent = await this.storage.updateTask(parent.path, {
                status: newParentStatus,
                metadata: {
                  ...parent.metadata,
                  statusUpdatedAt: now,
                  previousStatus: parent.status,
                  autoUpdated: true,
                  triggerTask: updatedTask.path,
                  updateReason: `Auto-updated due to subtask ${updatedTask.path} changing to ${updatedTask.status}`,
                },
              });

              // Add parent update to transaction
              transaction.operations.push({
                id: `update-parent-${now}`,
                type: 'update',
                timestamp: now,
                path: parent.path,
                task: updatedParent,
                previousState: parent,
              });

              // Recursively update grandparent if needed
              await this.handleStatusChange(parent, updatedParent, transaction);
            }
          }
        }

        // Finally execute any batched status updates
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
          after: updatedTask,
        },
      });

      await this.transactionManager.commit(transaction);
      return updatedTask;
    } catch (error) {
      await this.transactionManager.rollback(transaction);
      this.logger.error('Failed to update task', {
        error,
        path,
        updates,
      });
      throw error;
    }
  }

  async deleteTask(path: string): Promise<void> {
    if (!this.initialized) {
      throw createError(
        ErrorCodes.OPERATION_FAILED,
        'Task operations not initialized',
        'TaskOperations.deleteTask'
      );
    }
    if (this.isShuttingDown) {
      throw createError(
        ErrorCodes.OPERATION_FAILED,
        'System is shutting down',
        'TaskOperations.deleteTask'
      );
    }

    // Get existing task
    const existingTask = await this.storage.getTask(path);
    if (!existingTask) {
      throw createError(
        ErrorCodes.TASK_NOT_FOUND,
        `Task not found: ${path}`,
        'TaskOperations.deleteTask'
      );
    }

    const transaction = await this.transactionManager.begin({
      timeout: 10000,
      requireLock: true,
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
        tasks: [existingTask],
      });

      // Emit delete event
      this.eventManager.emit({
        type: EventTypes.TASK_DELETED,
        timestamp: Date.now(),
        taskId: existingTask.path,
        task: existingTask,
      });

      await this.transactionManager.commit(transaction);
    } catch (error) {
      await this.transactionManager.rollback(transaction);
      this.logger.error('Failed to delete task', {
        error,
        path,
      });
      throw error;
    }
  }

  private async handleStatusChange(
    oldTask: Task,
    newTask: Task,
    transaction: Transaction
  ): Promise<void> {
    try {
      const now = Date.now();

      // Clear cache before status updates
      if ('clearCache' in this.storage) {
        await (this.storage as any).clearCache();
      }

      // Emit status change event
      this.eventManager.emit({
        type: EventTypes.TASK_STATUS_CHANGED,
        timestamp: now,
        taskId: newTask.path,
        task: newTask,
        changes: {
          before: { status: oldTask.status },
          after: { status: newTask.status },
        },
      });

      // Handle status-specific effects
      switch (newTask.status) {
        case TaskStatus.IN_PROGRESS:
          // When a task starts, parent should also be in progress
          if (newTask.parentPath) {
            const parent = await this.storage.getTask(newTask.parentPath);
            if (parent && parent.status === TaskStatus.PENDING) {
              const updatedParent = await this.storage.updateTask(parent.path, {
                status: TaskStatus.IN_PROGRESS,
                metadata: {
                  ...parent.metadata,
                  statusUpdatedAt: now,
                  previousStatus: parent.status,
                  autoUpdated: true,
                  triggerTask: newTask.path,
                  updateReason: `Auto-started due to subtask ${newTask.path}`,
                },
              });

              // Add parent update to transaction
              transaction.operations.push({
                id: `update-parent-${now}`,
                type: 'update',
                timestamp: now,
                path: parent.path,
                task: updatedParent,
                previousState: parent,
              });

              // Recursively update grandparent if needed
              await this.handleStatusChange(parent, updatedParent, transaction);
            }
          }
          break;

        case TaskStatus.BLOCKED:
          await this.handleBlockedStatus(newTask);
          break;

        case TaskStatus.COMPLETED:
          await this.handleCompletedStatus(newTask);
          // Check if all siblings are completed to complete parent
          if (newTask.parentPath) {
            const parent = await this.storage.getTask(newTask.parentPath);
            if (parent) {
              const siblings = await this.storage.getSubtasks(parent.path);
              if (siblings.every(t => t.status === TaskStatus.COMPLETED)) {
                const updatedParent = await this.storage.updateTask(parent.path, {
                  status: TaskStatus.COMPLETED,
                  metadata: {
                    ...parent.metadata,
                    statusUpdatedAt: now,
                    previousStatus: parent.status,
                    autoUpdated: true,
                    triggerTask: newTask.path,
                    updateReason: `Auto-completed as all subtasks are complete`,
                  },
                });

                // Add parent update to transaction
                transaction.operations.push({
                  id: `update-parent-${now}`,
                  type: 'update',
                  timestamp: now,
                  path: parent.path,
                  task: updatedParent,
                  previousState: parent,
                });

                // Recursively update grandparent if needed
                await this.handleStatusChange(parent, updatedParent, transaction);
              }
            }
          }
          break;

        case TaskStatus.FAILED:
          await this.handleFailedStatus(newTask);
          // Update parent status to reflect failure
          if (newTask.parentPath) {
            const parent = await this.storage.getTask(newTask.parentPath);
            if (parent) {
              const updatedParent = await this.storage.updateTask(parent.path, {
                status: TaskStatus.FAILED,
                metadata: {
                  ...parent.metadata,
                  statusUpdatedAt: now,
                  previousStatus: parent.status,
                  autoUpdated: true,
                  triggerTask: newTask.path,
                  updateReason: `Auto-failed due to subtask ${newTask.path} failure`,
                },
              });

              // Add parent update to transaction
              transaction.operations.push({
                id: `update-parent-${now}`,
                type: 'update',
                timestamp: now,
                path: parent.path,
                task: updatedParent,
                previousState: parent,
              });

              // Recursively update grandparent if needed
              await this.handleStatusChange(parent, updatedParent, transaction);
            }
          }
          break;
      }
    } catch (error) {
      this.logger.error('Failed to handle status change', {
        error,
        oldStatus: oldTask.status,
        newStatus: newTask.status,
        taskPath: newTask.path,
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
            blockTimestamp: Date.now(),
          },
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
            blockTimestamp: Date.now(),
          },
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
              unblockTimestamp: Date.now(),
            },
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
