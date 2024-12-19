import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  ValidationResult,
  ValidationContext,
  ValidationOptions
} from '../../../../src/core/validation/types.js';
import {
  ValidationService,
  createValidationService
} from '../../../../src/core/validation/validation-service.js';
import {
  ValidationRule,
  ValidationError
} from '../../../../src/core/validation/rules/types.js';
import { TaskStatus } from '../../../../src/shared/types/task.js';

interface TestContext extends ValidationContext {
  value: any;
  results: Map<string, ValidationResult>;
  shared: Map<string, unknown>;
}

describe('Validation System', () => {
  let service: ValidationService;

  beforeEach(() => {
    service = createValidationService({
      strictMode: true,
      enableCache: true
    });
  });

  afterEach(async () => {
    await service.dispose();
  });

  describe('Rule Management', () => {
    it('registers and executes validation rules', async () => {
      const rule: ValidationRule<TestContext> = {
        name: 'test-rule',
        validate: async (context: TestContext) => {
          if (!context.value) {
            return {
              valid: false,
              errors: [new ValidationError('Value is required')]
            };
          }
          return { valid: true };
        }
      };

      service.registerRule(rule);

      const validResult = await service.validate({ value: 'test' });
      expect(validResult.valid).toBe(true);

      const invalidResult = await service.validate({ value: null });
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors[0].message).toBe('Value is required');
    });

    it('supports rule dependencies', async () => {
      const baseRule: ValidationRule<TestContext> = {
        name: 'base-rule',
        validate: async () => ({ valid: true })
      };

      const dependentRule: ValidationRule<TestContext> = {
        name: 'dependent-rule',
        dependencies: ['base-rule'],
        validate: async (context: TestContext) => {
          if (!context.results.has('base-rule')) {
            return {
              valid: false,
              errors: [new ValidationError('Base rule must run first')]
            };
          }
          return { valid: true };
        }
      };

      service.registerRule(baseRule);
      service.registerRule(dependentRule);

      const result = await service.validate({ value: 'test' });
      expect(result.valid).toBe(true);
      expect(result.results.has('base-rule')).toBe(true);
      expect(result.results.has('dependent-rule')).toBe(true);
    });
  });

  describe('Status Validation', () => {
    it('validates status transitions', async () => {
      const statusRule: ValidationRule<TestContext> = {
        name: 'status-transition',
        validate: async (context: TestContext) => {
          const { oldStatus, newStatus } = context.value;

          // Can't go directly from PENDING to COMPLETED
          if (oldStatus === TaskStatus.PENDING && newStatus === TaskStatus.COMPLETED) {
            return {
              valid: false,
              errors: [new ValidationError('Invalid status transition')]
            };
          }

          return { valid: true };
        }
      };

      service.registerRule(statusRule);

      const validTransition = await service.validate({
        value: {
          oldStatus: TaskStatus.PENDING,
          newStatus: TaskStatus.IN_PROGRESS
        }
      });
      expect(validTransition.valid).toBe(true);

      const invalidTransition = await service.validate({
        value: {
          oldStatus: TaskStatus.PENDING,
          newStatus: TaskStatus.COMPLETED
        }
      });
      expect(invalidTransition.valid).toBe(false);
    });
  });

  describe('Dependency Validation', () => {
    it('validates task dependencies', async () => {
      const dependencyRule: ValidationRule<TestContext> = {
        name: 'dependency-check',
        validate: async (context: TestContext) => {
          const { task, dependencies } = context.value;

          // Check if all dependencies are completed
          const incompleteDeps = dependencies.filter(dep => dep.status !== TaskStatus.COMPLETED);
          if (incompleteDeps.length > 0) {
            return {
              valid: false,
              errors: [new ValidationError('All dependencies must be completed')]
            };
          }

          return { valid: true };
        }
      };

      service.registerRule(dependencyRule);

      const validDeps = await service.validate({
        value: {
          task: { id: 'task1', status: TaskStatus.PENDING },
          dependencies: [
            { id: 'dep1', status: TaskStatus.COMPLETED },
            { id: 'dep2', status: TaskStatus.COMPLETED }
          ]
        }
      });
      expect(validDeps.valid).toBe(true);

      const invalidDeps = await service.validate({
        value: {
          task: { id: 'task1', status: TaskStatus.PENDING },
          dependencies: [
            { id: 'dep1', status: TaskStatus.COMPLETED },
            { id: 'dep2', status: TaskStatus.IN_PROGRESS }
          ]
        }
      });
      expect(invalidDeps.valid).toBe(false);
    });
  });

  describe('Validation Cache', () => {
    it('caches validation results', async () => {
      const validateSpy = jest.fn(async () => ({ valid: true }));
      const rule: ValidationRule<TestContext> = {
        name: 'cached-rule',
        validate: validateSpy
      };

      service.registerRule(rule);

      // First validation should call validate
      await service.validate({ value: 'test', cacheKey: 'test-key' });
      expect(validateSpy).toHaveBeenCalledTimes(1);

      // Second validation with same cache key should use cached result
      await service.validate({ value: 'test', cacheKey: 'test-key' });
      expect(validateSpy).toHaveBeenCalledTimes(1);

      // Different cache key should call validate again
      await service.validate({ value: 'test', cacheKey: 'other-key' });
      expect(validateSpy).toHaveBeenCalledTimes(2);
    });

    it('invalidates cache entries', async () => {
      const validateSpy = jest.fn(async () => ({ valid: true }));
      const rule: ValidationRule<TestContext> = {
        name: 'invalidated-rule',
        validate: validateSpy
      };

      service.registerRule(rule);

      // Cache initial validation
      await service.validate({ value: 'test', cacheKey: 'test-key' });
      expect(validateSpy).toHaveBeenCalledTimes(1);

      // Invalidate cache
      service.invalidateCache('test-key');

      // Should validate again after invalidation
      await service.validate({ value: 'test', cacheKey: 'test-key' });
      expect(validateSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling', () => {
    it('handles rule execution errors', async () => {
      const errorRule: ValidationRule<TestContext> = {
        name: 'error-rule',
        validate: async () => {
          throw new Error('Rule execution failed');
        }
      };

      service.registerRule(errorRule);

      const result = await service.validate({ value: 'test' });
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('Rule execution failed');
    });

    it('handles invalid rule configurations', () => {
      const invalidRule = {
        name: 'invalid-rule'
        // Missing validate function
      };

      expect(() => {
        service.registerRule(invalidRule as ValidationRule<TestContext>);
      }).toThrow('Invalid rule configuration');
    });
  });

  describe('Validation Context', () => {
    it('provides access to shared context', async () => {
      const contextRule: ValidationRule<TestContext> = {
        name: 'context-rule',
        validate: async (context: TestContext) => {
          expect(context.shared.get('testKey')).toBe('testValue');
          return { valid: true };
        }
      };

      service.registerRule(contextRule);

      const result = await service.validate({
        value: 'test',
        shared: new Map([['testKey', 'testValue']])
      });
      expect(result.valid).toBe(true);
    });

    it('maintains isolation between validations', async () => {
      const sharedMap1 = new Map([['key', 'value1']]);
      const sharedMap2 = new Map([['key', 'value2']]);

      const rule: ValidationRule<TestContext> = {
        name: 'isolation-rule',
        validate: async (context: TestContext) => ({
          valid: true,
          metadata: { value: context.shared.get('key') }
        })
      };

      service.registerRule(rule);

      const result1 = await service.validate({
        value: 'test',
        shared: sharedMap1
      });

      const result2 = await service.validate({
        value: 'test',
        shared: sharedMap2
      });

      expect(result1.results.get('isolation-rule')?.metadata?.value).toBe('value1');
      expect(result2.results.get('isolation-rule')?.metadata?.value).toBe('value2');
    });
  });
});
