import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { BusinessRule, RuleValidationResult, ValidationOperation } from '../../../../src/core/validation/types.js';
import { ValidationCoordinator } from '../../../../src/core/validation/coordinator.js';
import { TaskType, TaskStatus, Task } from '../../../../src/shared/types/task.js';
import { createMockTask, createMockContext, TaskStore } from '../../../helpers/validation.js';

type GetTaskFn = (id: string) => Promise<Task | null>;

describe('ValidationCoordinator', () => {
  let coordinator: ValidationCoordinator;

  beforeEach(() => {
    coordinator = new ValidationCoordinator();
  });

  describe('initialization', () => {
    it('should initialize with default rules', () => {
      expect(coordinator.getRules()).toHaveLength(3); // dependency, status, relationship rules
    });

    it('should allow adding custom rules', () => {
      const customRule = {
        id: 'custom-rule',
        name: 'Custom Rule',
        description: 'Test custom rule',
        validate: async () => ({ success: true })
      };
      coordinator.addRule(customRule);
      expect(coordinator.getRules()).toHaveLength(4);
    });
  });

  describe('validation', () => {
    it('should validate task against all rules', async () => {
      const task = createMockTask();
      const context = createMockContext();
      const result = await coordinator.validateTask(context, task);
      expect(result.success).toBe(true);
    });

    it('should combine errors from multiple rules', async () => {
      const failingRule: BusinessRule = {
        id: 'failing-rule',
        name: 'Failing Rule',
        description: 'Always fails',
        validate: async (): Promise<RuleValidationResult> => ({
          success: false,
          error: {
            code: 'RULE_ERROR',
            message: 'Test failure',
            rule: 'failing-rule',
            constraint: 'test'
          }
        })
      };
      coordinator.addRule(failingRule);

      const task = createMockTask();
      const context = createMockContext();
      const result = await coordinator.validateTask(context, task);
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
    });

    it('should validate task hierarchy', async () => {
      const subtask = createMockTask({
        type: TaskType.TASK,
        status: TaskStatus.COMPLETED
      });
      const parentTask = createMockTask({
        type: TaskType.GROUP,
        status: TaskStatus.IN_PROGRESS,
        subtasks: [subtask]
      });

      const context = createMockContext();
      const result = await coordinator.validateTask(context, parentTask);
      expect(result.success).toBe(true);
    });

    it('should validate task dependencies', async () => {
      const dependencyTask = createMockTask({
        status: TaskStatus.COMPLETED
      });
      const task = createMockTask({
        dependencies: [dependencyTask.id]
      });

      const mockGetTask: jest.MockedFunction<GetTaskFn> = jest.fn(async (id) => {
        if (id === dependencyTask.id) return dependencyTask;
        return null;
      });

      const context = createMockContext();
      context.taskStore = { getTask: mockGetTask };

      const result = await coordinator.validateTask(context, task);
      expect(result.success).toBe(true);
    });

    it('should validate status transitions', async () => {
      const task = createMockTask({
        status: TaskStatus.IN_PROGRESS
      });
      const updatedTask = {
        ...task,
        status: TaskStatus.COMPLETED
      };

      const mockGetTask: jest.MockedFunction<GetTaskFn> = jest.fn(async () => task);
      const context = createMockContext(ValidationOperation.UPDATE);
      context.taskStore = { getTask: mockGetTask };

      const result = await coordinator.validateTask(context, updatedTask);
      expect(result.success).toBe(true);
    });

    it('should validate task relationships', async () => {
      const parent = createMockTask({
        type: TaskType.GROUP
      });
      const child = createMockTask({
        parentId: parent.id
      });

      const mockGetTask: jest.MockedFunction<GetTaskFn> = jest.fn(async (id) => {
        if (id === parent.id) return parent;
        return null;
      });

      const context = createMockContext();
      context.taskStore = { getTask: mockGetTask };

      const result = await coordinator.validateTask(context, child);
      expect(result.success).toBe(true);
    });
  });

  describe('rule management', () => {
    it('should allow removing rules', () => {
      const initialRuleCount = coordinator.getRules().length;
      coordinator.removeRule('dependency-rule');
      expect(coordinator.getRules()).toHaveLength(initialRuleCount - 1);
    });

    it('should allow clearing all rules', () => {
      coordinator.clearRules();
      expect(coordinator.getRules()).toHaveLength(0);
    });

    it('should allow getting rule by id', () => {
      const rule = coordinator.getRule('dependency-rule');
      expect(rule).toBeDefined();
      expect(rule?.id).toBe('dependency-rule');
    });

    it('should handle unknown rule ids', () => {
      const rule = coordinator.getRule('unknown-rule');
      expect(rule).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should handle rule execution errors', async () => {
      const errorRule: BusinessRule = {
        id: 'error-rule',
        name: 'Error Rule',
        description: 'Throws error',
        validate: async (): Promise<RuleValidationResult> => {
          throw new Error('Test error');
        }
      };
      coordinator.addRule(errorRule);

      const task = createMockTask();
      const context = createMockContext();
      const result = await coordinator.validateTask(context, task);
      expect(result.success).toBe(false);
      expect(result.errors[0].message).toContain('Test error');
    });

    it('should handle invalid rule definitions', () => {
      expect(() => {
        coordinator.addRule({
          id: '',
          name: '',
          description: '',
          validate: async () => ({ success: true })
        });
      }).toThrow();
    });
  });
});
