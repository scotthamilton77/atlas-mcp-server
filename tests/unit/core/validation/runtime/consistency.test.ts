import { describe, it, expect, beforeEach } from '@jest/globals';
import { ConsistencyChecker } from '../../../../../src/core/validation/runtime/consistency.js';
import { TaskStatus, TaskType } from '../../../../../src/shared/types/task.js';
import { createMockTask, createMockContext } from '../../../../helpers/validation.js';

describe('ConsistencyChecker', () => {
  let checker: ConsistencyChecker;
  let mockContext: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    checker = new ConsistencyChecker();
    mockContext = createMockContext();
  });

  describe('type validation', () => {
    it('should fail for non-object data', async () => {
      const result = await checker.check(mockContext, 'not an object');
      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('consistency');
      expect(result.error?.message).toContain('Invalid data type');
    });

    it('should fail for null data', async () => {
      const result = await checker.check(mockContext, null);
      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('consistency');
    });
  });

  describe('parent-child consistency', () => {
    it('should validate task with no parent', async () => {
      const task = createMockTask();
      const result = await checker.check(mockContext, task);
      expect(result.success).toBe(true);
    });

    it('should fail if parent does not exist', async () => {
      const task = createMockTask({ parentId: 'non-existent' });
      mockContext.taskStore = {
        getTask: async () => null
      };

      const result = await checker.check(mockContext, task);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Parent task not found');
    });

    it('should fail if parent is not a group task', async () => {
      const parent = createMockTask({
        id: 'parent-1',
        type: TaskType.TASK // Not a group task
      });

      const task = createMockTask({ parentId: 'parent-1' });

      mockContext.taskStore = {
        getTask: async () => parent
      };

      const result = await checker.check(mockContext, task);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Parent task must be a group task');
    });

    it('should validate task with valid group parent', async () => {
      const parent = createMockTask({
        id: 'parent-1',
        type: TaskType.GROUP
      });

      const task = createMockTask({ parentId: 'parent-1' });

      mockContext.taskStore = {
        getTask: async () => parent
      };

      const result = await checker.check(mockContext, task);
      expect(result.success).toBe(true);
    });
  });

  describe('dependency consistency', () => {
    it('should validate task with no dependencies', async () => {
      const task = createMockTask();
      const result = await checker.check(mockContext, task);
      expect(result.success).toBe(true);
    });

    it('should fail if dependency does not exist', async () => {
      const task = createMockTask({
        dependencies: ['non-existent']
      });

      mockContext.taskStore = {
        getTask: async () => null
      };

      const result = await checker.check(mockContext, task);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('One or more dependencies not found');
    });

    it('should detect circular dependencies', async () => {
      const task1 = createMockTask({
        id: 'task-1',
        dependencies: ['task-2']
      });

      const task2 = createMockTask({
        id: 'task-2',
        dependencies: ['task-1']
      });

      const taskStore = new Map([
        ['task-1', task1],
        ['task-2', task2]
      ]);

      mockContext.taskStore = {
        getTask: async (id) => taskStore.get(id) || null
      };

      const result = await checker.check(mockContext, task1);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Circular dependency');
    });

    it('should validate complex dependency chain', async () => {
      const task1 = createMockTask({
        id: 'task-1',
        dependencies: ['task-2']
      });

      const task2 = createMockTask({
        id: 'task-2',
        dependencies: ['task-3']
      });

      const task3 = createMockTask({
        id: 'task-3'
      });

      const taskStore = new Map([
        ['task-1', task1],
        ['task-2', task2],
        ['task-3', task3]
      ]);

      mockContext.taskStore = {
        getTask: async (id) => taskStore.get(id) || null
      };

      const result = await checker.check(mockContext, task1);
      expect(result.success).toBe(true);
    });
  });

  describe('subtask consistency', () => {
    it('should validate group task with no subtasks', async () => {
      const task = createMockTask({
        type: TaskType.GROUP
      });

      const result = await checker.check(mockContext, task);
      expect(result.success).toBe(true);
    });

    it('should fail if non-group task has subtasks', async () => {
      const task = createMockTask({
        type: TaskType.TASK,
        subtasks: [createMockTask()]
      });

      const result = await checker.check(mockContext, task);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Only group tasks can have subtasks');
    });

    it('should fail for duplicate subtask IDs', async () => {
      const subtask = createMockTask({ id: 'subtask-1' });
      const task = createMockTask({
        type: TaskType.GROUP,
        subtasks: [subtask, { ...subtask }] // Duplicate ID
      });

      const result = await checker.check(mockContext, task);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Duplicate subtask IDs');
    });

    it('should fail for invalid subtask parent references', async () => {
      const task = createMockTask({
        id: 'parent-1',
        type: TaskType.GROUP,
        subtasks: [
          createMockTask({
            id: 'subtask-1',
            parentId: 'wrong-parent' // Wrong parent reference
          })
        ]
      });

      const result = await checker.check(mockContext, task);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Invalid subtask parent reference');
    });

    it('should validate group task with valid subtasks', async () => {
      const task = createMockTask({
        id: 'parent-1',
        type: TaskType.GROUP,
        subtasks: [
          createMockTask({
            id: 'subtask-1',
            parentId: 'parent-1'
          }),
          createMockTask({
            id: 'subtask-2',
            parentId: 'parent-1'
          })
        ]
      });

      const result = await checker.check(mockContext, task);
      expect(result.success).toBe(true);
    });
  });

  describe('validation options', () => {
    it('should respect validation options', async () => {
      const task = createMockTask();
      const options = { strict: true };

      const result = await checker.check(mockContext, task, options);
      expect(result.success).toBe(true);
    });
  });
});
