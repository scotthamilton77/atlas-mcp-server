import { Logger } from '../../logging/index.js';
import { formatTimestamp } from '../../utils/date-formatter.js';
import { TaskStorage } from '../../types/storage.js';
import { TaskType, TaskStatus, Task } from '../../types/task.js';
import { bulkOperationsSchema } from './schemas/bulk-operations-schema.js';
import {
  createTaskSchema,
  updateTaskSchema,
  CreateTaskInput,
  UpdateTaskInput,
} from './schemas/index.js';
import { TaskValidators } from './validators/index.js';
import { DependencyValidationMode } from './validators/dependency-validator.js';
import { HierarchyValidationMode } from './validators/hierarchy-validator.js';

export interface ValidationResult {
  success: boolean;
  errors: string[];
  warnings?: string[];
  details?: {
    metadata?: {
      invalidFields?: string[];
      missingRequired?: string[];
      securityIssues?: string[];
    };
    dependencies?: {
      missing?: string[];
      invalid?: string[];
      cycles?: string[];
      performance?: {
        depth: number;
        breadth: number;
        warning?: string;
      };
    };
    hierarchy?: {
      missingParents?: string[];
      depthExceeded?: boolean;
      invalidRelationships?: string[];
    };
    security?: {
      issues: string[];
      severity: 'low' | 'medium' | 'high';
    }[];
    performance?: {
      validationTime: number;
      complexityScore: number;
      recommendations?: string[];
    };
  };
}

/**
 * Configuration options for task validation
 */
export interface TaskValidationOptions {
  maxHierarchyDepth: number;
  maxDependencies: number;
  maxMetadataSize: number;
  validateSecurity: boolean;
  performanceMonitoring: boolean;
  strictMetadataValidation: boolean;
}

// Default validation options
const DEFAULT_VALIDATION_OPTIONS: TaskValidationOptions = {
  maxHierarchyDepth: 10,
  maxDependencies: 50,
  maxMetadataSize: 100 * 1024, // 100KB
  validateSecurity: true,
  performanceMonitoring: true,
  strictMetadataValidation: true,
};

/**
 * Enhanced task validator with comprehensive validation capabilities
 */
export class TaskValidator {
  private readonly logger: Logger;
  private readonly validators: TaskValidators;
  private readonly options: TaskValidationOptions;

  constructor(
    private readonly storage: TaskStorage,
    options: Partial<TaskValidationOptions> = {}
  ) {
    this.options = { ...DEFAULT_VALIDATION_OPTIONS, ...options };
    this.logger = Logger.getInstance().child({
      component: 'TaskValidator',
      options: this.options,
    });
    this.validators = new TaskValidators();
  }

  /**
   * Validate and sanitize metadata for security
   */
  private validateMetadataSecurity(metadata: Record<string, unknown>): string[] {
    const issues: string[] = [];

    // Check for potentially dangerous fields
    const dangerousFields = ['script', 'eval', 'function', 'constructor'];
    Object.keys(metadata).forEach(key => {
      if (dangerousFields.some(field => key.toLowerCase().includes(field))) {
        issues.push(`Potentially unsafe metadata field: ${key}`);
      }

      // Check for large values
      const value = metadata[key];
      if (typeof value === 'string' && value.length > 10000) {
        issues.push(`Metadata field ${key} exceeds maximum length`);
      }
    });

    // Check total size
    const size = JSON.stringify(metadata).length;
    if (size > this.options.maxMetadataSize) {
      issues.push(
        `Metadata size (${size} bytes) exceeds maximum (${this.options.maxMetadataSize} bytes)`
      );
    }

    return issues;
  }

  /**
   * Monitor and log performance metrics
   */
  private async monitorPerformance<T>(
    operation: string,
    task: () => T | Promise<T>
  ): Promise<{ result: T; duration: number }> {
    const start = process.hrtime.bigint();
    const result = await task();
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1_000_000; // Convert to milliseconds

    this.logger.debug('Performance monitoring', {
      operation,
      durationMs: duration,
      timestamp: new Date().toISOString(),
    });

    return { result, duration };
  }

  /**
   * Get the create task schema
   */
  getCreateTaskSchema(): any {
    return createTaskSchema;
  }

  /**
   * Get the update task schema
   */
  getUpdateTaskSchema(): any {
    return updateTaskSchema;
  }

  /**
   * Get the bulk operations schema
   */
  getBulkOperationsSchema(): any {
    return bulkOperationsSchema;
  }

