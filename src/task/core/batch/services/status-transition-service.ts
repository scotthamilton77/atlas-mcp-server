import { Task, TaskStatus } from '../../../../types/task.js';
import { Logger } from '../../../../logging/index.js';
import { DependencyValidationService, ValidationMode } from './dependency-validation-service.js';

export interface StatusTransitionResult {
  allowed: boolean;
  newStatus: TaskStatus;
  autoTransition?: boolean;
  error?: string;
  warnings?: string[];
  details?: {
    reason?: string;
    blockingDependencies?: Array<{
      path: string;
      status: TaskStatus;
      reason?: string;
    }>;
    statusConflicts?: Array<{
      path: string;
      currentStatus: TaskStatus;
      requiredStatus: TaskStatus;
    }>;
    propagation?: Array<{
      path: string;
      fromStatus: TaskStatus;
      toStatus: TaskStatus;
      reason: string;
    }>;
  };
}

export class StatusTransitionService {
  private readonly logger: Logger;
  private readonly dependencyValidator: DependencyValidationService;

  constructor(
    private readonly getTask: (path: string) => Promise<Task | null>,
    private readonly getAllTasks: () => Promise<Task[]>
  ) {
    this.logger = Logger.getInstance().child({ component: 'StatusTransitionService' });
    this.dependencyValidator = new DependencyValidationService(getTask, getAllTasks, {
      validateStatus: true,
      mode: ValidationMode.STRICT,
    });
  }

  /**
   * Validate and process a status transition with detailed feedback
   */
  async validateTransition(task: Task, newStatus: TaskStatus): Promise<StatusTransitionResult> {
    try {
      // Basic state machine validation
      const basicValidation = this.validateBasicTransition(task.status, newStatus);
      if (!basicValidation.allowed) {
        return basicValidation;
      }

      // Handle specific transitions
      switch (newStatus) {
        case TaskStatus.IN_PROGRESS:
          return await this.validateInProgressTransition(task);

        case TaskStatus.COMPLETED:
          return await this.validateCompletionTransition(task);

        case TaskStatus.BLOCKED:
          return await this.validateBlockedTransition(task);

        case TaskStatus.CANCELLED:
          return await this.validateCancellationTransition(task);

        default:
          return {
            allowed: true,
            newStatus,
            warnings: ['Status transition allowed but may have unhandled side effects'],
          };
      }
    } catch (error) {
      this.logger.error('Status transition validation failed', {
        error,
        task: task.path,
        fromStatus: task.status,
        toStatus: newStatus,
      });

      return {
        allowed: false,
        newStatus: task.status,
        error: error instanceof Error ? error.message : 'Status transition validation failed',
      };
    }
  }

  /**
   * Validate basic state machine transitions
   */
  private validateBasicTransition(
    currentStatus: TaskStatus,
    newStatus: TaskStatus
  ): StatusTransitionResult {
    // Define allowed transitions
    const allowedTransitions: Record<TaskStatus, TaskStatus[]> = {
      [TaskStatus.PENDING]: [TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED, TaskStatus.CANCELLED],
      [TaskStatus.IN_PROGRESS]: [TaskStatus.COMPLETED, TaskStatus.BLOCKED, TaskStatus.CANCELLED],
      [TaskStatus.COMPLETED]: [], // No transitions allowed from COMPLETED
      [TaskStatus.BLOCKED]: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS],
      [TaskStatus.CANCELLED]: [TaskStatus.PENDING], // Allow retry from CANCELLED
    };

    if (!allowedTransitions[currentStatus].includes(newStatus)) {
      return {
        allowed: false,
        newStatus: currentStatus,
        error: `Invalid transition from ${currentStatus} to ${newStatus}`,
        details: {
          reason: 'State machine violation',
          statusConflicts: [
            {
              path: 'self',
              currentStatus,
              requiredStatus: newStatus,
            },
          ],
        },
      };
    }

