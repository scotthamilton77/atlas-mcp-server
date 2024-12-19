import { describe, it, expect, beforeEach } from '@jest/globals';
import { StorageTransaction } from '../../../../src/core/storage/storage-transaction.js';
import { createBasicTask } from '../../../fixtures/tasks.js';

describe('StorageTransaction', () => {
  let transaction: StorageTransaction;

  beforeEach(() => {
    transaction = new StorageTransaction();
  });

  describe('basic operations', () => {
    it('should add save operations', async () => {
      const task = createBasicTask();
      await transaction.addSave(task);

      const ops = transaction.getOperations();
      expect(ops).toHaveLength(1);
      expect(ops[0]).toEqual({
        type: 'save',
        taskId: task.id,
        task
      });
    });

    it('should add delete operations', async () => {
      const taskId = 'test-id';
      await transaction.addDelete(taskId);

      const ops = transaction.getOperations();
      expect(ops).toHaveLength(1);
      expect(ops[0]).toEqual({
        type: 'delete',
        taskId
      });
    });

    it('should track backup tasks', async () => {
      const task = createBasicTask();
      await transaction.backup(task.id, task);

      const backup = transaction.getBackup(task.id);
      expect(backup).toEqual(task);
      expect(backup).not.toBe(task); // Should be a copy
    });
  });

  describe('transaction state', () => {
    it('should track committed state', () => {
      expect(transaction.isCommitted()).toBe(false);
      transaction.commit();
      expect(transaction.isCommitted()).toBe(true);
    });

    it('should track rolled back state', () => {
      expect(transaction.isRolledBack()).toBe(false);
      transaction.rollback();
      expect(transaction.isRolledBack()).toBe(true);
    });

    it('should prevent operations after commit', async () => {
      transaction.commit();
      await expect(transaction.addSave(createBasicTask())).rejects.toThrow('already committed');
    });

    it('should prevent operations after rollback', async () => {
      transaction.rollback();
      await expect(transaction.addDelete('test-id')).rejects.toThrow('already rolled back');
    });
  });

  describe('affected tasks', () => {
    it('should track affected task IDs', async () => {
      const task1 = createBasicTask();
      const task2 = createBasicTask();

      await transaction.addSave(task1);
      await transaction.addDelete(task2.id);
      await transaction.addSave(task1); // Duplicate ID

      const affectedIds = transaction.getAffectedIds();
      expect(affectedIds).toHaveLength(2);
      expect(affectedIds).toContain(task1.id);
      expect(affectedIds).toContain(task2.id);
    });
  });

  describe('transaction summary', () => {
    it('should provide accurate summary', async () => {
      const task1 = createBasicTask();
      const task2 = createBasicTask();
      const task3 = createBasicTask();

      await transaction.addSave(task1);
      await transaction.addSave(task2);
      await transaction.addDelete(task3.id);

      const summary = transaction.getSummary();
      expect(summary).toEqual({
        operations: 3,
        saves: 2,
        deletes: 1,
        affectedIds: [task1.id, task2.id, task3.id]
      });
    });

    it('should handle empty transaction', () => {
      expect(transaction.isEmpty()).toBe(true);
      expect(transaction.size()).toBe(0);

      const summary = transaction.getSummary();
      expect(summary).toEqual({
        operations: 0,
        saves: 0,
        deletes: 0,
        affectedIds: []
      });
    });
  });

  describe('backup management', () => {
    it('should only backup first state of task', async () => {
      const task = createBasicTask();
      const modifiedTask = { ...task, name: 'Modified' };

      await transaction.backup(task.id, task);
      await transaction.backup(task.id, modifiedTask);

      const backup = transaction.getBackup(task.id);
      expect(backup).toEqual(task);
      expect(backup?.name).toBe(task.name);
    });

    it('should handle null task backups', async () => {
      const taskId = 'test-id';
      await transaction.backup(taskId, null);

      const backup = transaction.getBackup(taskId);
      expect(backup).toBeNull();
    });
  });

  describe('operation order', () => {
    it('should maintain operation order', async () => {
      const task1 = createBasicTask();
      const task2 = createBasicTask();

      await transaction.addSave(task1);
      await transaction.addDelete(task1.id);
      await transaction.addSave(task2);

      const ops = transaction.getOperations();
      expect(ops).toHaveLength(3);
      expect(ops[0].type).toBe('save');
      expect(ops[0].taskId).toBe(task1.id);
      expect(ops[1].type).toBe('delete');
      expect(ops[1].taskId).toBe(task1.id);
      expect(ops[2].type).toBe('save');
      expect(ops[2].taskId).toBe(task2.id);
    });
  });
});
