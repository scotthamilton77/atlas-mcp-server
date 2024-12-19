import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { DependencyRule } from '../../../../../src/core/validation/rules/dependency-rule.js';
import { TaskStatus, TaskType } from '../../../../../src/shared/types/task.js';
import { Task } from '../../../../../src/core/validation/schemas/task-types.js';
import { TaskValidationContext } from '../../../../../src/core/validation/rules/types.js';
import { ValidationOperation } from '../../../../../src/core/validation/types.js';

interface TaskStore {
  getTask(id: string): Promise<Task | null>;
}

describe('DependencyRule', () => {
  let rule: DependencyRule;
  let mockTaskStore: TaskStore;
  let mockContext: TaskValidationContext;

  beforeEach(() => {
    rule = new DependencyRule();
    mockTaskStore = { 
      getTask: jest.fn().mockImplementation(async () => null)
    } as TaskStore;
    mockContext = {
      operation: ValidationOperation.CREATE,
      sessionId: 'test-session',
      taskStore: mockTaskStore,
      timestamp: Date.now()
    };
  });

  describe('validation', () => {
    it('should pass for task without dependencies', async () => {
      const task: Task = {
        id: '1',
        parentId: null,
        name: 'Test Task',
        type: TaskType.TASK,
        status: TaskStatus.PENDING,
        metadata: {
          created: '2023-01-01T00:00:00Z',
          updated: '2023-01-01T00:00:00Z',
          sessionId: 'test'
        }
      };

      const result = await rule.validate(mockContext, task);
      expect(result.success).toBe(true);
    });

    it('should fail for missing dependencies', async () => {
      const task: Task = {
        id: '1',
        parentId: null,
        name: 'Test Task',
        type: TaskType.TASK,
        status: TaskStatus.PENDING,
        dependencies: ['2', '3'],
        metadata: {
          created: '2023-01-01T00:00:00Z',
          updated: '2023-01-01T00:00:00Z',
          sessionId: 'test'
        }
      };

      (mockTaskStore.getTask as jest.Mock)
        .mockImplementationOnce(async () => null)
        .mockImplementationOnce(async () => null);

      const result = await rule.validate(mockContext, task);
      expect(result.success).toBe(false);
      expect(result.error?.constraint).toBe('MISSING_DEPENDENCIES');
    });

    it('should fail for circular dependencies', async () => {
      const task1: Task = {
        id: '1',
        parentId: null,
        name: 'Task 1',
        type: TaskType.TASK,
        status: TaskStatus.PENDING,
        dependencies: ['2'],
        metadata: {
          created: '2023-01-01T00:00:00Z',
          updated: '2023-01-01T00:00:00Z',
          sessionId: 'test'
        }
      };

      const task2: Task = {
        id: '2',
        parentId: null,
        name: 'Task 2',
        type: TaskType.TASK,
        status: TaskStatus.PENDING,
        dependencies: ['1'],
        metadata: {
          created: '2023-01-01T00:00:00Z',
          updated: '2023-01-01T00:00:00Z',
          sessionId: 'test'
        }
      };

      (mockTaskStore.getTask as jest.Mock)
        .mockImplementationOnce(async () => task2)
        .mockImplementationOnce(async () => task1);

      const result = await rule.validate(mockContext, task1);
      expect(result.success).toBe(false);
      expect(result.error?.constraint).toBe('CIRCULAR_DEPENDENCY');
    });

    it('should fail for incomplete dependencies', async () => {
      const task: Task = {
        id: '1',
        parentId: null,
        name: 'Test Task',
        type: TaskType.TASK,
        status: TaskStatus.PENDING,
        dependencies: ['2'],
        metadata: {
          created: '2023-01-01T00:00:00Z',
          updated: '2023-01-01T00:00:00Z',
          sessionId: 'test'
        }
      };

      const dependency: Task = {
        id: '2',
        parentId: null,
        name: 'Dependency',
        type: TaskType.TASK,
        status: TaskStatus.IN_PROGRESS, // Not completed
        metadata: {
          created: '2023-01-01T00:00:00Z',
          updated: '2023-01-01T00:00:00Z',
          sessionId: 'test'
        }
      };

      (mockTaskStore.getTask as jest.Mock)
        .mockImplementationOnce(async () => dependency);

      const result = await rule.validate(mockContext, task);
      expect(result.success).toBe(false);
      expect(result.error?.constraint).toBe('INCOMPLETE_DEPENDENCIES');
    });

    it('should pass for valid dependencies', async () => {
      const task: Task = {
        id: '1',
        parentId: null,
        name: 'Test Task',
        type: TaskType.TASK,
        status: TaskStatus.PENDING,
        dependencies: ['2'],
        metadata: {
          created: '2023-01-01T00:00:00Z',
          updated: '2023-01-01T00:00:00Z',
          sessionId: 'test'
        }
      };

      const dependency: Task = {
        id: '2',
        parentId: null,
        name: 'Dependency',
        type: TaskType.TASK,
        status: TaskStatus.COMPLETED,
        metadata: {
          created: '2023-01-01T00:00:00Z',
          updated: '2023-01-01T00:00:00Z',
          sessionId: 'test'
        }
      };

      (mockTaskStore.getTask as jest.Mock)
        .mockImplementationOnce(async () => dependency);

      const result = await rule.validate(mockContext, task);
      expect(result.success).toBe(true);
    });

    it('should handle invalid input', async () => {
      const result = await rule.validate(mockContext, null);
      expect(result.success).toBe(false);
      expect(result.error?.constraint).toBe('INVALID_TYPE');
    });

    it('should skip validation when disabled in options', async () => {
      const task: Task = {
        id: '1',
        parentId: null,
        name: 'Test Task',
        type: TaskType.TASK,
        status: TaskStatus.PENDING,
        dependencies: ['2'], // Invalid dependency
        metadata: {
          created: '2023-01-01T00:00:00Z',
          updated: '2023-01-01T00:00:00Z',
          sessionId: 'test'
        }
      };

      const result = await rule.validate(mockContext, task, { validateDependencies: false });
      expect(result.success).toBe(true);
    });
  });
});
