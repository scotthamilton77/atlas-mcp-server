import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { UnifiedStorageEngine } from '../../../../src/core/storage/unified-engine.js';
import { createBasicTask, createTaskWithNotes, createTaskCollection } from '../../../fixtures/tasks.js';

describe('UnifiedStorageEngine', () => {
  let tempDir: string;
  let engine: UnifiedStorageEngine;

  beforeEach(async () => {
    // Create a temporary directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-test-'));
    engine = new UnifiedStorageEngine(tempDir, 5); // Small cache for testing
    await engine.initialize();
  });

  afterEach(async () => {
    // Clean up temporary directory after each test
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Failed to clean up temp directory:', error);
    }
  });

  describe('basic operations', () => {
    it('should save and load a task', async () => {
      const task = createBasicTask();
      await engine.save(task);
      
      const loaded = await engine.load(task.id);
      expect(loaded).toEqual(task);
    });

    it('should handle tasks with notes', async () => {
      const task = createTaskWithNotes();
      await engine.save(task);
      
      const loaded = await engine.load(task.id);
      expect(loaded.notes).toEqual(task.notes);
    });

    it('should throw when loading non-existent task', async () => {
      await expect(engine.load('non-existent-id')).rejects.toThrow('not found');
    });
  });

  describe('transaction handling', () => {
    it('should handle atomic operations', async () => {
      const tasks = [createBasicTask(), createBasicTask()];
      
      const transaction = await engine.beginTransaction();
      
      for (const task of tasks) {
        await engine.save(task);
      }
      
      await engine.commitTransaction();
      
      // Verify all tasks were saved
      for (const task of tasks) {
        const loaded = await engine.load(task.id);
        expect(loaded).toEqual(task);
      }
    });

    it('should rollback on failure', async () => {
      const task1 = createBasicTask();
      const task2 = createBasicTask();
      
      // Save first task outside transaction
      await engine.save(task1);
      
      const transaction = await engine.beginTransaction();
      
      // Delete first task and save second task in transaction
      await engine.delete(task1.id);
      await engine.save(task2);
      
      // Force rollback
      await engine.rollbackTransaction();
      
      // First task should still exist
      const loaded1 = await engine.load(task1.id);
      expect(loaded1).toEqual(task1);
      
      // Second task should not exist
      await expect(engine.load(task2.id)).rejects.toThrow('not found');
    });

    it('should prevent nested transactions', async () => {
      await engine.beginTransaction();
      await expect(engine.beginTransaction()).rejects.toThrow('already in progress');
    });

    it('should prevent operations without active transaction', async () => {
      await expect(engine.commitTransaction()).rejects.toThrow('No active transaction');
      await expect(engine.rollbackTransaction()).rejects.toThrow('No active transaction');
    });
  });

  describe('cache behavior', () => {
    it('should use memory cache for repeated loads', async () => {
      const task = createBasicTask();
      await engine.save(task);
      
      // First load should cache the task
      const loaded1 = await engine.load(task.id);
      expect(loaded1).toEqual(task);
      
      // Modify file directly to verify cache is being used
      const filePath = path.join(tempDir, `${task.id}.json`);
      const modifiedTask = { ...task, name: 'Modified' };
      await fs.writeFile(filePath, JSON.stringify(modifiedTask), 'utf-8');
      
      // Second load should use cache
      const loaded2 = await engine.load(task.id);
      expect(loaded2.name).toBe(task.name);
    });

    it('should enforce cache size limit', async () => {
      const tasks = createTaskCollection().slice(0, 6); // Create 6 tasks with limit of 5
      
      for (const task of tasks) {
        await engine.save(task);
      }
      
      const stats = engine.getStats();
      expect(stats.memory.size).toBe(5);
    });
  });

  describe('backup and restore', () => {
    it('should backup and restore tasks', async () => {
      const tasks = [createBasicTask(), createTaskWithNotes()];
      for (const task of tasks) {
        await engine.save(task);
      }

      const backupDir = path.join(tempDir, 'backup');
      await engine.backup(backupDir);

      // Clear storage
      await engine.clear();
      
      // Verify storage is empty
      const ids = await engine.list();
      expect(ids).toHaveLength(0);

      // Restore from backup
      await engine.restore(backupDir);

      // Verify tasks are restored
      for (const task of tasks) {
        const loaded = await engine.load(task.id);
        expect(loaded).toEqual(task);
      }
    });
  });

  describe('list operations', () => {
    it('should list all task IDs', async () => {
      const tasks = [createBasicTask(), createBasicTask()];
      for (const task of tasks) {
        await engine.save(task);
      }

      const ids = await engine.list();
      expect(ids).toHaveLength(tasks.length);
      expect(ids).toEqual(expect.arrayContaining(tasks.map(t => t.id)));
    });
  });

  describe('delete operations', () => {
    it('should delete tasks from both storage and cache', async () => {
      const task = createBasicTask();
      await engine.save(task);
      
      await engine.delete(task.id);
      
      await expect(engine.load(task.id)).rejects.toThrow('not found');
    });

    it('should handle deleting non-existent task', async () => {
      await expect(engine.delete('non-existent-id')).resolves.not.toThrow();
    });
  });

  describe('statistics', () => {
    it('should report correct statistics', async () => {
      const tasks = createTaskCollection().slice(0, 3);
      for (const task of tasks) {
        await engine.save(task);
      }

      const stats = engine.getStats();
      expect(stats).toEqual({
        memory: {
          size: 3,
          maxSize: 5
        },
        hasActiveTransaction: false
      });
    });

    it('should track active transactions', async () => {
      await engine.beginTransaction();
      
      const stats = engine.getStats();
      expect(stats.hasActiveTransaction).toBe(true);
      
      await engine.rollbackTransaction();
      
      const statsAfter = engine.getStats();
      expect(statsAfter.hasActiveTransaction).toBe(false);
    });
  });
});
