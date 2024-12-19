import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { StatusRule } from '../../../../../src/core/validation/rules/status-rule.js';
import { TaskStatus, TaskType } from '../../../../../src/shared/types/task.js';
import { Task } from '../../../../../src/core/validation/schemas/task-types.js';
import { TaskValidationContext } from '../../../../../src/core/validation/rules/types.js';
import { ValidationOperation } from '../../../../../src/core/validation/types.js';

interface TaskStore {
  getTask(id: string): Promise<Task | null>;
}

describe('StatusRule', () => {
  let rule: StatusRule;
  let mockTaskStore: TaskStore;
  let mockContext: TaskValidationContext;

  beforeEach(() => {
    rule = new StatusRule();
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
    it('should pass for initial pending status', async () => {
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

    it('should validate valid status transitions', async () => {
      const validTransitions = [
        { from: TaskStatus.PENDING, to: TaskStatus.IN_PROGRESS },
        { from: TaskStatus.PENDING, to: TaskStatus.BLOCKED },
        { from: TaskStatus.IN_PROGRESS, to: TaskStatus.COMPLETED },
        { from: TaskStatus.IN_PROGRESS, to: TaskStatus.FAILED },
        { from: TaskStatus.IN_PROGRESS, to: TaskStatus.BLOCKED },
        { from: TaskStatus.COMPLETED, to: TaskStatus.IN_PROGRESS },
        { from: TaskStatus.FAILED, to: TaskStatus.IN_PROGRESS },
        { from: TaskStatus.BLOCKED, to: TaskStatus.IN_PROGRESS },
        { from: TaskStatus.BLOCKED, to: TaskStatus.FAILED }
      ];

      for (const { from, to } of validTransitions) {
        const currentTask: Task = {
          id: '1',
          parentId: null,
          name: 'Test Task',
          type: TaskType.TASK,
          status: from,
          metadata: {
            created: '2023-01-01T00:00:00Z',
            updated: '2023-01-01T00:00:00Z',
            sessionId: 'test'
          }
        };

        const updatedTask: Task = {
          ...currentTask,
          status: to
        };

        (mockTaskStore.getTask as jest.Mock)
          .mockImplementationOnce(async () => currentTask);

        const result = await rule.validate(mockContext, updatedTask);
        expect(result.success).toBe(true);
      }
    });

    it('should fail for invalid status transitions', async () => {
      const invalidTransitions = [
        { from: TaskStatus.PENDING, to: TaskStatus.COMPLETED },
        { from: TaskStatus.PENDING, to: TaskStatus.FAILED },
        { from: TaskStatus.COMPLETED, to: TaskStatus.BLOCKED },
        { from: TaskStatus.FAILED, to: TaskStatus.COMPLETED },
        { from: TaskStatus.BLOCKED, to: TaskStatus.COMPLETED }
      ];

      for (const { from, to } of invalidTransitions) {
        const currentTask: Task = {
          id: '1',
          parentId: null,
          name: 'Test Task',
          type: TaskType.TASK,
          status: from,
          metadata: {
            created: '2023-01-01T00:00:00Z',
            updated: '2023-01-01T00:00:00Z',
            sessionId: 'test'
          }
        };

        const updatedTask: Task = {
          ...currentTask,
          status: to
        };

        (mockTaskStore.getTask as jest.Mock)
          .mockImplementationOnce(async () => currentTask);

        const result = await rule.validate(mockContext, updatedTask);
        expect(result.success).toBe(false);
        expect(result.error?.constraint).toBe('INVALID_TRANSITION');
      }
    });

    it('should validate parent-child status constraints', async () => {
      const task: Task = {
        id: '1',
        parentId: '2',
        name: 'Child Task',
        type: TaskType.TASK,
        status: TaskStatus.COMPLETED,
        metadata: {
          created: '2023-01-01T00:00:00Z',
          updated: '2023-01-01T00:00:00Z',
          sessionId: 'test'
        }
      };

      const parent: Task = {
        id: '2',
        parentId: null,
        name: 'Parent Task',
        type: TaskType.GROUP,
        status: TaskStatus.BLOCKED,
        metadata: {
          created: '2023-01-01T00:00:00Z',
          updated: '2023-01-01T00:00:00Z',
          sessionId: 'test'
        }
      };

      (mockTaskStore.getTask as jest.Mock)
        .mockImplementationOnce(async () => parent);

      const result = await rule.validate(mockContext, task);
      expect(result.success).toBe(false);
      expect(result.error?.constraint).toBe('PARENT_STATUS_CONFLICT');
    });

    it('should validate subtask status constraints', async () => {
      const task: Task = {
        id: '1',
        parentId: null,
        name: 'Parent Task',
        type: TaskType.GROUP,
        status: TaskStatus.COMPLETED,
        subtasks: [
          {
            id: '2',
            parentId: '1',
            name: 'Child Task',
            type: TaskType.TASK,
            status: TaskStatus.IN_PROGRESS,
            metadata: {
              created: '2023-01-01T00:00:00Z',
              updated: '2023-01-01T00:00:00Z',
              sessionId: 'test'
            }
          }
        ],
        metadata: {
          created: '2023-01-01T00:00:00Z',
          updated: '2023-01-01T00:00:00Z',
          sessionId: 'test'
        }
      };

      const result = await rule.validate(mockContext, task);
      expect(result.success).toBe(false);
      expect(result.error?.constraint).toBe('SUBTASK_STATUS_CONFLICT');
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
        status: TaskStatus.COMPLETED, // Invalid direct transition from undefined
        metadata: {
          created: '2023-01-01T00:00:00Z',
          updated: '2023-01-01T00:00:00Z',
          sessionId: 'test'
        }
      };

      const result = await rule.validate(mockContext, task, { validateStatus: false });
      expect(result.success).toBe(true);
    });
  });
});
