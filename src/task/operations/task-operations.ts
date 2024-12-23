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

    // Handle blocked status
    if (newTask.status === TaskStatus.BLOCKED) {
      await this.handleBlockedStatus(newTask);
    }

    // Handle completed status
    if (newTask.status === TaskStatus.COMPLETED) {
      await this.handleCompletedStatus(newTask);
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
