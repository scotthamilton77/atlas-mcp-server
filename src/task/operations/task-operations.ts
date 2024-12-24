import { Logger } from '../../logging/index.js';
import { EventManager } from '../../events/event-manager.js';
import { EventTypes } from '../../types/events.js';
import { TaskStorage } from '../../types/storage.js';
import { Task, TaskStatus, CreateTaskInput, UpdateTaskInput } from '../../types/task.js';
import { TaskValidator } from '../validation/task-validator.js';
import { ErrorCodes, createError } from '../../errors/index.js';

export class TaskOperations {
  private readonly logger: Logger;
  private readonly eventManager: EventManager;

  constructor(
    private readonly storage: TaskStorage,
    private readonly validator: TaskValidator
  ) {
    this.logger = Logger.getInstance().child({ component: 'TaskOperations' });
    this.eventManager = EventManager.getInstance();
  }

  async createTask(input: CreateTaskInput): Promise<Task> {
    try {
      // Validate input
      await this.validator.validateCreate(input);

      // Start transaction
      await this.storage.beginTransaction();

      try {
        // Create task
        const task = await this.storage.createTask(input);

        // Emit event
        this.eventManager.emit({
          type: EventTypes.TASK_CREATED,
          timestamp: Date.now(),
          task,
          metadata: {
            input
          }
        });

        // Commit transaction
        await this.storage.commitTransaction();

        return task;
      } catch (error) {
        // Rollback on error
        await this.storage.rollbackTransaction();
        throw error;
      }
    } catch (error) {
      this.logger.error('Failed to create task', {
        error,
        input
      });
      throw error;
    }
  }

  async updateTask(path: string, updates: UpdateTaskInput): Promise<Task> {
    try {
      // Get existing task
      const existingTask = await this.storage.getTask(path);
      if (!existingTask) {
        throw createError(
          ErrorCodes.TASK_NOT_FOUND,
          `Task not found: ${path}`
        );
      }

      // Validate updates
      await this.validator.validateUpdate(path, updates);

      // Start transaction
      await this.storage.beginTransaction();

      try {
        // Update task
        const updatedTask = await this.storage.updateTask(path, updates);

        // Check if status changed
        if (updates.status && updates.status !== existingTask.status) {
          await this.handleStatusChange(existingTask, updatedTask);
        }

        // Emit update event
        this.eventManager.emit({
          type: EventTypes.TASK_UPDATED,
          timestamp: Date.now(),
          task: updatedTask,
          changes: {
            before: existingTask,
            after: updatedTask
          }
        });

        // Commit transaction
        await this.storage.commitTransaction();

        return updatedTask;
      } catch (error) {
        // Rollback on error
        await this.storage.rollbackTransaction();
        throw error;
      }
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
    try {
      // Get existing task
      const existingTask = await this.storage.getTask(path);
      if (!existingTask) {
        throw createError(
          ErrorCodes.TASK_NOT_FOUND,
          `Task not found: ${path}`
        );
      }

      // Start transaction
      await this.storage.beginTransaction();

      try {
        // Delete task
        await this.storage.deleteTask(path);

        // Emit delete event
        this.eventManager.emit({
          type: EventTypes.TASK_DELETED,
          timestamp: Date.now(),
          task: existingTask
        });

        // Commit transaction
        await this.storage.commitTransaction();
      } catch (error) {
        // Rollback on error
        await this.storage.rollbackTransaction();
        throw error;
      }
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
            blockReason: `Dependency task ${task.path} failed`
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
            blockedBy: task.path
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
              blockedBy: undefined
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
