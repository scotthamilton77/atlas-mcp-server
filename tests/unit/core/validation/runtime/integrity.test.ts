import { describe, it, expect, beforeEach } from '@jest/globals';
import { DataIntegrityChecker } from '../../../../../src/core/validation/runtime/integrity.js';
import { TaskStatus, TaskType } from '../../../../../src/shared/types/task.js';
import { createMockTask, createMockContext } from '../../../../helpers/validation.js';

describe('DataIntegrityChecker', () => {
  let checker: DataIntegrityChecker;
  let mockContext: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    checker = new DataIntegrityChecker();
    mockContext = createMockContext();
  });

  describe('type validation', () => {
    it('should fail for non-object data', async () => {
      const result = await checker.check(mockContext, 'not an object');
      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('integrity');
      expect(result.error?.message).toContain('Invalid data type');
    });

    it('should fail for null data', async () => {
      const result = await checker.check(mockContext, null);
      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('integrity');
    });

    it('should fail for missing required fields', async () => {
      const invalidTask = {
        id: '123',
        // Missing name, type, status
      };

      const result = await checker.check(mockContext, invalidTask);
      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('integrity');
      expect(result.error?.message).toContain('Missing or malformed required fields');
    });
  });

  describe('required fields validation', () => {
    it('should validate all required fields are present', async () => {
      const task = createMockTask();
      const result = await checker.check(mockContext, task);
      expect(result.success).toBe(true);
    });

    it('should fail if metadata is missing', async () => {
      const task = createMockTask();
      const invalidTask = {
        ...task,
        metadata: undefined
      };

      const result = await checker.check(mockContext, task);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Missing or malformed required fields');
    });
  });

  describe('timestamp validation', () => {
    it('should validate valid timestamps', async () => {
      const task = createMockTask({
        metadata: {
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          sessionId: 'test-session'
        }
      });

      const result = await checker.check(mockContext, task);
      expect(result.success).toBe(true);
    });

    it('should fail for invalid timestamp format', async () => {
      const task = createMockTask({
        metadata: {
          created: 'invalid-date',
          updated: new Date().toISOString(),
          sessionId: 'test-session'
        }
      });

      const result = await checker.check(mockContext, task);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Invalid timestamp format');
    });

    it('should fail if updated is before created', async () => {
      const now = new Date();
      const earlier = new Date(now.getTime() - 1000);

      const task = createMockTask({
        metadata: {
          created: now.toISOString(),
          updated: earlier.toISOString(),
          sessionId: 'test-session'
        }
      });

      const result = await checker.check(mockContext, task);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Invalid timestamp format');
    });
  });

  describe('ID validation', () => {
    it('should validate valid UUIDs', async () => {
      const task = createMockTask({
        id: '123e4567-e89b-12d3-a456-426614174000'
      });

      const result = await checker.check(mockContext, task);
      expect(result.success).toBe(true);
    });

    it('should fail for invalid UUID format', async () => {
      const task = createMockTask({
        id: 'not-a-uuid'
      });

      const result = await checker.check(mockContext, task);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Invalid ID format');
    });

    it('should validate parent ID if present', async () => {
      const task = createMockTask({
        parentId: '123e4567-e89b-12d3-a456-426614174000'
      });

      const result = await checker.check(mockContext, task);
      expect(result.success).toBe(true);
    });

    it('should fail for invalid parent ID', async () => {
      const task = createMockTask({
        parentId: 'invalid-parent-id'
      });

      const result = await checker.check(mockContext, task);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Invalid ID format');
    });

    it('should validate dependency IDs', async () => {
      const task = createMockTask({
        dependencies: [
          '123e4567-e89b-12d3-a456-426614174000',
          '987fcdeb-51a2-43d7-9012-345678901234'
        ]
      });

      const result = await checker.check(mockContext, task);
      expect(result.success).toBe(true);
    });

    it('should fail for invalid dependency IDs', async () => {
      const task = createMockTask({
        dependencies: ['invalid-dep-id']
      });

      const result = await checker.check(mockContext, task);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Invalid ID format');
    });

    it('should validate subtask IDs', async () => {
      const task = createMockTask({
        type: TaskType.GROUP,
        subtasks: [
          createMockTask({
            id: '123e4567-e89b-12d3-a456-426614174000'
          })
        ]
      });

      const result = await checker.check(mockContext, task);
      expect(result.success).toBe(true);
    });

    it('should fail for invalid subtask IDs', async () => {
      const task = createMockTask({
        type: TaskType.GROUP,
        subtasks: [
          createMockTask({
            id: 'invalid-subtask-id'
          })
        ]
      });

      const result = await checker.check(mockContext, task);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Invalid ID format');
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
