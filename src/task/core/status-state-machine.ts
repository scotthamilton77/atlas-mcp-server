import { TaskStatus } from '../../types/task.js';
import { TaskMetadata } from '../../types/task-metadata.js';
import { Logger } from '../../logging/index.js';

interface StateTransition {
  to: TaskStatus;
  conditions?: Array<(context: TransitionContext) => Promise<boolean>>;
  sideEffects?: Array<(context: TransitionContext) => Promise<void>>;
}

interface TransitionContext {
  taskPath: string;
  fromStatus: TaskStatus;
  toStatus: TaskStatus;
  metadata?: TaskMetadata & {
    _timestamps?: {
      completedAt?: string;
      blockedAt?: string;
      cancelledAt?: string;
      reopenedAt?: string;
      restartedAt?: string;
      unblockedAt?: string;
      statusUpdatedAt?: number;
    };
  };
  logger: Logger;
  getTaskByPath: (path: string) => Promise<{ status: TaskStatus } | null>;
}

/**
 * Manages task status transitions using a state machine pattern
 */
export class StatusStateMachine {
  private readonly logger: Logger;
  private readonly transitions: Map<TaskStatus, StateTransition[]>;

  constructor() {
    this.logger = Logger.getInstance().child({ component: 'StatusStateMachine' });
    this.transitions = this.initializeTransitions();
  }

  /**
   * Initialize the state machine transitions
   */
  private initializeTransitions(): Map<TaskStatus, StateTransition[]> {
    const transitions = new Map<TaskStatus, StateTransition[]>();

    // PENDING transitions
    transitions.set(TaskStatus.PENDING, [
      {
        to: TaskStatus.IN_PROGRESS,
        conditions: [() => Promise.resolve(true)], // Always allow starting work
      },
      {
        to: TaskStatus.BLOCKED,
        conditions: [this.hasDependencyIssues],
      },
      { to: TaskStatus.CANCELLED },
    ]);

    // IN_PROGRESS transitions
    transitions.set(TaskStatus.IN_PROGRESS, [
      {
        to: TaskStatus.COMPLETED,
        conditions: [this.canComplete],
        sideEffects: [this.updateCompletionMetadata],
      },
      {
        to: TaskStatus.BLOCKED,
        conditions: [this.hasDependencyIssues],
        sideEffects: [this.updateBlockedMetadata],
      },
      {
        to: TaskStatus.CANCELLED,
        sideEffects: [this.updateCancellationMetadata],
      },
    ]);

    // COMPLETED transitions
    transitions.set(TaskStatus.COMPLETED, [
      {
        to: TaskStatus.IN_PROGRESS,
        conditions: [this.canReopen],
        sideEffects: [this.updateReopenMetadata],
      },
    ]);

    // BLOCKED transitions
    transitions.set(TaskStatus.BLOCKED, [
      {
        to: TaskStatus.PENDING,
        conditions: [this.canUnblock],
        sideEffects: [this.updateUnblockedMetadata],
      },
      { to: TaskStatus.CANCELLED },
    ]);

    // CANCELLED transitions
    transitions.set(TaskStatus.CANCELLED, [
      {
        to: TaskStatus.PENDING,
        conditions: [this.canRestart],
        sideEffects: [this.updateRestartMetadata],
      },
    ]);

    return transitions;
  }

  /**
   * Validate and execute a status transition
   */
  async validateTransition(
    context: TransitionContext
  ): Promise<{ valid: boolean; reason?: string; expected?: boolean }> {
    const possibleTransitions = this.transitions.get(context.fromStatus) || [];
    const transition = possibleTransitions.find(t => t.to === context.toStatus);

    if (!transition) {
      const allowed = possibleTransitions.map(t => t.to).join(', ');
      return {
        valid: false,
        expected: true, // Invalid transition is an expected validation failure
        reason: `Invalid transition from ${context.fromStatus} to ${
          context.toStatus
        }. Allowed transitions: ${allowed || 'none'}`,
      };
    }

    // Check all conditions
    if (transition.conditions) {
      for (const condition of transition.conditions) {
        try {
          if (!(await condition(context))) {
            // Log validation failure as info since it's expected behavior
            this.logger.info('Transition validation failed', {
              taskPath: context.taskPath,
              fromStatus: context.fromStatus,
              toStatus: context.toStatus,
              condition: condition.name,
              metadata: context.metadata,
            });

            return {
              valid: false,
              expected: true, // Failed condition is an expected validation failure
              reason: `Transition condition failed: ${condition.name}`,
            };
          }
        } catch (error) {
          // Log unexpected errors as actual errors
          this.logger.error('Unexpected error in transition condition', {
            error,
            context,
            condition: condition.name,
          });
          return {
            valid: false,
            expected: false, // Unexpected error in condition
            reason:
              error instanceof Error ? error.message : 'Unknown error in transition condition',
          };
        }
      }
    }

    // Execute side effects
    if (transition.sideEffects) {
      for (const effect of transition.sideEffects) {
        try {
          await effect(context);
        } catch (error) {
          this.logger.error('Transition side effect error', {
            error,
            context,
            effect: effect.name,
          });
          // Continue with other side effects even if one fails
        }
      }
    }

    return { valid: true };
  }

