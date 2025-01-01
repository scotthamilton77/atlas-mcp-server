import { Logger } from '../../logging/index.js';
import { formatTimestamp } from '../../utils/date-formatter.js';
import { TaskStorage } from '../../types/storage.js';
import { TaskType } from '../../types/task-types.js';
import { TaskStatus } from '../../types/task-core.js';
import { Task, TaskMetadata, CreateTaskInput, UpdateTaskInput } from '../../types/task.js';
import { bulkOperationsSchema } from './schemas/bulk-operations-schema.js';
import { createTaskSchema, updateTaskSchema } from './schemas/task-schemas.js';
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
        await this.monitorPerformance<CreateTaskInput>('schema-validation', () => {
          const parsed = createTaskSchema.parse(input);
          return parsed as CreateTaskInput;
        });

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

      // Create task object
      const { result: task, duration: taskCreationTime } = await this.monitorPerformance<Task>(
        'task-creation',
        () => {
          const now = Date.now();
          const defaultMetadata: TaskMetadata = {
            status: TaskStatus.PENDING,
            statusUpdatedAt: now,
            tags: [],
            technicalRequirements: {
              language: undefined,
              framework: undefined,
              dependencies: [],
              environment: undefined,
              performance: {
                memory: undefined,
                cpu: undefined,
                storage: undefined,
              },
              requirements: [],
            },
            progress: {
              percentage: 0,
              milestones: [],
              lastUpdated: now,
              estimatedCompletion: undefined,
            },
            resources: {
              toolsUsed: [],
              resourcesAccessed: [],
              contextUsed: [],
            },
            blockInfo: undefined,
            versionControl: undefined,
            deliverables: [],
            customFields: {},
          };

          const newTask: Task = {
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
            metadata: {
              ...defaultMetadata,
              ...validatedInput.metadata,
            },
            statusMetadata: validatedInput.statusMetadata || {},
            planningNotes: validatedInput.planningNotes || [],
            progressNotes: validatedInput.progressNotes || [],
            completionNotes: validatedInput.completionNotes || [],
            troubleshootingNotes: validatedInput.troubleshootingNotes || [],
            reasoning: validatedInput.reasoning,
          };

          return newTask;
        }
      );

      result.details!.performance!.validationTime += taskCreationTime;

      // Hierarchy validation using the validator
      if (validatedInput.parentPath) {
        const { duration: hierarchyTime } = await this.monitorPerformance<HierarchyValidationMode>(
          'hierarchy-validation',
          async () => {
            const validationResult = await this.validators.validateHierarchy(
              validatedInput.parentPath!,
              this.storage.getTask.bind(this.storage),
              hierarchyMode
            );

            if (!validationResult.valid && hierarchyMode === HierarchyValidationMode.STRICT) {
              result.success = false;
              result.errors.push(validationResult.error || 'Hierarchy validation failed');
            }

            result.details!.hierarchy = {
              missingParents: validationResult.missingParents,
              depthExceeded: false, // Set by performance monitoring
            };

            return hierarchyMode;
          }
        );

        result.details!.performance!.validationTime += hierarchyTime;
      }

      // Dependency validation using the validator
      const { duration: dependencyTime } = await this.monitorPerformance(
        'dependency-validation',
        async () => {
          const validationResult = await this.validators.validateDependencyConstraints(
            task,
            validatedInput.dependencies || [],
            this.storage.getTask.bind(this.storage),
            dependencyMode
          );

          if (!validationResult.valid && dependencyMode === DependencyValidationMode.STRICT) {
            result.success = false;
            result.errors.push(validationResult.error || 'Dependency validation failed');
          }

          return validationResult;
        }
      );

      result.details!.performance!.validationTime += dependencyTime;

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
   * Validate status transition using the status validator
   */
  async validateStatusTransition(
    task: Task,
    newStatus: TaskStatus,
    getTaskByPath: (path: string) => Promise<Task | null>
  ): Promise<{ status: TaskStatus; autoTransition?: boolean }> {
    return await this.validators.statusValidator.validateStatusTransition(
      task,
      newStatus,
      getTaskByPath
    );
  }

  /**
   * Get status validation result using the status validator
   */
  async getStatusValidationResult(
    task: Task,
    newStatus: TaskStatus,
    getTaskByPath: (path: string) => Promise<Task | null>
  ): Promise<{ status: TaskStatus; autoTransition?: boolean }> {
    return await this.validators.statusValidator.validateStatusTransition(
      task,
      newStatus,
      getTaskByPath
    );
  }

  /**
   * Validate parent-child status constraints using the status validator
   */
  async validateParentChildStatus(
    task: Task,
    newStatus: TaskStatus,
    siblings: Task[],
    getTaskByPath: (path: string) => Promise<Task | null>
  ): Promise<{ parentUpdate?: { path: string; status: TaskStatus } }> {
    return await this.validators.statusValidator.validateParentChildStatus(
      task,
      newStatus,
      siblings,
      getTaskByPath
    );
  }

  /**
   * Sort tasks by dependency order using the dependency validator
   */
  async sortTasksByDependencies(
    tasks: Array<{ path: string; dependencies: string[] }>
  ): Promise<string[]> {
    return await this.validators.sortTasksByDependencies(tasks);
  }

  /**
   * Validate task update
   */
  async validateUpdate(
    path: string,
    updates: UpdateTaskInput,
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
      // Get existing task
      const existingTask = await this.storage.getTask(path);
      if (!existingTask) {
        result.success = false;
        result.errors.push(`Task not found at path: ${path}`);
        return result;
      }

      // Schema validation with performance monitoring
      const { result: validatedUpdates, duration: schemaValidationTime } =
        await this.monitorPerformance<UpdateTaskInput>('schema-validation', () => {
          const parsed = updateTaskSchema.parse(updates);
          return parsed as UpdateTaskInput;
        });

      result.details!.performance!.validationTime += schemaValidationTime;

      // Security validation for metadata
      if (this.options.validateSecurity && validatedUpdates.metadata) {
        const securityIssues = this.validateMetadataSecurity(validatedUpdates.metadata);
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

      // Hierarchy validation if parent path is being updated
      if (validatedUpdates.parentPath) {
        const { duration: hierarchyTime } = await this.monitorPerformance(
          'hierarchy-validation',
          async () => {
            const validationResult = await this.validators.validateHierarchy(
              validatedUpdates.parentPath!,
              this.storage.getTask.bind(this.storage),
              hierarchyMode
            );

            if (!validationResult.valid && hierarchyMode === HierarchyValidationMode.STRICT) {
              result.success = false;
              result.errors.push(validationResult.error || 'Hierarchy validation failed');
            }

            result.details!.hierarchy = {
              missingParents: validationResult.missingParents,
              depthExceeded: false,
            };

            return validationResult;
          }
        );

        result.details!.performance!.validationTime += hierarchyTime;
      }

      // Dependency validation if dependencies are being updated
      if (validatedUpdates.dependencies) {
        const { duration: dependencyTime } = await this.monitorPerformance(
          'dependency-validation',
          async () => {
            const validationResult = await this.validators.validateDependencyConstraints(
              existingTask,
              validatedUpdates.dependencies!,
              this.storage.getTask.bind(this.storage),
              dependencyMode
            );

            if (!validationResult.valid && dependencyMode === DependencyValidationMode.STRICT) {
              result.success = false;
              result.errors.push(validationResult.error || 'Dependency validation failed');
            }

            return validationResult;
          }
        );

        result.details!.performance!.validationTime += dependencyTime;
      }

      // Status transition validation if status is being updated
      if (validatedUpdates.status) {
        const { duration: statusTime } = await this.monitorPerformance(
          'status-validation',
          async () => {
            const validationResult = await this.validateStatusTransition(
              existingTask,
              validatedUpdates.status!,
              this.storage.getTask.bind(this.storage)
            );

            if (!validationResult.status) {
              result.success = false;
              result.errors.push('Invalid status transition');
            }

            return validationResult;
          }
        );

        result.details!.performance!.validationTime += statusTime;
      }

      // Calculate complexity score
      result.details!.performance!.complexityScore = this.calculateComplexityScore({
        hierarchyDepth: result.details!.hierarchy?.depthExceeded
          ? this.options.maxHierarchyDepth
          : 0,
        dependencyCount: validatedUpdates.dependencies?.length || 0,
        metadataSize: validatedUpdates.metadata
          ? JSON.stringify(validatedUpdates.metadata).length
          : 0,
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
}
