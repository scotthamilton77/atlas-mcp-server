import { Logger } from '../../../logging/index.js';
import { Task, TaskStatus } from '../../../types/task.js';

/**
 * Task index entry
 */
interface TaskIndexEntry {
  id: string;
  path: string;
  name: string;
  type: string;
  status: TaskStatus;
  parentPath?: string;
  dependencies: string[];
  metadata: Record<string, unknown>;
  lastUpdated: string;
}

/**
 * Task index manager
 */
export class TaskIndexManager {
  private readonly logger: Logger;
  private readonly index: Map<string, TaskIndexEntry>;

  constructor() {
    this.logger = Logger.getInstance().child({ component: 'TaskIndexManager' });
    this.index = new Map();
  }

  /**
   * Index a task
   */
  async indexTask(task: Task): Promise<void> {
    try {
      this.index.set(task.path, {
        id: task.id,
        path: task.path,
        name: task.name,
        type: task.type,
        status: task.status,
        parentPath: task.parentPath,
        dependencies: task.dependencies,
        metadata: task.metadata,
        lastUpdated: task.updated,
      });

      this.logger.debug('Task indexed', { path: task.path });
    } catch (error) {
      this.logger.error('Failed to index task', {
        error,
        context: { path: task.path },
      });
    }
  }

  /**
   * Remove task from index
   */
  async removeTask(path: string): Promise<void> {
    try {
      this.index.delete(path);
      this.logger.debug('Task removed from index', { path });
    } catch (error) {
      this.logger.error('Failed to remove task from index', {
        error,
        context: { path },
      });
    }
  }

  /**
   * Clear index
   */
  async clearIndex(): Promise<void> {
    try {
      this.index.clear();
      this.logger.debug('Index cleared');
    } catch (error) {
      this.logger.error('Failed to clear index', { error });
    }
  }

  /**
   * Get task from index
   */
  getTask(path: string): TaskIndexEntry | null {
    return this.index.get(path) || null;
  }

  /**
   * Get tasks by pattern
   */
  getTasksByPattern(pattern: string): TaskIndexEntry[] {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return Array.from(this.index.values()).filter(entry => regex.test(entry.path));
  }

  /**
   * Get tasks by status
   */
  getTasksByStatus(status: TaskStatus): TaskIndexEntry[] {
    return Array.from(this.index.values()).filter(entry => entry.status === status);
  }

  /**
   * Get child tasks
   */
  getChildren(parentPath: string): TaskIndexEntry[] {
    return Array.from(this.index.values()).filter(entry => entry.parentPath === parentPath);
  }

  /**
   * Get dependent tasks
   */
  getDependentTasks(path: string): TaskIndexEntry[] {
    return Array.from(this.index.values()).filter(entry => entry.dependencies.includes(path));
  }

  /**
   * Get index metrics
   */
  getMetrics(): {
    totalTasks: number;
    byStatus: Record<TaskStatus, number>;
    byType: Record<string, number>;
    dependencyCount: number;
  } {
    const tasks = Array.from(this.index.values());
    const byStatus = tasks.reduce(
      (acc, task) => {
        acc[task.status] = (acc[task.status] || 0) + 1;
        return acc;
      },
      {} as Record<TaskStatus, number>
    );

    const byType = tasks.reduce(
      (acc, task) => {
        acc[task.type] = (acc[task.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const dependencyCount = tasks.reduce((acc, task) => acc + task.dependencies.length, 0);

    return {
      totalTasks: tasks.length,
      byStatus,
      byType,
      dependencyCount,
    };
  }
}
