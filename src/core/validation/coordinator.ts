import { BusinessRule, ValidationResult, ValidationError, TaskValidationError } from './types.js';
import { TaskValidationContext, TaskValidationOptions } from './rules/types.js';
import { DependencyRule } from './rules/dependency-rule.js';
import { StatusRule } from './rules/status-rule.js';
import { RelationshipRule } from './rules/relationship-rule.js';
import { Task } from './schemas/task-types.js';

/**
 * Unified validation coordinator that combines all validation rules
 */
export class ValidationCoordinator {
  private rules: BusinessRule<Task, ValidationError>[];

  constructor() {
    this.rules = [
      new DependencyRule(),
      new StatusRule(),
      new RelationshipRule()
    ];
  }

  /**
   * Validate a task against all rules
   */
  async validateTask(
    context: TaskValidationContext,
    task: Task,
    options?: TaskValidationOptions
  ): Promise<ValidationResult<TaskValidationError>> {
    const errors: TaskValidationError[] = [];

    // Run all validation rules
    for (const rule of this.rules) {
      const result = await rule.validate(task, context);
      if (!result.success && result.error) {
        errors.push({
          type: result.error.type,
          message: result.error.message,
          path: result.error.path,
          value: { ...task, id: task.id } as { [key: string]: unknown; id?: string },
          metadata: {
            error: result.error.message,
            rule: rule.getName(),
            constraint: result.error.type
          }
        });
      }
    }

    return {
      valid: errors.length === 0,
      success: errors.length === 0,
      errors,
      error: errors[0],
      metadata: {
        duration: 0,
        timestamp: new Date().toISOString(),
        validator: 'ValidationCoordinator'
      }
    };
  }

  /**
   * Validate multiple tasks in bulk
   */
  async validateTasks(
    context: TaskValidationContext,
    tasks: Task[],
    options?: TaskValidationOptions
  ): Promise<ValidationResult<TaskValidationError>[]> {
    return Promise.all(
      tasks.map(task => this.validateTask(context, task, options))
    );
  }

  /**
   * Add a custom validation rule
   */
  addRule(rule: BusinessRule<Task, ValidationError>): void {
    this.rules.push(rule);
  }

  /**
   * Remove a validation rule by ID
   */
  removeRule(ruleId: string): void {
    this.rules = this.rules.filter(rule => rule.getName() !== ruleId);
  }

  /**
   * Get all registered rules
   */
  getRules(): BusinessRule<Task, ValidationError>[] {
    return [...this.rules];
  }

  /**
   * Clear all validation rules
   */
  clearRules(): void {
    this.rules = [];
  }

  /**
   * Reset to default rules
   */
  resetRules(): void {
    this.rules = [
      new DependencyRule(),
      new StatusRule(),
      new RelationshipRule()
    ];
  }

  /**
   * Check if a specific rule is registered
   */
  hasRule(ruleId: string): boolean {
    return this.rules.some(rule => rule.getName() === ruleId);
  }

  /**
   * Get a specific rule by ID
   */
  getRule(ruleId: string): BusinessRule<Task, ValidationError> | undefined {
    return this.rules.find(rule => rule.getName() === ruleId);
  }

  /**
   * Validate task with specific rules only
   */
  async validateTaskWithRules(
    context: TaskValidationContext,
    task: Task,
    ruleIds: string[],
    options?: TaskValidationOptions
  ): Promise<ValidationResult<TaskValidationError>> {
    const errors: TaskValidationError[] = [];
    const rulesToRun = this.rules.filter(rule => ruleIds.includes(rule.getName()));

    for (const rule of rulesToRun) {
      const result = await rule.validate(task, context);
      if (!result.success && result.error) {
        errors.push({
          type: result.error.type,
          message: result.error.message,
          path: result.error.path,
          value: { ...task, id: task.id } as { [key: string]: unknown; id?: string },
          metadata: {
            error: result.error.message,
            rule: rule.getName(),
            constraint: result.error.type
          }
        });
      }
    }

    return {
      valid: errors.length === 0,
      success: errors.length === 0,
      errors,
      error: errors[0],
      metadata: {
        duration: 0,
        timestamp: new Date().toISOString(),
        validator: 'ValidationCoordinator'
      }
    };
  }

  /**
   * Get validation errors grouped by rule
   */
  groupErrorsByRule(result: ValidationResult<TaskValidationError>): Record<string, string[]> {
    return result.errors.reduce((grouped: Record<string, string[]>, error: TaskValidationError) => {
      const ruleName = error.metadata.rule as string;
      if (!grouped[ruleName]) {
        grouped[ruleName] = [];
      }
      grouped[ruleName].push(error.message);
      return grouped;
    }, {} as Record<string, string[]>);
  }

  /**
   * Format validation errors into a human-readable string
   */
  formatErrors(result: ValidationResult<TaskValidationError>): string {
    if (result.success) {
      return 'Validation passed successfully';
    }

    const groupedErrors = this.groupErrorsByRule(result);
    return Object.entries(groupedErrors)
      .map(([rule, messages]) => {
        return `${rule}:\n${messages.map(msg => `  - ${msg}`).join('\n')}`;
      })
      .join('\n\n');
  }
}
