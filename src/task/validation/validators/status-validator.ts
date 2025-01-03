import { Task, TaskStatus } from '../../../types/task.js';
import { Logger } from '../../../logging/index.js';
import { TaskErrorFactory } from '../../../errors/task-error.js';
import { StatusStateMachine } from '../../core/status-state-machine.js';
import { ErrorCategory } from '../../../types/error.js';

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
  private stateMachine: StatusStateMachine;

  constructor() {
    this.logger = Logger.getInstance().child({ component: 'StatusValidator' });
    this.stateMachine = new StatusStateMachine();
  }

  /**
   * Validates a status transition for a task
   */
  async validateStatusTransition(
    task: Task,
    newStatus: TaskStatus,
    getTaskByPath: (path: string) => Promise<Task | null>
  ): Promise<{ status: TaskStatus; autoTransition?: boolean }> {
    // First check state machine rules
    const transitionResult = await this.stateMachine.validateTransition({
      taskPath: task.path,
      fromStatus: task.status,
      toStatus: newStatus,
      metadata: task.metadata,
      logger: this.logger,
      getTaskByPath,
    });

    if (!transitionResult.valid) {
      // For expected validation failures, use info level logging
      if (transitionResult.expected) {
        this.logger.info('Status transition validation failed', {
          taskPath: task.path,
          fromStatus: task.status,
          toStatus: newStatus,
          reason: transitionResult.reason,
          metadata: task.metadata,
        });
      } else {
        // For unexpected failures, use error level logging
        this.logger.error('Unexpected error in status transition', {
          taskPath: task.path,
          fromStatus: task.status,
          toStatus: newStatus,
          reason: transitionResult.reason,
          metadata: task.metadata,
        });
      }

      const errorMetadata = {
        taskPath: task.path,
        currentStatus: task.status,
        newStatus,
        metadata: task.metadata,
        expected: transitionResult.expected,
        category: ErrorCategory.VALIDATION,
        isWarning: transitionResult.expected,
      };

      throw TaskErrorFactory.createTaskStatusError(
        'StatusValidator.validateStatusTransition',
        transitionResult.reason || 'Invalid status transition',
        errorMetadata
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

        const errorMetadata = {
          taskPath: task.path,
          incompleteDependencies: incompleteDeps,
          dependencyDetails: details,
          category: ErrorCategory.VALIDATION,
          expected: true,
          isWarning: true,
        };

        throw TaskErrorFactory.createTaskDependencyError(
          'StatusValidator.validateStatusTransition',
          `Cannot complete task: Dependencies not ready:\n- ${depDetails}\n\n` +
            `All dependencies must be COMPLETED before marking this task as COMPLETED.`,
          errorMetadata
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
        const errorMetadata = {
          taskPath: task.path,
          category: ErrorCategory.VALIDATION,
          expected: true,
          isWarning: true,
          reason,
        };

        throw TaskErrorFactory.createTaskDependencyError(
          'StatusValidator.validateStatusTransition',
          `Cannot unblock task: ${reason || 'Dependencies are blocking'}`,
          errorMetadata
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
  /**
   * Detects dependency cycles in task graph
   */
  private async detectCycles(
    task: Task,
    getTaskByPath: (path: string) => Promise<Task | null>,
    visited: Set<string> = new Set(),
    path: Set<string> = new Set()
  ): Promise<string[]> {
    if (path.has(task.path)) {
      return Array.from(path);
    }

    if (visited.has(task.path)) {
      return [];
    }

    visited.add(task.path);
    path.add(task.path);

    if (Array.isArray(task.dependencies)) {
      for (const depPath of task.dependencies) {
        const depTask = await getTaskByPath(depPath);
        if (depTask) {
          const cycle = await this.detectCycles(depTask, getTaskByPath, visited, path);
          if (cycle.length > 0) {
            return cycle;
          }
        }
      }
    }

    path.delete(task.path);
    return [];
  }

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

    // Check for dependency cycles first
    const cycle = await this.detectCycles(task, getTaskByPath);
    if (cycle.length > 0) {
      return {
        isBlocked: true,
        reason: `Dependency cycle detected: ${cycle.join(' -> ')}`,
        blockingDeps: [
          {
            path: cycle[0],
            status: TaskStatus.BLOCKED,
            details: 'Part of dependency cycle',
          },
        ],
      };
    }

    const blockingDeps: Array<{ path: string; status: TaskStatus; details?: string }> = [];
    const depCache = new Map<string, Task>();

    // Check direct and transitive dependencies
    const checkDep = async (depPath: string, depth: number = 0): Promise<boolean> => {
      if (depth > 10) {
        // Prevent infinite recursion
        return false;
      }

      const depTask = depCache.get(depPath) || (await getTaskByPath(depPath));
      if (!depTask) {
        blockingDeps.push({
          path: depPath,
          status: TaskStatus.PENDING,
          details: 'Dependency not found',
        });
        return true;
      }

      depCache.set(depPath, depTask);

      // Check status of this dependency
      if (depTask.status !== TaskStatus.COMPLETED) {
        blockingDeps.push({
          path: depPath,
          status: depTask.status,
          details: this.getDependencyBlockReason(depTask),
        });
        return true;
      }

      // Recursively check this dependency's dependencies
      if (Array.isArray(depTask.dependencies)) {
        for (const transitiveDepPath of depTask.dependencies) {
          if (await checkDep(transitiveDepPath, depth + 1)) {
            return true;
          }
        }
      }

      return false;
    };

    // Check all dependencies
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

      // All dependencies must be completed before starting
      if (depTask.status !== TaskStatus.COMPLETED) {
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
        return 'In progress';
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
