import { ValidationContext, ValidationResult, ValidationRule, ValidationError, ValidationErrorCodes, createValidationError } from './types.js';

export class ValidationModule {
  private rules = new Map<string, ValidationRule>();

  registerRule(rule: ValidationRule): void {
    if (this.rules.has(rule.name)) {
      throw new Error('Rule already exists');
    }
    this.rules.set(rule.name, rule);
  }

  hasRule(name: string): boolean {
    return this.rules.has(name);
  }

  private async validateRule(rule: ValidationRule, context: ValidationContext): Promise<ValidationResult<ValidationError>> {
    try {
      return await rule.validate(context.value, context);
    } catch (error) {
      const validationError = createValidationError<ValidationError>(
        ValidationErrorCodes.RUNTIME_ERROR,
        error instanceof Error ? error.message : 'Validation failed',
        [],
        context.value,
        {
          error: error instanceof Error ? error.message : 'Validation failed',
          rule: rule.name
        }
      );
      return {
        valid: false,
        success: false,
        errors: [validationError],
        error: validationError,
        metadata: {
          duration: 0,
          timestamp: new Date().toISOString(),
          validator: 'ValidationModule'
        }
      };
    }
  }

  private async validateDependencies(rule: ValidationRule, visited: Set<string>): Promise<ValidationResult<ValidationError>> {
    if (!rule.dependencies?.length) {
      return {
        valid: true,
        success: true,
        errors: [],
        metadata: {
          duration: 0,
          timestamp: new Date().toISOString(),
          validator: 'ValidationModule'
        }
      };
    }

    if (visited.has(rule.name)) {
      const validationError = createValidationError<ValidationError>(
        ValidationErrorCodes.DEPENDENCY_ERROR,
        `Circular dependency detected for rule: ${rule.name}`,
        [],
        rule.name,
        {
          error: 'Circular dependency detected',
          rule: rule.name
        }
      );
      return {
        valid: false,
        success: false,
        errors: [validationError],
        error: validationError,
        metadata: {
          duration: 0,
          timestamp: new Date().toISOString(),
          validator: 'ValidationModule'
        }
      };
    }

    visited.add(rule.name);

    for (const depName of rule.dependencies) {
      const dep = this.rules.get(depName);
      if (!dep) {
          const validationError = createValidationError<ValidationError>(
            ValidationErrorCodes.DEPENDENCY_ERROR,
            `Missing dependency: ${depName} for rule: ${rule.name}`,
            [],
            depName,
            {
              error: 'Missing dependency',
              rule: rule.name,
              dependency: depName
            }
          );
          return {
            valid: false,
            success: false,
            errors: [validationError],
            error: validationError,
            metadata: {
              duration: 0,
              timestamp: new Date().toISOString(),
              validator: 'ValidationModule'
            }
          };
      }

      const result = await this.validateDependencies(dep, new Set(visited));
      if (!result.success) {
        return result;
      }
    }

    return {
      valid: true,
      success: true,
      errors: [],
      metadata: {
        duration: 0,
        timestamp: new Date().toISOString(),
        validator: 'ValidationModule'
      }
    };
  }

  async validate(context: ValidationContext): Promise<ValidationResult<ValidationError>> {
    if (this.rules.size === 0) {
      return {
        valid: true,
        success: true,
        errors: [],
        metadata: {
          duration: 0,
          timestamp: new Date().toISOString(),
          validator: 'ValidationModule'
        }
      };
    }

    for (const rule of this.rules.values()) {
      const depResult = await this.validateDependencies(rule, new Set());
      if (!depResult.success) {
        return depResult;
      }

      const result = await this.validateRule(rule, context);
      if (!result.success) {
        return result;
      }
    }

    return {
      valid: true,
      success: true,
      errors: [],
      metadata: {
        duration: 0,
        timestamp: new Date().toISOString(),
        validator: 'ValidationModule'
      }
    };
  }
}
