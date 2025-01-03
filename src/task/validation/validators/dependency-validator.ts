import { ErrorCodes, createError } from '../../../errors/index.js';
import { Task, TaskStatus } from '../../../types/task.js';
import { Logger } from '../../../logging/index.js';

/**
 * Enhanced validation modes for dependency checking
 */
export enum DependencyValidationMode {
  STRICT = 'strict', // All dependencies must exist and be valid
  DEFERRED = 'deferred', // Allow missing dependencies for bulk operations
  LENIENT = 'lenient', // Allow missing dependencies but validate existing ones
}

/**
 * Detailed validation result with enhanced error reporting
 */
export interface DependencyValidationResult {
  valid: boolean;
  missingDependencies: string[];
  error?: string;
  details?: {
    cyclicDependencies?: string[];
    invalidDependencies?: Array<{
      path: string;
      reason: string;
    }>;
    statusConflicts?: Array<{
      dependency: string;
      status: TaskStatus;
      conflict: string;
    }>;
    performanceImpact?: {
      depth: number;
      breadth: number;
      warning?: string;
    };
  };
}

/**
 * Configuration options for dependency validation
 */
export interface DependencyValidationOptions {
  maxDepth?: number; // Maximum depth of dependency chain
  maxDependencies?: number; // Maximum number of direct dependencies
  allowSelfDependency?: boolean; // Whether a task can depend on itself
  validateStatus?: boolean; // Whether to validate dependency status
  performanceCheck?: boolean; // Whether to check performance implications
}

// Default validation options
const DEFAULT_OPTIONS: DependencyValidationOptions = {
  maxDepth: 10,
  maxDependencies: 50,
  allowSelfDependency: false,
  validateStatus: true,
  performanceCheck: true,
};

/**
 * Enhanced validator for task dependencies with comprehensive validation
 */
export class DependencyValidator {
  private readonly logger: Logger;
  private readonly options: DependencyValidationOptions;

  constructor(options: Partial<DependencyValidationOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.logger = Logger.getInstance().child({ component: 'DependencyValidator' });
  }
  /**
   * Enhanced dependency validation with comprehensive checks
   */
  async validateDependencies(
    dependencies: string[],
    getTaskByPath: (path: string) => Promise<Task | null>,
    mode: DependencyValidationMode = DependencyValidationMode.STRICT,
    currentTask?: Task
  ): Promise<DependencyValidationResult> {
    try {
      // Input validation
      if (!Array.isArray(dependencies)) {
        return {
          valid: false,
          missingDependencies: [],
          error: 'Dependencies must be an array',
        };
      }

      // Validate dependency count
      if (dependencies.length > this.options.maxDependencies!) {
        return {
          valid: false,
          missingDependencies: [],
          error: `Maximum number of dependencies (${this.options.maxDependencies}) exceeded`,
        };
      }

      const result: DependencyValidationResult = {
        valid: true,
        missingDependencies: [],
        details: {
          invalidDependencies: [],
          statusConflicts: [],
          performanceImpact: {
            depth: 0,
            breadth: dependencies.length,
          },
        },
      };

      // Check each dependency
      const validationPromises = dependencies.map(async depPath => {
        // Self-dependency check
        if (currentTask && depPath === currentTask.path && !this.options.allowSelfDependency) {
          result.details!.invalidDependencies!.push({
            path: depPath,
            reason: 'Self-dependency not allowed',
          });
          return;
        }

        const depTask = await getTaskByPath(depPath);

        if (!depTask) {
          result.missingDependencies.push(depPath);
          return;
        }

        // Status validation
        if (this.options.validateStatus) {
          if (depTask.status === TaskStatus.CANCELLED) {
            result.details!.statusConflicts!.push({
              dependency: depPath,
              status: depTask.status,
              conflict: 'Cannot depend on cancelled task',
            });
          }
        }

        // Recursive depth check for nested dependencies
        if (depTask.dependencies.length > 0) {
          const nestedResult = await this.validateDependencies(
            depTask.dependencies,
            getTaskByPath,
            mode,
            depTask
          );

          result.details!.performanceImpact!.depth = Math.max(
            result.details!.performanceImpact!.depth + 1,
            nestedResult.details?.performanceImpact?.depth || 0
          );
        }
      });

      await Promise.all(validationPromises);

      // Performance impact warning
      if (this.options.performanceCheck) {
        const { depth, breadth } = result.details!.performanceImpact!;
        if (depth > 5 || breadth > 20) {
          result.details!.performanceImpact!.warning =
            'Complex dependency structure may impact performance';
        }
      }

      // Determine validity based on mode
      if (mode === DependencyValidationMode.STRICT) {
        result.valid =
          result.missingDependencies.length === 0 &&
          result.details!.invalidDependencies!.length === 0 &&
          result.details!.statusConflicts!.length === 0;
      } else if (mode === DependencyValidationMode.LENIENT) {
        result.valid = result.details!.invalidDependencies!.length === 0;
      }

      if (!result.valid) {
        result.error = this.formatValidationError(result);
      }

      return result;
    } catch (error) {
      this.logger.error('Dependency validation failed', { error });
      throw error;
    }
  }

