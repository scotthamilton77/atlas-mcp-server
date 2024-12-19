import fs from 'node:fs/promises';
import path from 'node:path';
import { Task } from '../../shared/types/task.js';

/**
 * Handles file-based storage operations for tasks
 */
export class FileManager {
  private readonly basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  /**
   * Initialize the storage directory
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.basePath, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to initialize storage directory: ${error}`);
    }
  }

  /**
   * Save a task to file storage
   */
  async save(task: Task): Promise<void> {
    const filePath = this.getFilePath(task.id);
    try {
      const content = JSON.stringify(task, null, 2);
      await fs.writeFile(filePath, content, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to save task ${task.id}: ${error}`);
    }
  }

  /**
   * Load a task from file storage
   */
  async load(id: string): Promise<Task> {
    const filePath = this.getFilePath(id);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as Task;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Task ${id} not found`);
      }
      throw new Error(`Failed to load task ${id}: ${error}`);
    }
  }

  /**
   * Delete a task from file storage
   */
  async delete(id: string): Promise<void> {
    const filePath = this.getFilePath(id);
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new Error(`Failed to delete task ${id}: ${error}`);
      }
    }
  }

  /**
   * Clear all tasks from file storage
   */
  async clear(): Promise<void> {
    try {
      const files = await fs.readdir(this.basePath);
      await Promise.all(
        files.map(file => fs.unlink(path.join(this.basePath, file)))
      );
    } catch (error) {
      throw new Error(`Failed to clear storage: ${error}`);
    }
  }

  /**
   * List all task IDs in storage
   */
  async list(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.basePath);
      return files.map(file => path.parse(file).name);
    } catch (error) {
      throw new Error(`Failed to list tasks: ${error}`);
    }
  }

  /**
   * Create a backup of the storage directory
   */
  async backup(backupPath: string): Promise<void> {
    try {
      await fs.mkdir(backupPath, { recursive: true });
      const files = await fs.readdir(this.basePath);
      await Promise.all(
        files.map(async file => {
          const sourcePath = path.join(this.basePath, file);
          const targetPath = path.join(backupPath, file);
          await fs.copyFile(sourcePath, targetPath);
        })
      );
    } catch (error) {
      throw new Error(`Failed to create backup: ${error}`);
    }
  }

  /**
   * Restore from a backup directory
   */
  async restore(backupPath: string): Promise<void> {
    try {
      await this.clear();
      const files = await fs.readdir(backupPath);
      await Promise.all(
        files.map(async file => {
          const sourcePath = path.join(backupPath, file);
          const targetPath = path.join(this.basePath, file);
          await fs.copyFile(sourcePath, targetPath);
        })
      );
    } catch (error) {
      throw new Error(`Failed to restore from backup: ${error}`);
    }
  }

  /**
   * Get the full file path for a task ID
   */
  private getFilePath(id: string): string {
    return path.join(this.basePath, `${id}.json`);
  }
}
