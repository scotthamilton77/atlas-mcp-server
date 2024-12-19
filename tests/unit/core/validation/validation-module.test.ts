import { ValidationContext, createMockValidationRule } from '../../../../src/core/validation/types.js';
import { ValidationModule } from '../../../../src/core/validation/validation-module.js';
import {
  createMockContext,
  createTestValidationSuccess,
  createTestValidationError
} from '../../../helpers/validation.js';

describe('ValidationModule', () => {
  let module: ValidationModule;
  let context: ValidationContext;

  beforeEach(() => {
    module = new ValidationModule();
    context = createMockContext();
  });

  describe('validate', () => {
    it('should validate successfully with no rules', async () => {
      const result = await module.validate(context);
      expect(result).toEqual(createTestValidationSuccess());
    });

    it('should validate successfully with passing rules', async () => {
      module.registerRule(
        createMockValidationRule('test-rule', async () => createTestValidationSuccess())
      );

      const result = await module.validate(context);
      expect(result).toEqual(createTestValidationSuccess());
    });

    it('should fail validation with failing rules', async () => {
      const error = createTestValidationError('Rule failed');
      module.registerRule(
        createMockValidationRule('test-rule', async () => error)
      );

      const result = await module.validate(context);
      expect(result).toEqual(error);
    });

    it('should handle multiple validation rules', async () => {
      module.registerRule(
        createMockValidationRule('rule-1', async () => createTestValidationSuccess())
      );

      module.registerRule(
        createMockValidationRule('rule-2', async () => createTestValidationError('Rule 2 failed'))
      );

      module.registerRule(
        createMockValidationRule('rule-3', async () => createTestValidationSuccess())
      );

      const result = await module.validate(context);
      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Rule 2 failed');
    });

    it('should handle validation dependencies', async () => {
      module.registerRule(
        createMockValidationRule('dependent-rule', async () => createTestValidationSuccess(), ['base-rule'])
      );

      module.registerRule(
        createMockValidationRule('base-rule', async () => createTestValidationSuccess())
      );

      const result = await module.validate(context);
      expect(result.success).toBe(true);
    });

    it('should handle circular dependencies', async () => {
      module.registerRule(
        createMockValidationRule('rule-a', async () => createTestValidationSuccess(), ['rule-b'])
      );

      module.registerRule(
        createMockValidationRule('rule-b', async () => createTestValidationSuccess(), ['rule-a'])
      );

      const result = await module.validate(context);
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('CIRCULAR_DEPENDENCY');
    });

    it('should handle missing dependencies', async () => {
      module.registerRule(
        createMockValidationRule('dependent-rule', async () => createTestValidationSuccess(), ['missing-rule'])
      );

      const result = await module.validate(context);
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('MISSING_DEPENDENCY');
    });

    it('should handle validation errors', async () => {
      const error = new Error('Validation failed');
      module.registerRule(
        createMockValidationRule('error-rule', async () => { throw error; })
      );

      const result = await module.validate(context);
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
      expect(result.error?.message).toBe('Validation failed');
    });
  });

  describe('registerRule', () => {
    it('should register rules successfully', () => {
      const rule = createMockValidationRule('test-rule', async () => createTestValidationSuccess());

      module.registerRule(rule);
      expect(module.hasRule('test-rule')).toBe(true);
    });

    it('should handle duplicate rule names', () => {
      const rule1 = createMockValidationRule('test-rule', async () => createTestValidationSuccess());
      const rule2 = createMockValidationRule('test-rule', async () => createTestValidationSuccess());

      module.registerRule(rule1);
      expect(() => module.registerRule(rule2)).toThrow('Rule already exists');
    });
  });
});
