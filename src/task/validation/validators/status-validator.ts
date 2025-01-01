import { Task, TaskStatus } from '../../../types/task.js';
import { Logger } from '../../../logging/index.js';

/**
 * Validates task status transitions and dependencies
 */
export class StatusValidator {
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance().child({ component: 'StatusValidator' });
  }

  /**
   * Validates a status transition for a task
   */
  async validateStatusTransition(
    task: Task,
    newStatus: TaskStatus,
    getTaskByPath: (path: string) => Promise<Task | null>
  ): Promise<{ status: TaskStatus; autoTransition?: boolean }> {
    // Define valid status transitions with more flexibility
    const validTransitions: Record<TaskStatus, TaskStatus[]> = {
      [TaskStatus.PENDING]: [
        TaskStatus.IN_PROGRESS,
        TaskStatus.BLOCKED,
        TaskStatus.CANCELLED,
        TaskStatus.COMPLETED,
      ],
      [TaskStatus.IN_PROGRESS]: [
        TaskStatus.COMPLETED,
        TaskStatus.CANCELLED,
        TaskStatus.BLOCKED,
        TaskStatus.PENDING,
      ],
      [TaskStatus.COMPLETED]: [TaskStatus.IN_PROGRESS, TaskStatus.PENDING], // Allow reopening completed tasks
      [TaskStatus.CANCELLED]: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS], // More flexible retry options
      [TaskStatus.BLOCKED]: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED], // More unblock options
    };

    // Special case: Allow auto-transition to BLOCKED
    if (newStatus !== TaskStatus.BLOCKED) {
      // Check if transition is valid
      if (!validTransitions[task.status]?.includes(newStatus)) {
        this.logger.warn('Invalid status transition attempted', {
          taskPath: task.path,
          currentStatus: task.status,
          newStatus,
          validTransitions: validTransitions[task.status],
        });
        // Return current status instead of throwing error
        return { status: task.status };
      }
    }

    // Check dependencies for COMPLETED status - now with warnings instead of errors
    if (newStatus === TaskStatus.COMPLETED) {
      const incompleteDepsPaths = await this.checkCompletionDependencies(task, getTaskByPath);
      if (incompleteDepsPaths.length > 0) {
        this.logger.warn('Completing task with incomplete dependencies', {
          taskPath: task.path,
          incompleteDependencies: incompleteDepsPaths,
        });
      }
    }

    // Relaxed dependency checking for IN_PROGRESS
    if (newStatus === TaskStatus.IN_PROGRESS) {
      const { isBlocked, reason } = await this.checkDependencyStatus(task, getTaskByPath);
      if (isBlocked) {
        this.logger.warn('Starting task with blocked dependencies', {
          taskPath: task.path,
          reason,
        });
      }
    }

    // More flexible unblocking
    if (task.status === TaskStatus.BLOCKED && newStatus === TaskStatus.PENDING) {
      const { isBlocked, reason } = await this.checkDependencyStatus(task, getTaskByPath);
      if (isBlocked) {
        this.logger.warn('Unblocking task with incomplete dependencies', {
          taskPath: task.path,
          reason,
        });
      }
    }

    return { status: newStatus };
  }

  /**
   * Check completion dependencies but return paths instead of throwing errors
   */
  private async checkCompletionDependencies(
    task: Task,
    getTaskByPath: (path: string) => Promise<Task | null>
  ): Promise<string[]> {
    if (!Array.isArray(task.dependencies)) {
      return [];
    }

    const incompleteDeps: string[] = [];
    for (const depPath of task.dependencies) {
      const depTask = await getTaskByPath(depPath);
      if (!depTask || depTask.status !== TaskStatus.COMPLETED) {
        incompleteDeps.push(depPath);
      }
    }

    return incompleteDeps;
  }

  /**
   * Enhanced dependency status check with more details
   */
  private async checkDependencyStatus(
    task: Task,
    getTaskByPath: (path: string) => Promise<Task | null>
  ): Promise<{
    isBlocked: boolean;
    reason?: string;
    blockingDeps?: Array<{ path: string; status: TaskStatus; details?: string }>;
  }> {
    if (!Array.isArray(task.dependencies)) {
      return { isBlocked: false };
    }

    const blockingDeps: Array<{ path: string; status: TaskStatus; details?: string }> = [];
    const depCache = new Map<string, Task>();

    // First pass: Check direct dependencies
    for (const depPath of task.dependencies) {
      const depTask = await getTaskByPath(depPath);
      if (depTask) {
        depCache.set(depPath, depTask);
      }

      if (!depTask) {
        blockingDeps.push({
          path: depPath,
          status: TaskStatus.PENDING,
          details: 'Dependency not found',
        });
        continue;
      }

      // Relaxed status validation - only consider CANCELLED as blocking
      if (depTask.status === TaskStatus.CANCELLED) {
        blockingDeps.push({
          path: depPath,
          status: depTask.status,
          details: this.getDependencyBlockReason(depTask),
        });
      }
    }

    if (blockingDeps.length > 0) {
      const reasons = blockingDeps.map(
        dep => `${dep.path} (${dep.status}${dep.details ? `: ${dep.details}` : ''})`
      );
      return {
        isBlocked: true,
        reason: `Dependencies with issues: ${reasons.join(', ')}`,
        blockingDeps,
      };
    }

    return { isBlocked: false };
  }

  /**
   * Get detailed reason for dependency blocking
   */
  private getDependencyBlockReason(task: Task): string {
    switch (task.status) {
      case TaskStatus.PENDING:
        return 'Not started';
      case TaskStatus.IN_PROGRESS:
        return `In progress (${task.metadata?.progress?.percentage || 0}% complete)`;
      case TaskStatus.BLOCKED:
        return task.metadata?.blockInfo?.blockReason || 'Blocked by dependencies';
      case TaskStatus.CANCELLED:
        return 'Task was cancelled';
      default:
        return `Invalid status: ${task.status}`;
    }
  }

  /**
   * Validates status constraints between parent and child tasks
   */
  async validateParentChildStatus(
    task: Task,
    newStatus: TaskStatus,
    siblings: Task[],
    getTaskByPath: (path: string) => Promise<Task | null>
  ): Promise<{ parentUpdate?: { path: string; status: TaskStatus } }> {
    // Warn but don't block if siblings are blocked
    if (newStatus === TaskStatus.COMPLETED && siblings.some(s => s.status === TaskStatus.BLOCKED)) {
      this.logger.warn('Completing task while siblings are blocked', {
        taskPath: task.path,
        blockedSiblings: siblings.filter(s => s.status === TaskStatus.BLOCKED).map(s => s.path),
      });
    }

    // Warn but don't block if siblings have failed
    if (
      newStatus === TaskStatus.IN_PROGRESS &&
      siblings.some(s => s.status === TaskStatus.CANCELLED)
    ) {
      this.logger.warn('Starting task while sibling tasks have failed', {
        taskPath: task.path,
        failedSiblings: siblings.filter(s => s.status === TaskStatus.CANCELLED).map(s => s.path),
      });
    }

    // Check parent task status and handle propagation
    if (task.parentPath) {
      const parent = await getTaskByPath(task.parentPath);
      if (parent) {
        // Allow modifying subtasks of completed parents, but log a warning
        if (parent.status === TaskStatus.COMPLETED && newStatus !== TaskStatus.COMPLETED) {
          this.logger.warn('Modifying subtask of completed parent', {
            taskPath: task.path,
            parentPath: parent.path,
            newStatus,
          });
        }

        if (newStatus === TaskStatus.COMPLETED) {
          const allSiblingsCompleted = siblings.every(s =>
            s.path === task.path ? true : s.status === TaskStatus.COMPLETED
          );

          if (allSiblingsCompleted) {
            return {
              parentUpdate: {
                path: parent.path,
                status: TaskStatus.COMPLETED,
              },
            };
          }
        }

        // Make parent cancellation more flexible
        if (parent.status === TaskStatus.CANCELLED && task.status !== TaskStatus.COMPLETED) {
          this.logger.warn('Child task of cancelled parent being updated', {
            taskPath: task.path,
            parentPath: parent.path,
            newStatus,
          });
        }
      }
    }

    return {};
  }
}
