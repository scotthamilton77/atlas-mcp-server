import { Task } from '../../shared/types/task.js';

/**
 * Manages in-memory storage of tasks with LRU caching
 */
export class MemoryManager {
  private tasks: Map<string, Task>;
  private accessOrder: string[];
  private readonly maxSize: number;

  constructor(maxSize = 1000) {
    this.tasks = new Map();
    this.accessOrder = [];
    this.maxSize = maxSize;
  }

  /**
   * Save a task to memory
   */
  async save(task: Task): Promise<void> {
    this.tasks.set(task.id, task);
    this.updateAccessOrder(task.id);
    this.enforceSizeLimit();
  }

  /**
   * Load a task from memory
   */
  async load(id: string): Promise<Task> {
    const task = this.tasks.get(id);
    if (!task) {
      throw new Error(`Task ${id} not found in memory`);
    }
    this.updateAccessOrder(id);
    return task;
  }

  /**
   * Delete a task from memory
   */
  async delete(id: string): Promise<void> {
    this.tasks.delete(id);
    this.accessOrder = this.accessOrder.filter(taskId => taskId !== id);
  }

  /**
   * Clear all tasks from memory
   */
  async clear(): Promise<void> {
    this.tasks.clear();
    this.accessOrder = [];
  }

  /**
   * Check if a task exists in memory
   */
  has(id: string): boolean {
    return this.tasks.has(id);
  }

  /**
   * Get all task IDs in memory
   */
  async list(): Promise<string[]> {
    return Array.from(this.tasks.keys());
  }

  /**
   * Get the number of tasks in memory
   */
  size(): number {
    return this.tasks.size;
  }

  /**
   * Update the access order for LRU caching
   */
  private updateAccessOrder(id: string): void {
    this.accessOrder = this.accessOrder.filter(taskId => taskId !== id);
    this.accessOrder.push(id);
  }

  /**
   * Enforce the size limit by removing least recently used tasks
   */
  private enforceSizeLimit(): void {
    while (this.tasks.size > this.maxSize) {
      const oldestId = this.accessOrder[0];
      this.tasks.delete(oldestId);
      this.accessOrder.shift();
    }
  }

  /**
   * Get task access statistics
   */
  getStats(): { size: number; maxSize: number } {
    return {
      size: this.tasks.size,
      maxSize: this.maxSize
    };
  }

  /**
   * Preload tasks into memory
   */
  async preload(tasks: Task[]): Promise<void> {
    for (const task of tasks) {
      await this.save(task);
    }
  }

  /**
   * Evict specific tasks from memory
   */
  async evict(ids: string[]): Promise<void> {
    for (const id of ids) {
      await this.delete(id);
    }
  }

  /**
   * Get least recently used tasks
   */
  getLRUTasks(count: number): Task[] {
    return this.accessOrder
      .slice(0, count)
      .map(id => this.tasks.get(id)!)
      .filter(Boolean);
  }

  /**
   * Get most recently used tasks
   */
  getMRUTasks(count: number): Task[] {
    return this.accessOrder
      .slice(-count)
      .map(id => this.tasks.get(id)!)
      .filter(Boolean);
  }
}
