import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { FileManager } from '../../../../src/core/storage/file-manager.js';
import { createBasicTask, createTaskWithNotes, createTaskHierarchy } from '../../../fixtures/tasks.js';

describe('FileManager', () => {
  let tempDir: string;
  let fileManager: FileManager;

  beforeEach(async () => {
    // Create a temporary directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-test-'));
    fileManager = new FileManager(tempDir);
    await fileManager.initialize();
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
      await fileManager.save(task);
      
      const loaded = await fileManager.load(task.id);
      expect(loaded).toEqual(task);
    });

    it('should handle tasks with notes', async () => {
      const task = createTaskWithNotes();
      await fileManager.save(task);
      
      const loaded = await fileManager.load(task.id);
      expect(loaded.notes).toEqual(task.notes);
    });

    it('should handle task hierarchies', async () => {
      const hierarchy = createTaskHierarchy();
      await fileManager.save(hierarchy);
      
      const loaded = await fileManager.load(hierarchy.id);
      expect(loaded).toEqual(hierarchy);
    });
  });

  describe('error handling', () => {
    it('should throw when loading non-existent task', async () => {
      await expect(fileManager.load('non-existent-id')).rejects.toThrow('not found');
    });

    it('should handle invalid JSON gracefully', async () => {
      const task = createBasicTask();
      const filePath = path.join(tempDir, `${task.id}.json`);
      
      // Write invalid JSON
      await fs.writeFile(filePath, 'invalid json', 'utf-8');
      
      await expect(fileManager.load(task.id)).rejects.toThrow();
    });
  });

  describe('backup and restore', () => {
    it('should backup and restore tasks', async () => {
      const tasks = [createBasicTask(), createTaskWithNotes()];
      await Promise.all(tasks.map(task => fileManager.save(task)));

      const backupDir = path.join(tempDir, 'backup');
      await fileManager.backup(backupDir);

      // Clear original storage
      await fileManager.clear();
      
      // Verify storage is empty
      const files = await fs.readdir(tempDir);
      expect(files.filter(f => f !== 'backup')).toHaveLength(0);

      // Restore from backup
      await fileManager.restore(backupDir);

      // Verify tasks are restored
      for (const task of tasks) {
        const loaded = await fileManager.load(task.id);
        expect(loaded).toEqual(task);
      }
    });
  });

  describe('list operations', () => {
    it('should list all task IDs', async () => {
      const tasks = [createBasicTask(), createBasicTask(), createBasicTask()];
      await Promise.all(tasks.map(task => fileManager.save(task)));

      const ids = await fileManager.list();
      expect(ids).toHaveLength(tasks.length);
      expect(ids).toEqual(expect.arrayContaining(tasks.map(t => t.id)));
    });

    it('should handle empty directory', async () => {
      const ids = await fileManager.list();
      expect(ids).toHaveLength(0);
    });
  });

  describe('delete operations', () => {
    it('should delete a task', async () => {
      const task = createBasicTask();
      await fileManager.save(task);
      
      await fileManager.delete(task.id);
      await expect(fileManager.load(task.id)).rejects.toThrow('not found');
    });

    it('should handle deleting non-existent task', async () => {
      await expect(fileManager.delete('non-existent-id')).resolves.not.toThrow();
    });

    it('should clear all tasks', async () => {
      const tasks = [createBasicTask(), createBasicTask(), createBasicTask()];
      await Promise.all(tasks.map(task => fileManager.save(task)));

      await fileManager.clear();
      const ids = await fileManager.list();
      expect(ids).toHaveLength(0);
    });
  });
});
