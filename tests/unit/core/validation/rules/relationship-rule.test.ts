import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { RelationshipRule } from '../../../../../src/core/validation/rules/relationship-rule.js';
import { TaskStatus, TaskType } from '../../../../../src/shared/types/task.js';
import { Task } from '../../../../../src/core/validation/schemas/task-types.js';
import { TaskValidationContext } from '../../../../../src/core/validation/rules/types.js';
import { ValidationOperation } from '../../../../../src/core/validation/types.js';

interface TaskStore {
  getTask(id: string): Promise<Task | null>;
}

describe('RelationshipRule', () => {
  let rule: RelationshipRule;
  let mockTaskStore: TaskStore;
  let mockContext: TaskValidationContext;

  beforeEach(() => {
    rule = new RelationshipRule();
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
    it('should pass for valid task without relationships', async () => {
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

    it('should validate parent-child type constraints', async () => {
      const invalidChildTypes = [
        { parentType: TaskType.TASK, childType: TaskType.TASK },
        { parentType: TaskType.TASK, childType: TaskType.GROUP },
        { parentType: TaskType.MILESTONE, childType: TaskType.TASK },
        { parentType: TaskType.MILESTONE, childType: TaskType.GROUP }
      ];

      for (const { parentType, childType } of invalidChildTypes) {
        const parent: Task = {
          id: '1',
          parentId: null,
          name: 'Parent Task',
          type: parentType,
          status: TaskStatus.PENDING,
          metadata: {
            created: '2023-01-01T00:00:00Z',
            updated: '2023-01-01T00:00:00Z',
            sessionId: 'test'
          }
        };

        const child: Task = {
          id: '2',
          parentId: '1',
          name: 'Child Task',
          type: childType,
          status: TaskStatus.PENDING,
          metadata: {
            created: '2023-01-01T00:00:00Z',
            updated: '2023-01-01T00:00:00Z',
            sessionId: 'test'
          }
        };

        (mockTaskStore.getTask as jest.Mock)
          .mockImplementationOnce(async () => parent);

        const result = await rule.validate(mockContext, child);
        expect(result.success).toBe(false);
        expect(result.error?.constraint).toBe('PARENT_RELATIONSHIP');
      }
    });

    it('should validate hierarchy depth', async () => {
      // Create a deep task hierarchy
      const tasks: Task[] = [];
      for (let i = 0; i < 7; i++) {
        tasks.push({
          id: `${i}`,
          parentId: i === 0 ? null : `${i - 1}`,
          name: `Task ${i}`,
          type: TaskType.GROUP,
          status: TaskStatus.PENDING,
          metadata: {
            created: '2023-01-01T00:00:00Z',
            updated: '2023-01-01T00:00:00Z',
            sessionId: 'test'
          }
        });
      }

      // Mock getTask to return parent tasks
      let callCount = 0;
      const mockGetTask = jest.fn((id: string) => {
        const parentIndex = parseInt(id);
        callCount++;
        return Promise.resolve(parentIndex >= 0 && parentIndex < tasks.length ? tasks[parentIndex] : null);
      });
      mockTaskStore.getTask = mockGetTask;

      const result = await rule.validate(mockContext, tasks[tasks.length - 1]);
      expect(result.success).toBe(false);
      expect(result.error?.constraint).toBe('HIERARCHY_DEPTH');
      expect(callCount).toBeGreaterThan(0); // Verify parent chain was checked
    });

    it('should validate sibling relationships', async () => {
      const parent: Task = {
        id: '1',
        parentId: null,
        name: 'Parent Task',
        type: TaskType.GROUP,
        status: TaskStatus.PENDING,
        subtasks: [
          {
            id: '2',
            parentId: '1',
            name: 'Sibling 1',
            type: TaskType.MILESTONE,
            status: TaskStatus.COMPLETED,
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

      const newSibling: Task = {
        id: '3',
        parentId: '1',
        name: 'Sibling 2',
        type: TaskType.MILESTONE,
        status: TaskStatus.PENDING,
        metadata: {
          created: '2023-01-01T00:00:00Z',
          updated: '2023-01-01T00:00:00Z',
          sessionId: 'test'
        }
      };

      (mockTaskStore.getTask as jest.Mock)
        .mockImplementationOnce(async () => parent);

      const result = await rule.validate(mockContext, newSibling);
      expect(result.success).toBe(false);
      expect(result.error?.constraint).toBe('SIBLING_RELATIONSHIP');
    });

    it('should validate duplicate sibling IDs', async () => {
      const parent: Task = {
        id: '1',
        parentId: null,
        name: 'Parent Task',
        type: TaskType.GROUP,
        status: TaskStatus.PENDING,
        subtasks: [
          {
            id: '2',
            parentId: '1',
            name: 'Existing Task',
            type: TaskType.TASK,
            status: TaskStatus.PENDING,
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

      const duplicateTask: Task = {
        id: '2', // Same ID as existing subtask
        parentId: '1',
        name: 'Duplicate Task',
        type: TaskType.TASK,
        status: TaskStatus.PENDING,
        metadata: {
          created: '2023-01-01T00:00:00Z',
          updated: '2023-01-01T00:00:00Z',
          sessionId: 'test'
        }
      };

      (mockTaskStore.getTask as jest.Mock)
        .mockImplementationOnce(async () => parent);

      const result = await rule.validate(mockContext, duplicateTask);
      expect(result.success).toBe(false);
      expect(result.error?.constraint).toBe('SIBLING_RELATIONSHIP');
    });

    it('should handle invalid input', async () => {
      const result = await rule.validate(mockContext, null);
      expect(result.success).toBe(false);
      expect(result.error?.constraint).toBe('INVALID_TYPE');
    });

    it('should skip validation when disabled in options', async () => {
      const task: Task = {
        id: '1',
        parentId: '2', // Non-existent parent
        name: 'Test Task',
        type: TaskType.TASK,
        status: TaskStatus.PENDING,
        metadata: {
          created: '2023-01-01T00:00:00Z',
          updated: '2023-01-01T00:00:00Z',
          sessionId: 'test'
        }
      };

      const result = await rule.validate(mockContext, task, { validateRelationships: false });
      expect(result.success).toBe(true);
    });
  });
});