    return {
      allowed: true,
      newStatus,
    };
  }

  /**
   * Validate transition to IN_PROGRESS
   */
  private async validateInProgressTransition(task: Task): Promise<StatusTransitionResult> {
    // Validate dependencies are ready
    const validation = await this.dependencyValidator.validateDependencies(
      task,
      task.dependencies,
      ValidationMode.STRICT
    );

    if (!validation.valid) {
      // If dependencies are blocking, suggest BLOCKED status
      if (validation.errors.some(e => e.type === 'status')) {
        return {
          allowed: true,
          newStatus: TaskStatus.BLOCKED,
          autoTransition: true,
          warnings: ['Task automatically blocked due to dependency status'],
          details: {
            reason: 'Dependencies not ready',
            blockingDependencies: validation.details?.statusConflicts?.map(conflict => ({
              path: conflict.path,
              status: conflict.currentStatus,
              reason: `Requires status: ${conflict.requiredStatus}`,
            })),
          },
        };
      }

      return {
        allowed: false,
        newStatus: task.status,
        error: 'Dependencies not satisfied',
        details: {
          reason: 'Dependency validation failed',
          blockingDependencies: validation.errors.map(error => ({
            path: error.path,
            status: TaskStatus.PENDING,
            reason: error.message,
          })),
        },
      };
    }

    return {
      allowed: true,
      newStatus: TaskStatus.IN_PROGRESS,
    };
  }

  /**
   * Validate transition to COMPLETED
   */
  private async validateCompletionTransition(task: Task): Promise<StatusTransitionResult> {
    // All dependencies must be COMPLETED
    const incompleteDeps: Array<{ path: string; status: TaskStatus; reason?: string }> = [];

    for (const depPath of task.dependencies) {
      const depTask = await this.getTask(depPath);
      if (!depTask || depTask.status !== TaskStatus.COMPLETED) {
        incompleteDeps.push({
          path: depPath,
          status: depTask?.status || TaskStatus.PENDING,
          reason: !depTask ? 'Dependency not found' : `Status is ${depTask.status}`,
        });
      }
    }

    if (incompleteDeps.length > 0) {
      return {
        allowed: false,
        newStatus: task.status,
        error: 'Cannot complete task with incomplete dependencies',
        details: {
          reason: 'Dependencies not completed',
          blockingDependencies: incompleteDeps,
        },
      };
    }

    // Check for propagation effects
    const propagationEffects = await this.calculatePropagationEffects(task, TaskStatus.COMPLETED);

    return {
      allowed: true,
      newStatus: TaskStatus.COMPLETED,
      warnings:
        propagationEffects.length > 0 ? ['Status change will affect other tasks'] : undefined,
      details: {
        propagation: propagationEffects,
      },
    };
  }

  /**
   * Validate transition to BLOCKED
   */
  private async validateBlockedTransition(task: Task): Promise<StatusTransitionResult> {
    // Get detailed blocking information
    const validation = await this.dependencyValidator.validateDependencies(
      task,
      task.dependencies,
      ValidationMode.STRICT
    );

    return {
      allowed: true,
      newStatus: TaskStatus.BLOCKED,
      details: {
        reason: 'Dependencies blocking progress',
        blockingDependencies: validation.errors.map(error => ({
          path: error.path,
          status: TaskStatus.PENDING,
          reason: error.message,
        })),
      },
    };
  }

  /**
   * Validate transition to CANCELLED
   */
  private async validateCancellationTransition(task: Task): Promise<StatusTransitionResult> {
    // Calculate effects on dependent tasks
    const propagationEffects = await this.calculatePropagationEffects(task, TaskStatus.CANCELLED);

    return {
      allowed: true,
      newStatus: TaskStatus.CANCELLED,
      warnings:
        propagationEffects.length > 0 ? ['Cancellation will affect dependent tasks'] : undefined,
      details: {
        propagation: propagationEffects,
      },
    };
  }

  /**
   * Calculate status propagation effects
   */
  private async calculatePropagationEffects(
    task: Task,
    newStatus: TaskStatus
  ): Promise<
    Array<{
      path: string;
      fromStatus: TaskStatus;
      toStatus: TaskStatus;
      reason: string;
    }>
  > {
    const effects: Array<{
      path: string;
      fromStatus: TaskStatus;
      toStatus: TaskStatus;
      reason: string;
    }> = [];

    // Get all tasks
    const allTasks = await this.getAllTasks();

    // Find tasks that depend on this one
    const dependentTasks = allTasks.filter(
      t =>
        t.dependencies.includes(task.path) &&
        t.status !== TaskStatus.COMPLETED &&
        t.status !== TaskStatus.CANCELLED
    );

    for (const depTask of dependentTasks) {
      if (newStatus === TaskStatus.CANCELLED) {
        effects.push({
          path: depTask.path,
          fromStatus: depTask.status,
          toStatus: TaskStatus.CANCELLED,
          reason: 'Dependency cancelled',
        });
      } else if (newStatus === TaskStatus.COMPLETED) {
        // Check if this completion unblocks the dependent task
        const validation = await this.dependencyValidator.validateDependencies(
          depTask,
          depTask.dependencies,
          ValidationMode.STRICT
        );

        if (validation.valid && depTask.status === TaskStatus.BLOCKED) {
          effects.push({
            path: depTask.path,
            fromStatus: TaskStatus.BLOCKED,
            toStatus: TaskStatus.PENDING,
            reason: 'Dependencies satisfied',
          });
        }
      }
    }

    return effects;
  }
}