  /**
   * Enhanced task creation validation
   */
  async validateCreate(
    input: CreateTaskInput,
    dependencyMode: DependencyValidationMode = DependencyValidationMode.STRICT,
    hierarchyMode: HierarchyValidationMode = HierarchyValidationMode.STRICT
  ): Promise<ValidationResult> {
    const result: ValidationResult = {
      success: true,
      errors: [],
      warnings: [],
      details: {
        metadata: {},
        dependencies: {},
        hierarchy: {},
        security: [],
        performance: {
          validationTime: 0,
          complexityScore: 0,
        },
      },
    };

    const startTime = Date.now();

    try {
      // Schema validation with performance monitoring
      const { result: validatedInput, duration: schemaValidationTime } =
        await this.monitorPerformance<CreateTaskInput>(
          'schema-validation',
          () => createTaskSchema.parse(input) as CreateTaskInput
        );

      result.details!.performance!.validationTime += schemaValidationTime;

      // Check for existing task
      const existingTask = await this.storage.getTask(validatedInput.path);
      if (existingTask) {
        result.success = false;
        result.errors.push(`Task already exists at path: ${validatedInput.path}`);
        return result;
      }

      // Security validation for metadata
      if (this.options.validateSecurity && validatedInput.metadata) {
        const securityIssues = this.validateMetadataSecurity(validatedInput.metadata);
        if (securityIssues.length > 0) {
          result.details!.security!.push({
            issues: securityIssues,
            severity: securityIssues.some(i => i.includes('unsafe')) ? 'high' : 'medium',
          });
          if (this.options.strictMetadataValidation) {
            result.success = false;
            result.errors.push('Metadata security validation failed');
            return result;
          }
        }
      }

      // Create and validate task object
      const { result: task, duration: taskCreationTime } = await this.monitorPerformance<Task>(
        'task-creation',
        () => {
          const now = Date.now();
          return {
            id: `task_${now}_${Math.random().toString(36).substr(2, 9)}`,
            path: validatedInput.path,
            name: validatedInput.name,
            type: validatedInput.type || TaskType.TASK,
            status: TaskStatus.PENDING,
            created: formatTimestamp(now),
            updated: formatTimestamp(now),
            version: 1,
            projectPath: validatedInput.path.split('/')[0],
            description: validatedInput.description,
            parentPath: validatedInput.parentPath,
            dependencies: validatedInput.dependencies || [],
            metadata: validatedInput.metadata || {},
            statusMetadata: {},
            planningNotes: validatedInput.planningNotes || [],
            progressNotes: validatedInput.progressNotes || [],
            completionNotes: validatedInput.completionNotes || [],
            troubleshootingNotes: validatedInput.troubleshootingNotes || [],
          };
        }
      );

      result.details!.performance!.validationTime += taskCreationTime;

      // Hierarchy validation
      if (validatedInput.parentPath) {
        type HierarchyValidationResult = {
          valid: boolean;
          error?: string;
          missingParents: string[];
          depth: number;
        };

        const { result: hierarchyResult, duration: hierarchyTime } =
          await this.monitorPerformance<HierarchyValidationResult>(
            'hierarchy-validation',
            async () => {
              const baseResult = await this.validators.validateHierarchy(
                validatedInput.parentPath!,
                this.storage.getTask.bind(this.storage),
                hierarchyMode
              );
              return {
                valid: baseResult.valid,
                error: baseResult.error,
                missingParents: baseResult.missingParents || [],
                depth: (validatedInput.parentPath?.split('/').length || 0) + 1,
              } as HierarchyValidationResult;
            }
          );

        result.details!.performance!.validationTime += hierarchyTime;
        result.details!.hierarchy = {
          missingParents: hierarchyResult.missingParents,
          depthExceeded: hierarchyResult.depth > this.options.maxHierarchyDepth,
        };

        if (!hierarchyResult.valid && hierarchyMode === HierarchyValidationMode.STRICT) {
          result.success = false;
          result.errors.push(hierarchyResult.error || 'Hierarchy validation failed');
        }
      }

      // Dependency validation with enhanced monitoring
      type EnhancedDependencyResult = {
        valid: boolean;
        error?: string;
        missingDependencies: string[];
        details: {
          invalidDependencies: Array<{ path: string; reason: string }>;
          cyclicDependencies: string[];
          performanceImpact: {
            depth: number;
            breadth: number;
            warning?: string;
          };
        };
      };

      const { result: dependencyResult, duration: dependencyTime } =
        await this.monitorPerformance<EnhancedDependencyResult>(
          'dependency-validation',
          async () => {
            const baseResult = await this.validators.validateDependencyConstraints(
              task,
              validatedInput.dependencies || [],
              this.storage.getTask.bind(this.storage),
              dependencyMode
            );

            // Create enhanced result with required structure
            const enhancedResult: EnhancedDependencyResult = {
              valid: baseResult.valid,
              error: baseResult.error,
              missingDependencies: baseResult.missingDependencies || [],
              details: {
                invalidDependencies: [],
                cyclicDependencies: [],
                performanceImpact: {
                  depth: 0,
                  breadth: (validatedInput.dependencies || []).length,
                },
                ...(baseResult as any).details, // Type assertion since we're enhancing the base result
              },
            };

            return enhancedResult;
          }
        );

      result.details!.performance!.validationTime += dependencyTime;
      result.details!.dependencies = {
        missing: dependencyResult.missingDependencies,
        invalid: dependencyResult.details.invalidDependencies.map(d => d.path),
        cycles: dependencyResult.details.cyclicDependencies,
        performance: dependencyResult.details.performanceImpact,
      };

      if (!dependencyResult.valid && dependencyMode === DependencyValidationMode.STRICT) {
        result.success = false;
        result.errors.push(dependencyResult.error || 'Dependency validation failed');
      }

      // Calculate complexity score
      result.details!.performance!.complexityScore = this.calculateComplexityScore({
        hierarchyDepth: result.details!.hierarchy?.depthExceeded
          ? this.options.maxHierarchyDepth
          : 0,
        dependencyCount: validatedInput.dependencies?.length || 0,
        metadataSize: validatedInput.metadata ? JSON.stringify(validatedInput.metadata).length : 0,
        validationTime: result.details!.performance!.validationTime,
      });

      // Add performance recommendations if needed
      if (result.details!.performance!.complexityScore > 0.7) {
        result.details!.performance!.recommendations = [
          'Consider reducing dependency chain depth',
          'Optimize metadata size',
          'Review hierarchy structure',
        ];
      }

      // Final validation time
      result.details!.performance!.validationTime = Date.now() - startTime;

      return result;
    } catch (error) {
      this.logger.error('Task creation validation failed', {
        error,
        input,
        duration: Date.now() - startTime,
      });

      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown validation error'],
        details: {
          performance: {
            validationTime: Date.now() - startTime,
            complexityScore: 0,
          },
        },
      };
    }
  }

  /**
   * Calculate complexity score for performance monitoring
   */
  private calculateComplexityScore(metrics: {
    hierarchyDepth: number;
    dependencyCount: number;
    metadataSize: number;
    validationTime: number;
  }): number {
    const weights = {
      hierarchyDepth: 0.3,
      dependencyCount: 0.3,
      metadataSize: 0.2,
      validationTime: 0.2,
    };

    const scores = {
      hierarchyDepth: Math.min(metrics.hierarchyDepth / this.options.maxHierarchyDepth, 1),
      dependencyCount: Math.min(metrics.dependencyCount / this.options.maxDependencies, 1),
      metadataSize: Math.min(metrics.metadataSize / this.options.maxMetadataSize, 1),
      validationTime: Math.min(metrics.validationTime / 1000, 1), // Normalize to 1 second
    };

    return Object.entries(weights).reduce((score, [key, weight]) => {
      return score + scores[key as keyof typeof scores] * weight;
    }, 0);
  }

  /**
   * Enhanced task update validation with comprehensive checks
   */
  async validateUpdate(
    path: string,
    updates: UpdateTaskInput,
    mode: DependencyValidationMode = DependencyValidationMode.STRICT
  ): Promise<ValidationResult> {
    const result: ValidationResult = {
      success: true,
      errors: [],
      warnings: [],
      details: {
        metadata: {},
        dependencies: {},
        hierarchy: {},
        security: [],
        performance: {
          validationTime: 0,
          complexityScore: 0,
        },
      },
    };

    const startTime = Date.now();

    try {
      // Schema validation with performance monitoring
      const { result: validatedUpdates, duration: schemaValidationTime } =
        await this.monitorPerformance<UpdateTaskInput>(
          'schema-validation',
          () => updateTaskSchema.parse(updates) as UpdateTaskInput
        );

      result.details!.performance!.validationTime += schemaValidationTime;

      // Get and validate existing task
      const existingTask = await this.storage.getTask(path);
      if (!existingTask) {
        result.success = false;
        result.errors.push(`Task not found at path: ${path}`);
        return result;
      }

      // Security validation for metadata updates
      if (this.options.validateSecurity && validatedUpdates.metadata) {
        const mergedMetadata = {
          ...existingTask.metadata,
          ...validatedUpdates.metadata,
        };

        const securityIssues = this.validateMetadataSecurity(mergedMetadata);
        if (securityIssues.length > 0) {
          result.details!.security!.push({
            issues: securityIssues,
            severity: securityIssues.some(i => i.includes('unsafe')) ? 'high' : 'medium',
          });
          if (this.options.strictMetadataValidation) {
            result.success = false;
            result.errors.push('Metadata security validation failed');
            return result;
          }
        }
      }

      // Dependency validation if dependencies are being updated
      if (validatedUpdates.dependencies) {
        type EnhancedDependencyResult = {
          valid: boolean;
          error?: string;
          missingDependencies: string[];
          details: {
            invalidDependencies: Array<{ path: string; reason: string }>;
            cyclicDependencies: string[];
            performanceImpact: {
              depth: number;
              breadth: number;
              warning?: string;
            };
          };
        };

        const { result: dependencyResult, duration: dependencyTime } =
          await this.monitorPerformance<EnhancedDependencyResult>(
            'dependency-validation',
            async () => {
              const baseResult = await this.validators.validateDependencyConstraints(
                existingTask,
                validatedUpdates.dependencies!,
                this.storage.getTask.bind(this.storage),
                mode
              );

              return {
                valid: baseResult.valid,
                error: baseResult.error,
                missingDependencies: baseResult.missingDependencies || [],
                details: {
                  invalidDependencies: [],
                  cyclicDependencies: [],
                  performanceImpact: {
                    depth: 0,
                    breadth: validatedUpdates.dependencies!.length,
                  },
                  ...(baseResult as any).details,
                },
              };
            }
          );

        result.details!.performance!.validationTime += dependencyTime;
        result.details!.dependencies = {
          missing: dependencyResult.missingDependencies,
          invalid: dependencyResult.details.invalidDependencies.map(d => d.path),
          cycles: dependencyResult.details.cyclicDependencies,
          performance: dependencyResult.details.performanceImpact,
        };

        if (!dependencyResult.valid && mode === DependencyValidationMode.STRICT) {
          result.success = false;
          result.errors.push(dependencyResult.error || 'Dependency validation failed');
        }
      }

      // Calculate complexity score
      result.details!.performance!.complexityScore = this.calculateComplexityScore({
        hierarchyDepth: 0, // Updates don't change hierarchy
        dependencyCount: validatedUpdates.dependencies?.length || 0,
        metadataSize: validatedUpdates.metadata
          ? JSON.stringify({ ...existingTask.metadata, ...validatedUpdates.metadata }).length
          : 0,
        validationTime: result.details!.performance!.validationTime,
      });

      // Add performance recommendations if needed
      if (result.details!.performance!.complexityScore > 0.7) {
        result.details!.performance!.recommendations = [
          'Consider batching updates',
          'Optimize metadata size',
          'Review dependency structure',
        ];
      }

      // Final validation time
      result.details!.performance!.validationTime = Date.now() - startTime;

      return result;
    } catch (error) {
      this.logger.error('Task update validation failed', {
        error,
        path,
        updates,
        duration: Date.now() - startTime,
      });

      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown validation error'],
        details: {
          performance: {
            validationTime: Date.now() - startTime,
            complexityScore: 0,
          },
        },
      };
    }
  }

  /**
   * Validate status transition
   */
  async validateStatusTransition(
    task: Task,
    newStatus: TaskStatus,
    getTaskByPath: (path: string) => Promise<Task | null>
  ): Promise<{ status: TaskStatus; autoTransition?: boolean }> {
    const validTask = this.validators.ensureTaskArrays(task);
    return await this.validators.statusValidator.validateStatusTransition(
      validTask,
      newStatus,
      getTaskByPath
    );
  }

  /**
   * Get status validation result
   */
  async getStatusValidationResult(
    task: Task,
    newStatus: TaskStatus,
    getTaskByPath: (path: string) => Promise<Task | null>
  ): Promise<{ status: TaskStatus; autoTransition?: boolean }> {
    const validTask = this.validators.ensureTaskArrays(task);
    return await this.validators.statusValidator.validateStatusTransition(
      validTask,
      newStatus,
      getTaskByPath
    );
  }

  /**
   * Validate parent-child status constraints
   */
  async validateParentChildStatus(
    task: Task,
    newStatus: TaskStatus,
    siblings: Task[],
    getTaskByPath: (path: string) => Promise<Task | null>
  ): Promise<{ parentUpdate?: { path: string; status: TaskStatus } }> {
    const validTask = this.validators.ensureTaskArrays(task);
    return await this.validators.statusValidator.validateParentChildStatus(
      validTask,
      newStatus,
      siblings,
      getTaskByPath
    );
  }

  /**
   * Sort tasks by dependency order
   */
  async sortTasksByDependencies(
    tasks: Array<{ path: string; dependencies: string[] }>
  ): Promise<string[]> {
    return await this.validators.sortTasksByDependencies(tasks);
  }
}