  /**
   * Format validation errors into a clear message
   */
  private formatValidationError(result: DependencyValidationResult): string {
    const errors: string[] = [];

    if (result.missingDependencies.length > 0) {
      errors.push(`Missing dependencies: ${result.missingDependencies.join(', ')}`);
    }

    if (result.details?.invalidDependencies?.length) {
      errors.push(
        'Invalid dependencies: ' +
          result.details.invalidDependencies.map(d => `${d.path} (${d.reason})`).join(', ')
      );
    }

    if (result.details?.statusConflicts?.length) {
      errors.push(
        'Status conflicts: ' +
          result.details.statusConflicts.map(c => `${c.dependency} (${c.conflict})`).join(', ')
      );
    }

    return errors.join('; ');
  }

  /**
   * Detects circular dependencies in task relationships
   */
  async detectDependencyCycle(
    task: Task,
    dependencies: string[],
    getTaskByPath: (path: string) => Promise<Task | null>
  ): Promise<boolean> {
    if (!Array.isArray(dependencies)) {
      throw createError(
        ErrorCodes.INVALID_INPUT,
        'Dependencies must be an array',
        'DependencyValidator.detectDependencyCycle'
      );
    }

    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = async (currentPath: string): Promise<boolean> => {
      if (recursionStack.has(currentPath)) return true;
      if (visited.has(currentPath)) return false;

      visited.add(currentPath);
      recursionStack.add(currentPath);

      const current = await getTaskByPath(currentPath);
      if (!current) return false;

      // Check both existing and new dependencies
      const allDeps = currentPath === task.path ? dependencies : current.dependencies;
      if (!Array.isArray(allDeps)) {
        throw createError(
          ErrorCodes.INVALID_INPUT,
          'Task dependencies must be an array',
          'DependencyValidator.detectDependencyCycle'
        );
      }

      for (const depPath of allDeps) {
        if (await dfs(depPath)) return true;
      }

      recursionStack.delete(currentPath);
      return false;
    };

    const hasCycle = await dfs(task.path);
    if (hasCycle) {
      throw createError(
        ErrorCodes.TASK_CYCLE,
        'Circular dependencies detected in task relationships',
        'DependencyValidator.detectDependencyCycle',
        undefined,
        {
          taskPath: task.path,
          dependencies,
        }
      );
    }

    return hasCycle;
  }

  /**
   * Validates dependency constraints between tasks
   */
  async validateDependencyConstraints(
    task: Task,
    dependencies: string[],
    getTaskByPath: (path: string) => Promise<Task | null>,
    mode: DependencyValidationMode = DependencyValidationMode.STRICT
  ): Promise<DependencyValidationResult> {
    if (!Array.isArray(dependencies)) {
      return {
        valid: false,
        missingDependencies: [],
        error: 'Dependencies must be an array',
      };
    }

    // Validate dependencies exist
    const validationResult = await this.validateDependencies(dependencies, getTaskByPath, mode);
    if (!validationResult.valid && mode === DependencyValidationMode.STRICT) {
      return validationResult;
    }

    // Only check for cycles in STRICT mode
    if (mode === DependencyValidationMode.STRICT) {
      try {
        // Check for cycles only with existing dependencies
        const existingDeps = dependencies.filter(async dep => (await getTaskByPath(dep)) !== null);
        await this.detectDependencyCycle(task, existingDeps, getTaskByPath);
      } catch (error) {
        return {
          valid: false,
          missingDependencies: validationResult.missingDependencies,
          error: error instanceof Error ? error.message : 'Dependency cycle detected',
        };
      }

      // Check dependency status constraints
      if (task.status === TaskStatus.IN_PROGRESS) {
        for (const depPath of dependencies) {
          const depTask = await getTaskByPath(depPath);
          if (depTask && depTask.status !== TaskStatus.COMPLETED) {
            validationResult.valid = false;
            validationResult.details!.statusConflicts!.push({
              dependency: depPath,
              status: depTask.status,
              conflict: 'Cannot start task before dependencies are completed',
            });
          }
        }

        if (!validationResult.valid) {
          validationResult.error = this.formatValidationError(validationResult);
          return validationResult;
        }
      }
    }

    return validationResult;
  }

  /**
   * Sort tasks by dependency order for bulk operations
   */
  async sortTasksByDependencies(
    tasks: { path: string; dependencies: string[] }[]
  ): Promise<string[]> {
    const graph = new Map<string, Set<string>>();
    const inDegree = new Map<string, number>();

    // Build dependency graph
    for (const task of tasks) {
      if (!graph.has(task.path)) {
        graph.set(task.path, new Set());
        inDegree.set(task.path, 0);
      }

      for (const dep of task.dependencies) {
        if (!graph.has(dep)) {
          graph.set(dep, new Set());
          inDegree.set(dep, 0);
        }
        graph.get(dep)?.add(task.path);
        inDegree.set(task.path, (inDegree.get(task.path) || 0) + 1);
      }
    }

    // Find tasks with no dependencies
    const queue: string[] = [];
    for (const [path, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(path);
      }
    }

    // Process queue
    const result: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);

      // Update degrees for dependent tasks
      const dependents = graph.get(current) || new Set();
      for (const dependent of dependents) {
        inDegree.set(dependent, (inDegree.get(dependent) || 0) - 1);
        if (inDegree.get(dependent) === 0) {
          queue.push(dependent);
        }
      }
    }

    // Check for cycles
    if (result.length !== tasks.length) {
      throw createError(
        ErrorCodes.TASK_CYCLE,
        'Circular dependencies detected in bulk task creation',
        'DependencyValidator.sortTasksByDependencies'
      );
    }

    return result;
  }
}