  // Transition conditions
  private async hasDependencyIssues(context: TransitionContext): Promise<boolean> {
    // Check for blocking metadata
    if (context.metadata?.blockInfo?.blockReason) {
      context.logger.info('Task has blocking issues', {
        taskPath: context.taskPath,
        reason: context.metadata.blockInfo.blockReason,
      });
      return true;
    }
    return false;
  }

  private async canComplete(context: TransitionContext): Promise<boolean> {
    // Only check dependencies - metadata is fully flexible
    const dependencies = Array.isArray(context.metadata?.dependencies)
      ? context.metadata.dependencies
      : [];
    if (dependencies.length) {
      for (const depPath of dependencies) {
        const depTask = await context.getTaskByPath(depPath);
        if (!depTask || depTask.status !== TaskStatus.COMPLETED) {
          context.logger.warn('Cannot complete task with incomplete dependencies', {
            taskPath: context.taskPath,
            dependency: depPath,
            status: depTask?.status || 'NOT_FOUND',
          });
          return false;
        }
      }
    }
    return true;
  }

  private async canReopen(context: TransitionContext): Promise<boolean> {
    // Check if task was previously completed
    if (!context.metadata?._timestamps?.completedAt) {
      context.logger.warn('Cannot reopen task that was not completed', {
        taskPath: context.taskPath,
      });
      return false;
    }
    return true;
  }

  private async canUnblock(context: TransitionContext): Promise<boolean> {
    // Check if block reason is resolved
    if (context.metadata?.blockInfo?.blockReason && !context.metadata?.blockInfo?.resolution) {
      context.logger.warn('Cannot unblock task without resolution', {
        taskPath: context.taskPath,
        blockReason: context.metadata.blockInfo.blockReason,
      });
      return false;
    }
    return true;
  }

  private async canRestart(context: TransitionContext): Promise<boolean> {
    // Check if task was cancelled
    if (!context.metadata?._timestamps?.cancelledAt) {
      context.logger.warn('Cannot restart task that was not cancelled', {
        taskPath: context.taskPath,
      });
      return false;
    }
    return true;
  }

  // Side effects
  private async updateCompletionMetadata(context: TransitionContext): Promise<void> {
    if (!context.metadata) return;
    const timestamps = context.metadata._timestamps || {};
    timestamps.completedAt = new Date().toISOString();
    timestamps.statusUpdatedAt = Date.now();
    context.metadata._timestamps = timestamps;
  }

  private async updateBlockedMetadata(context: TransitionContext): Promise<void> {
    if (!context.metadata) return;
    const timestamps = context.metadata._timestamps || {};
    timestamps.blockedAt = new Date().toISOString();
    timestamps.statusUpdatedAt = Date.now();
    context.metadata._timestamps = timestamps;
  }

  private async updateCancellationMetadata(context: TransitionContext): Promise<void> {
    if (!context.metadata) return;
    const timestamps = context.metadata._timestamps || {};
    timestamps.cancelledAt = new Date().toISOString();
    timestamps.statusUpdatedAt = Date.now();
    context.metadata._timestamps = timestamps;
  }

  private async updateReopenMetadata(context: TransitionContext): Promise<void> {
    if (!context.metadata) return;
    const timestamps = context.metadata._timestamps || {};
    timestamps.reopenedAt = new Date().toISOString();
    timestamps.statusUpdatedAt = Date.now();
    context.metadata._timestamps = timestamps;
  }

  private async updateUnblockedMetadata(context: TransitionContext): Promise<void> {
    if (!context.metadata) return;
    const timestamps = context.metadata._timestamps || {};
    timestamps.unblockedAt = new Date().toISOString();
    delete timestamps.blockedAt;
    timestamps.statusUpdatedAt = Date.now();
    context.metadata._timestamps = timestamps;
  }

  private async updateRestartMetadata(context: TransitionContext): Promise<void> {
    if (!context.metadata) return;
    const timestamps = context.metadata._timestamps || {};
    timestamps.restartedAt = new Date().toISOString();
    timestamps.statusUpdatedAt = Date.now();
    context.metadata._timestamps = timestamps;
  }
}
