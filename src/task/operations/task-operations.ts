import { Logger } from '../../logging/index.js';
import { TaskStorage } from '../../types/storage.js';
import { Task, TaskStatus, TaskType } from '../../types/task.js';
import { TaskErrorFactory } from '../../errors/task-error.js';

export class TaskOperations {
  protected readonly logger: Logger;

  constructor(private readonly storage: TaskStorage) {
    this.logger = Logger.getInstance().child({ component: 'TaskOperations' });
  }

  /**
   * Update parent task status based on children
   */
  protected async updateParentStatus(task: Task): Promise<void> {
    if (!task.parentPath) return;

    const parent = await this.storage.getTask(task.parentPath);
    if (!parent) return;

    try {
      const siblings = await this.storage.getChildren(parent.path);

      // Don't update parent status if it's not a milestone
      if (parent.type !== TaskType.MILESTONE) return;

      // Update parent status based on children
      let newStatus = parent.status;

      // If any child is in progress, parent should be in progress
      if (siblings.some(t => t.status === TaskStatus.IN_PROGRESS)) {
        newStatus = TaskStatus.IN_PROGRESS;
      }
      // If all children are completed, parent should be completed
      else if (siblings.every(t => t.status === TaskStatus.COMPLETED)) {
        newStatus = TaskStatus.COMPLETED;
      }
      // If any child is blocked, parent should be blocked
      else if (siblings.some(t => t.status === TaskStatus.BLOCKED)) {
        newStatus = TaskStatus.BLOCKED;
      }
      // If any child is failed, parent should be failed
      else if (siblings.some(t => t.status === TaskStatus.CANCELLED)) {
        newStatus = TaskStatus.CANCELLED;
      }

      // Update parent if status changed
      if (newStatus !== parent.status) {
        await this.storage.updateTask(parent.path, {
          status: newStatus,
          statusMetadata: {
            ...parent.statusMetadata,
            lastUpdated: new Date().toISOString(),
          },
        });

        // Recursively update grandparent
        await this.updateParentStatus(parent);
      }
    } catch (error) {
      this.logger.error('Failed to update parent status', {
        error,
        context: {
          taskPath: task.path,
          parentPath: task.parentPath,
        },
      });
    }
  }

  /**
   * Update child task statuses based on parent
   */
  protected async updateChildrenStatus(task: Task): Promise<void> {
    try {
      const children = await this.storage.getChildren(task.path);
      if (children.length === 0) return;

      // Only propagate status changes for specific cases
      let shouldPropagate = false;
      let newStatus: TaskStatus | undefined;

      switch (task.status) {
        case TaskStatus.BLOCKED:
          // Block all non-completed children
          shouldPropagate = true;
          newStatus = TaskStatus.BLOCKED;
          break;

        case TaskStatus.COMPLETED: {
          // Check if all children are completed
          const allCompleted = children.every(t => t.status === TaskStatus.COMPLETED);
          if (!allCompleted) {
            // Update parent back to in progress
            await this.storage.updateTask(task.path, {
              status: TaskStatus.IN_PROGRESS,
              statusMetadata: {
                ...task.statusMetadata,
                lastUpdated: new Date().toISOString(),
              },
            });
          }
          break;
        }

        case TaskStatus.CANCELLED:
          // Cancel all non-completed children
          shouldPropagate = true;
          newStatus = TaskStatus.CANCELLED;
          break;

        default:
          break;
      }

      if (shouldPropagate && newStatus) {
        for (const child of children) {
          if (child.status !== TaskStatus.COMPLETED) {
            await this.storage.updateTask(child.path, {
              status: newStatus,
              statusMetadata: {
                ...child.statusMetadata,
                lastUpdated: new Date().toISOString(),
              },
            });

            // Recursively update grandchildren
            await this.updateChildrenStatus(child);
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to update children status', {
        error,
        context: { taskPath: task.path },
      });
    }
  }

  /**
   * Update task relationships when parent path changes
   */
  protected async updateTaskRelationships(
    taskPath: string,
    oldParentPath: string | undefined,
    newParentPath: string | undefined
  ): Promise<void> {
    try {
      // Remove from old parent if it exists
      if (oldParentPath) {
        const oldParent = await this.storage.getTask(oldParentPath);
        if (oldParent) {
          this.logger.debug('Removed task from old parent', { taskPath, oldParentPath });
        }
      }

      // Add to new parent if it exists
      if (newParentPath) {
        const newParent = await this.storage.getTask(newParentPath);
        if (newParent) {
          this.logger.debug('Added task to new parent', { taskPath, newParentPath });
        }
      }
    } catch (error) {
      this.logger.error('Failed to update task relationships', {
        error,
        context: { taskPath, oldParentPath, newParentPath },
      });

      throw TaskErrorFactory.createTaskOperationError(
        'TaskOperations.updateTaskRelationships',
        'Failed to update task relationships',
        { taskPath, oldParentPath, newParentPath }
      );
    }
  }
}
