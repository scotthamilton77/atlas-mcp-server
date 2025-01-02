import { Task, TaskStatus } from '../../../types/task.js';
import { Logger } from '../../../logging/index.js';
import { TaskErrorFactory } from '../../../errors/task-error.js';

interface DependencyDetail {
  path: string;
  status: TaskStatus;
  reason?: string;
}

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
    // Define valid status transitions
    const validTransitions: Record<TaskStatus, TaskStatus[]> = {
      [TaskStatus.PENDING]: [TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED, TaskStatus.CANCELLED],
      [TaskStatus.IN_PROGRESS]: [TaskStatus.COMPLETED, TaskStatus.CANCELLED, TaskStatus.BLOCKED],
      [TaskStatus.COMPLETED]: [TaskStatus.IN_PROGRESS], // Allow reopening for testing
      [TaskStatus.CANCELLED]: [TaskStatus.PENDING], // Only allow restart from cancelled
      [TaskStatus.BLOCKED]: [TaskStatus.PENDING, TaskStatus.CANCELLED], // Can unblock or cancel
    };

    // Check if transition is valid with detailed messaging
    if (!validTransitions[task.status]?.includes(newStatus)) {
      const allowedTransitions = validTransitions[task.status]?.join(', ') || 'none';
      throw TaskErrorFactory.createTaskStatusError(
        'StatusValidator.validateStatusTransition',
        `Invalid status transition from ${task.status} to ${newStatus}. ` +
          `Allowed transitions from ${task.status}: ${allowedTransitions}. ` +
          `Consider updating dependencies or parent tasks first.`,
        {
          taskPath: task.path,
          currentStatus: task.status,
          newStatus,
          allowedTransitions: validTransitions[task.status],
          metadata: task.metadata,
        }
      );
    }

    // Log transition attempt for debugging
    this.logger.debug('Attempting status transition', {
      taskPath: task.path,
      fromStatus: task.status,
      toStatus: newStatus,
      hasParent: !!task.parentPath,
      dependencyCount: task.dependencies?.length || 0,
      metadata: task.metadata,
    });

    // Enhanced dependency checking for completion
    if (newStatus === TaskStatus.COMPLETED) {
      const { incompleteDeps, details } = await this.checkCompletionDependencies(
        task,
        getTaskByPath
      );
      if (incompleteDeps.length > 0) {
        const depDetails = details
          .map(d => `${d.path} (${d.status}${d.reason ? `: ${d.reason}` : ''})`)
          .join('\n- ');

        throw TaskErrorFactory.createTaskDependencyError(
          'StatusValidator.validateStatusTransition',
          `Cannot complete task: Dependencies not ready:\n- ${depDetails}\n\n` +
            `All dependencies must be COMPLETED before marking this task as COMPLETED.`,
          {
            taskPath: task.path,
            incompleteDependencies: incompleteDeps,
            dependencyDetails: details,
          }
        );
      }
    }

    // Strict dependency checking for IN_PROGRESS
    if (newStatus === TaskStatus.IN_PROGRESS) {
      const { isBlocked, blockingDeps } = await this.checkDependencyStatus(task, getTaskByPath);
      if (isBlocked) {
        // Auto-transition to BLOCKED if dependencies are blocking
        this.logger.warn('Task blocked by dependencies', {
          taskPath: task.path,
          blockingDeps,
          currentStatus: task.status,
          newStatus: TaskStatus.BLOCKED,
        });
        return {
          status: TaskStatus.BLOCKED,
          autoTransition: true,
        };
      }
    }

    // Validate unblocking
    if (task.status === TaskStatus.BLOCKED && newStatus === TaskStatus.PENDING) {
      const { isBlocked, reason } = await this.checkDependencyStatus(task, getTaskByPath);
      if (isBlocked) {
        throw TaskErrorFactory.createTaskDependencyError(
          'StatusValidator.validateStatusTransition',
          `Cannot unblock task: ${reason || 'Dependencies are blocking'}`,
          { taskPath: task.path }
        );
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
  ): Promise<{ incompleteDeps: string[]; details: DependencyDetail[] }> {
    if (!Array.isArray(task.dependencies)) {
      return { incompleteDeps: [], details: [] };
    }

    const incompleteDeps: string[] = [];
    const details: DependencyDetail[] = [];

    for (const depPath of task.dependencies) {
      const depTask = await getTaskByPath(depPath);
      if (!depTask || depTask.status !== TaskStatus.COMPLETED) {
        incompleteDeps.push(depPath);
        details.push({
          path: depPath,
          status: depTask?.status || TaskStatus.PENDING,
          reason: !depTask ? 'Dependency not found' : this.getDependencyBlockReason(depTask),
        });
      }
    }

    return { incompleteDeps, details };
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

      // Consider both CANCELLED and BLOCKED as potential blockers
      if (depTask.status === TaskStatus.CANCELLED || depTask.status === TaskStatus.BLOCKED) {
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
