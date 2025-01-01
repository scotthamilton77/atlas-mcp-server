import { Task, TaskStatus } from '../../../types/task.js';
import { ErrorCodes, createError } from '../../../errors/index.js';

/**
 * Validates task status transitions and dependencies
 */
export class StatusValidator {
  /**
   * Validates a status transition for a task
   */
  async validateStatusTransition(
    task: Task,
    newStatus: TaskStatus,
    getTaskByPath: (path: string) => Promise<Task | null>
  ): Promise<{ status: TaskStatus; autoTransition?: boolean }> {
    // Define valid status transitions
    const validTransitions: Record<TaskStatus, TaskStatus[]> = {
      [TaskStatus.PENDING]: [TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED, TaskStatus.CANCELLED],
      [TaskStatus.IN_PROGRESS]: [TaskStatus.COMPLETED, TaskStatus.CANCELLED, TaskStatus.BLOCKED],
      [TaskStatus.COMPLETED]: [], // No transitions from COMPLETED
      [TaskStatus.CANCELLED]: [TaskStatus.PENDING], // Can retry from CANCELLED
      [TaskStatus.BLOCKED]: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS], // Can unblock
    };

    // Special case: Allow auto-transition to BLOCKED
    if (newStatus !== TaskStatus.BLOCKED) {
      // Check if transition is valid
      if (!validTransitions[task.status]?.includes(newStatus)) {
        throw createError(
          ErrorCodes.TASK_STATUS,
          `Invalid status transition from ${task.status} to ${newStatus}. Valid transitions are: ${validTransitions[task.status]?.join(', ')}`,
          'StatusValidator.validateStatusTransition',
          undefined,
          {
            taskPath: task.path,
            currentStatus: task.status,
            newStatus,
            validTransitions: validTransitions[task.status],
          }
        );
      }
    }

    // Check dependencies for COMPLETED status
    if (newStatus === TaskStatus.COMPLETED) {
      await this.validateCompletionDependencies(task, getTaskByPath);
    }

    // Enhanced dependency checking for IN_PROGRESS
    if (newStatus === TaskStatus.IN_PROGRESS) {
      const { isBlocked } = await this.checkDependencyStatus(task, getTaskByPath);
      if (isBlocked) {
        // Auto-transition to BLOCKED status
        return {
          status: TaskStatus.BLOCKED,
          autoTransition: true,
        };
      }
    }

    // Check if task should be unblocked
    if (task.status === TaskStatus.BLOCKED && newStatus === TaskStatus.PENDING) {
      const { isBlocked } = await this.checkDependencyStatus(task, getTaskByPath);
      if (isBlocked) {
        throw createError(
          ErrorCodes.TASK_DEPENDENCY,
          'Cannot unblock task: dependencies are still incomplete',
          'StatusValidator.validateStatusTransition',
          undefined,
          {
            taskPath: task.path,
            dependencies: task.dependencies,
          }
        );
      }
    }

    return { status: newStatus };
  }

  /**
   * Validates that all dependencies are completed before allowing completion
   */
  private async validateCompletionDependencies(
    task: Task,
    getTaskByPath: (path: string) => Promise<Task | null>
  ): Promise<void> {
    if (!Array.isArray(task.dependencies)) {
      throw createError(
        ErrorCodes.TASK_DEPENDENCY,
        'Task dependencies must be an array',
        'StatusValidator.validateCompletionDependencies'
      );
    }

    for (const depPath of task.dependencies) {
      const depTask = await getTaskByPath(depPath);
      if (!depTask || depTask.status !== TaskStatus.COMPLETED) {
        throw createError(
          ErrorCodes.TASK_DEPENDENCY,
          `Cannot complete task: dependency ${depPath} is not completed`,
          'StatusValidator.validateCompletionDependencies',
          undefined,
          {
            taskPath: task.path,
            dependencyPath: depPath,
            dependencyStatus: depTask?.status,
          }
        );
      }
    }
  }

  /**
   * Enhanced dependency status check
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
      throw createError(
        ErrorCodes.TASK_DEPENDENCY,
        'Task dependencies must be an array',
        'StatusValidator.checkDependencyStatus'
      );
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

      // Strict status validation
      if (depTask.status !== TaskStatus.COMPLETED) {
        blockingDeps.push({
          path: depPath,
          status: depTask.status,
          details: this.getDependencyBlockReason(depTask),
        });
      }

      // Check transitive dependencies if blocked
      if (depTask.status === TaskStatus.BLOCKED) {
        const transitiveCheck = await this.checkDependencyStatus(depTask, getTaskByPath);
        if (transitiveCheck.blockingDeps) {
          blockingDeps.push({
            path: depPath,
            status: TaskStatus.BLOCKED,
            details: `Blocked by transitive dependencies: ${transitiveCheck.blockingDeps.map(d => d.path).join(', ')}`,
          });
        }
      }
    }

    if (blockingDeps.length > 0) {
      const reasons = blockingDeps.map(
        dep => `${dep.path} (${dep.status}${dep.details ? `: ${dep.details}` : ''})`
      );
      return {
        isBlocked: true,
        reason: `Blocked by dependencies: ${reasons.join(', ')}`,
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
    // Cannot complete if siblings are blocked
    if (newStatus === TaskStatus.COMPLETED && siblings.some(s => s.status === TaskStatus.BLOCKED)) {
      throw createError(
        ErrorCodes.TASK_STATUS,
        'Cannot complete task while sibling tasks are blocked',
        'StatusValidator.validateParentChildStatus'
      );
    }

    // Cannot start if siblings have failed
    if (
      newStatus === TaskStatus.IN_PROGRESS &&
      siblings.some(s => s.status === TaskStatus.CANCELLED)
    ) {
      throw createError(
        ErrorCodes.TASK_STATUS,
        'Cannot start task while sibling tasks have failed',
        'StatusValidator.validateParentChildStatus'
      );
    }

    // Check parent task status and handle propagation
    if (task.parentPath) {
      const parent = await getTaskByPath(task.parentPath);
      if (parent) {
        if (parent.status === TaskStatus.COMPLETED && newStatus !== TaskStatus.COMPLETED) {
          throw createError(
            ErrorCodes.TASK_STATUS,
            'Cannot modify subtask status when parent is completed',
            'StatusValidator.validateParentChildStatus'
          );
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

        // If parent is cancelled, all non-completed children should be cancelled
        if (parent.status === TaskStatus.CANCELLED && task.status !== TaskStatus.COMPLETED) {
          return {
            parentUpdate: {
              path: task.path,
              status: TaskStatus.CANCELLED,
            },
          };
        }
      }
    }

    return {};
  }
}
