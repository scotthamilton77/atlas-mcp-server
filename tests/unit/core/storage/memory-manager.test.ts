import { describe, it, expect, beforeEach } from '@jest/globals';
import { MemoryManager } from '../../../../src/core/storage/memory-manager.js';
import { createBasicTask, createTaskWithNotes, createTaskCollection } from '../../../fixtures/tasks.js';

describe('MemoryManager', () => {
  let memoryManager: MemoryManager;

  beforeEach(() => {
    memoryManager = new MemoryManager(5); // Small size for testing LRU
  });

  describe('basic operations', () => {
    it('should save and load a task', async () => {
      const task = createBasicTask();
      await memoryManager.save(task);
      
      const loaded = await memoryManager.load(task.id);
      expect(loaded).toEqual(task);
    });

    it('should handle tasks with notes', async () => {
      const task = createTaskWithNotes();
      await memoryManager.save(task);
      
      const loaded = await memoryManager.load(task.id);
      expect(loaded.notes).toEqual(task.notes);
    });

    it('should throw when loading non-existent task', async () => {
      await expect(memoryManager.load('non-existent-id')).rejects.toThrow('not found');
    });
  });

  describe('LRU caching', () => {
    it('should enforce size limit', async () => {
      const tasks = createTaskCollection();
      await memoryManager.preload(tasks.slice(0, 6)); // Try to add 6 tasks with limit of 5
      
      expect(memoryManager.size()).toBe(5);
      expect(await memoryManager.has(tasks[0].id)).toBe(false); // First task should be evicted
    });

    it('should update access order on load', async () => {
      const tasks = createTaskCollection().slice(0, 3);
      await memoryManager.preload(tasks);

      // Access first task to make it most recently used
      await memoryManager.load(tasks[0].id);
      
      const mruTasks = memoryManager.getMRUTasks(1);
      expect(mruTasks[0].id).toBe(tasks[0].id);
    });

    it('should maintain correct LRU order', async () => {
      const tasks = createTaskCollection().slice(0, 3);
      await memoryManager.preload(tasks);

      // Access tasks in specific order
      await memoryManager.load(tasks[1].id);
      await memoryManager.load(tasks[0].id);
      await memoryManager.load(tasks[2].id);

      const lruTasks = memoryManager.getLRUTasks(3);
      expect(lruTasks.map(t => t.id)).toEqual([
        tasks[1].id,
        tasks[0].id,
        tasks[2].id
      ]);
    });
  });

  describe('eviction', () => {
    it('should evict specific tasks', async () => {
      const tasks = createTaskCollection().slice(0, 3);
      await memoryManager.preload(tasks);

      await memoryManager.evict([tasks[0].id, tasks[1].id]);
      
      expect(memoryManager.size()).toBe(1);
      expect(await memoryManager.has(tasks[0].id)).toBe(false);
      expect(await memoryManager.has(tasks[1].id)).toBe(false);
      expect(await memoryManager.has(tasks[2].id)).toBe(true);
    });

    it('should handle evicting non-existent tasks', async () => {
      await expect(memoryManager.evict(['non-existent-id'])).resolves.not.toThrow();
    });
  });

  describe('statistics', () => {
    it('should report correct statistics', async () => {
      const tasks = createTaskCollection().slice(0, 3);
      await memoryManager.preload(tasks);

      const stats = memoryManager.getStats();
      expect(stats).toEqual({
        size: 3,
        maxSize: 5
      });
    });
  });

  describe('list operations', () => {
    it('should list all task IDs', async () => {
      const tasks = createTaskCollection().slice(0, 3);
      await memoryManager.preload(tasks);

      const ids = await memoryManager.list();
      expect(ids).toHaveLength(tasks.length);
      expect(ids).toEqual(expect.arrayContaining(tasks.map(t => t.id)));
    });

    it('should handle empty state', async () => {
      const ids = await memoryManager.list();
      expect(ids).toHaveLength(0);
    });
  });

  describe('clear operations', () => {
    it('should clear all tasks', async () => {
      const tasks = createTaskCollection().slice(0, 3);
      await memoryManager.preload(tasks);

      await memoryManager.clear();
      expect(memoryManager.size()).toBe(0);
      const ids = await memoryManager.list();
      expect(ids).toHaveLength(0);
    });
  });

  describe('preload operations', () => {
    it('should preload multiple tasks', async () => {
      const tasks = createTaskCollection().slice(0, 3);
      await memoryManager.preload(tasks);

      for (const task of tasks) {
        const loaded = await memoryManager.load(task.id);
        expect(loaded).toEqual(task);
      }
    });

    it('should handle empty preload', async () => {
      await expect(memoryManager.preload([])).resolves.not.toThrow();
    });
  });
});
