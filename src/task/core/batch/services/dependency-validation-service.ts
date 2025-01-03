import { Task, TaskStatus } from '../../../../types/task.js';
import { Logger } from '../../../../logging/index.js';
import { TaskErrorFactory } from '../../../../errors/task-error.js';

export enum ValidationMode {
  STRICT = 'strict', // All dependencies must exist and be valid
  LENIENT = 'lenient', // Allow missing dependencies but validate existing ones
  DEFERRED = 'deferred', // Delay validation for bulk operations
}

export interface ValidationOptions {
  mode?: ValidationMode;
  maxDepth?: number;
  maxDependencies?: number;
  validateStatus?: boolean;
  suggestSimilar?: boolean;
}

export interface DependencyValidationResult {
  valid: boolean;
  errors: Array<{
    type: 'missing' | 'invalid' | 'circular' | 'status';
    message: string;
    path: string;
    suggestion?: string;
  }>;
  warnings: string[];
  details?: {
    missingDependencies?: string[];
    invalidDependencies?: string[];
    statusConflicts?: Array<{
      path: string;
      currentStatus: TaskStatus;
      requiredStatus: TaskStatus;
    }>;
    suggestions?: Array<{
      path: string;
      similarPaths: string[];
      similarity: number;
    }>;
  };
}

export class DependencyValidationService {
  private readonly logger: Logger;

  constructor(
    private readonly getTask: (path: string) => Promise<Task | null>,
    private readonly getAllTasks: () => Promise<Task[]>,
    private readonly options: ValidationOptions = {}
  ) {
    this.logger = Logger.getInstance().child({ component: 'DependencyValidationService' });
  }

  /**
   * Validate task dependencies with detailed feedback
   */
  async validateDependencies(
    task: Task,
    dependencies: string[],
    mode: ValidationMode = ValidationMode.STRICT
  ): Promise<DependencyValidationResult> {
    const result: DependencyValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      details: {
        missingDependencies: [],
        invalidDependencies: [],
        statusConflicts: [],
        suggestions: [],
      },
    };

    try {
      // Check dependency count
      if (dependencies.length > (this.options.maxDependencies || 50)) {
        result.errors.push({
          type: 'invalid',
          message: `Maximum number of dependencies (${this.options.maxDependencies}) exceeded`,
          path: task.path,
        });
        result.valid = false;
        return result;
      }

      // Check each dependency
      for (const depPath of dependencies) {
        const depTask = await this.getTask(depPath);

        if (!depTask) {
          result.details!.missingDependencies!.push(depPath);

          // Generate suggestions for missing dependencies if enabled
          if (this.options.suggestSimilar) {
            const suggestions = await this.findSimilarTasks(depPath);
            if (suggestions.length > 0) {
              result.details!.suggestions!.push({
                path: depPath,
                similarPaths: suggestions.map(s => s.path),
                similarity: suggestions[0].similarity,
              });
            }
          }

          if (mode === ValidationMode.STRICT) {
            result.errors.push({
              type: 'missing',
              message: `Dependency not found: ${depPath}`,
              path: depPath,
              suggestion: result.details!.suggestions!.find(s => s.path === depPath)
                ? `Did you mean: ${result.details!.suggestions!.find(s => s.path === depPath)!.similarPaths.join(', ')}?`
                : undefined,
            });
          } else {
            result.warnings.push(`Missing dependency will need to be created: ${depPath}`);
          }
          continue;
        }

        // Validate status if enabled
        if (this.options.validateStatus) {
          if (depTask.status === TaskStatus.CANCELLED) {
            result.details!.statusConflicts!.push({
              path: depPath,
              currentStatus: depTask.status,
              requiredStatus: TaskStatus.COMPLETED,
            });

            if (mode === ValidationMode.STRICT) {
              result.errors.push({
                type: 'status',
                message: `Cannot depend on cancelled task: ${depPath}`,
                path: depPath,
              });
            }
          }
        }

        // Check for circular dependencies
        const hasCycle = await this.detectCycle(task, depPath, new Set());
        if (hasCycle) {
          result.errors.push({
            type: 'circular',
            message: `Circular dependency detected: ${task.path} -> ${depPath}`,
            path: depPath,
          });
        }
      }

      // Update validity based on mode
      if (mode === ValidationMode.STRICT) {
        result.valid = result.errors.length === 0;
      } else if (mode === ValidationMode.LENIENT) {
        result.valid = result.errors.filter(e => e.type !== 'missing').length === 0;
      } else {
        result.valid = true; // DEFERRED mode always passes validation
      }

      return result;
    } catch (error) {
      this.logger.error('Dependency validation failed', { error, task: task.path });
      throw TaskErrorFactory.createTaskValidationError(
        'DependencyValidationService.validateDependencies',
        error instanceof Error ? error.message : 'Validation failed',
        { task: task.path }
      );
    }
  }

  /**
   * Find similar task paths using Levenshtein distance
   */
  private async findSimilarTasks(
    path: string
  ): Promise<Array<{ path: string; similarity: number }>> {
    const allTasks = await this.getAllTasks();
    return allTasks
      .map(t => ({
        path: t.path,
        similarity: this.calculateSimilarity(path, t.path),
      }))
      .filter(result => result.similarity > 0.7) // Only return highly similar paths
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3); // Return top 3 suggestions
  }

  /**
   * Calculate similarity between two paths
   */
  private calculateSimilarity(path1: string, path2: string): number {
    const maxLength = Math.max(path1.length, path2.length);
    if (maxLength === 0) return 1.0;

    const distance = this.levenshteinDistance(path1, path2);
    return 1 - distance / maxLength;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array(m + 1)
      .fill(0)
      .map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] =
            1 +
            Math.min(
              dp[i - 1][j], // deletion
              dp[i][j - 1], // insertion
              dp[i - 1][j - 1] // substitution
            );
        }
      }
    }

    return dp[m][n];
  }

  /**
   * Detect circular dependencies
   */
  private async detectCycle(
    task: Task,
    targetPath: string,
    visited: Set<string>
  ): Promise<boolean> {
    if (task.path === targetPath) return true;
    if (visited.has(task.path)) return false;

    visited.add(task.path);

    for (const depPath of task.dependencies) {
      const depTask = await this.getTask(depPath);
      if (depTask && (await this.detectCycle(depTask, targetPath, visited))) {
        return true;
      }
    }

    visited.delete(task.path);
    return false;
  }
}
