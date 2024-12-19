import { describe, it, expect, beforeEach } from '@jest/globals';
import { RuntimeValidator } from '../../../../../src/core/validation/runtime/validator.js';
import { TaskStatus, TaskType } from '../../../../../src/shared/types/task.js';
import { ValidationContext } from '../../../../../src/core/validation/types.js';
import { createMockTask, createMockContext } from '../../../../helpers/validation.js';

describe('RuntimeValidator', () => {
  let validator: RuntimeValidator;
  let mockContext: ValidationContext;

  beforeEach(() => {
    validator = new RuntimeValidator();
    mockContext = createMockContext();
  });

  describe('initialization', () => {
    it('should initialize with default checkers', () => {
      expect(validator.getChecker('integrity')).toBeDefined();
      expect(validator.getChecker('consistency')).toBeDefined();
    });
  });

  describe('checker management', () => {
    it('should add and remove checkers', () => {
      const customChecker = {
        id: 'custom',
        name: 'Custom Checker',
        description: 'Custom validation',
        check: async () => ({ success: true })
      };

      validator.addChecker(customChecker);
      expect(validator.getChecker('custom')).toBeDefined();

      validator.removeChecker('custom');
      expect(validator.getChecker('custom')).toBeUndefined();
    });

    it('should prevent duplicate checker IDs', () => {
      const customChecker = {
        id: 'integrity', // Duplicate ID
        name: 'Custom Checker',
        description: 'Custom validation',
        check: async () => ({ success: true })
      };

      expect(() => validator.addChecker(customChecker)).toThrow();
    });
  });

  describe('validation', () => {
    it('should pass validation for valid task', async () => {
      const task = createMockTask();
      const result = await validator.validate(mockContext, task);
      expect(result.success).toBe(true);
    });

    it('should fail integrity validation for invalid task', async () => {
      const invalidTask = {
        // Missing required fields
        id: '123',
        name: 'Test'
      };

      const result = await validator.validate(mockContext, invalidTask);
      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('integrity');
    });

    it('should fail consistency validation for invalid parent reference', async () => {
      const task = createMockTask({
        parentId: 'non-existent'
      });

      mockContext.taskStore = {
        getTask: async () => null // Parent doesn't exist
      };

      const result = await validator.validate(mockContext, task);
      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('consistency');
    });

    it('should validate complex task relationships', async () => {
      const parent = createMockTask({
        id: 'parent-1',
        type: TaskType.GROUP,
        status: TaskStatus.IN_PROGRESS
      });

      const dependency = createMockTask({
        id: 'dep-1',
        status: TaskStatus.COMPLETED
      });

      const task = createMockTask({
        parentId: 'parent-1',
        dependencies: ['dep-1']
      });

      const taskStore = new Map([
        ['parent-1', parent],
        ['dep-1', dependency]
      ]);

      mockContext.taskStore = {
        getTask: async (id) => taskStore.get(id) || null
      };

      const result = await validator.validate(mockContext, task);
      expect(result.success).toBe(true);
    });

    it('should handle validation options', async () => {
      const task = createMockTask();
      const options = { strict: true };

      const result = await validator.validate(mockContext, task, options);
      expect(result.success).toBe(true);
    });

    it('should validate in correct order', async () => {
      const validationOrder: string[] = [];
      const customValidator = new RuntimeValidator();

      customValidator.addChecker({
        id: 'first',
        name: 'First Checker',
        description: 'First check',
        check: async () => {
          validationOrder.push('first');
          return { success: true };
        }
      });

      customValidator.addChecker({
        id: 'second',
        name: 'Second Checker',
        description: 'Second check',
        check: async () => {
          validationOrder.push('second');
          return { success: true };
        }
      });

      await customValidator.validate(mockContext, createMockTask());
      expect(validationOrder).toEqual(['first', 'second']);
    });

    it('should stop validation on first failure', async () => {
      const validationOrder: string[] = [];
      const customValidator = new RuntimeValidator();

      customValidator.addChecker({
        id: 'first',
        name: 'First Checker',
        description: 'First check',
        check: async () => {
          validationOrder.push('first');
          return {
            success: false,
            error: {
              code: 'RUNTIME_ERROR',
              message: 'First check failed',
              type: 'integrity'
            }
          };
        }
      });

      customValidator.addChecker({
        id: 'second',
        name: 'Second Checker',
        description: 'Second check',
        check: async () => {
          validationOrder.push('second');
          return { success: true };
        }
      });

      const result = await customValidator.validate(mockContext, createMockTask());
      expect(result.success).toBe(false);
      expect(validationOrder).toEqual(['first']); // Second check should not run
    });
  });
});
