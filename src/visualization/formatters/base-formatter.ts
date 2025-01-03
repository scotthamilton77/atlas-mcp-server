import { Task } from '../../types/task.js';

/**
 * Base formatter interface for task visualization
 */
export interface TaskFormatter {
  format(tasks: Task[]): string;
}

/**
 * Base formatter implementation with common utilities
 */
export abstract class BaseFormatter implements TaskFormatter {
  /**
   * Format tasks into string representation
   */
  abstract format(tasks: Task[]): string;

  /**
   * Build task hierarchy from flat list
   */
  protected buildHierarchy(tasks: Task[]): Map<string, Task[]> {
    const hierarchy = new Map<string, Task[]>();

    // Group tasks by parent path
    tasks.forEach(task => {
      const parentPath = task.parentPath || '';
      if (!hierarchy.has(parentPath)) {
        hierarchy.set(parentPath, []);
      }
      hierarchy.get(parentPath)!.push(task);
    });

    return hierarchy;
  }

  /**
   * Sort tasks by path and status
   */
  protected sortTasks(tasks: Task[]): Task[] {
    return [...tasks].sort((a, b) => {
      // First sort by path depth (root tasks first)
      const aDepth = (a.path.match(/\//g) || []).length;
      const bDepth = (b.path.match(/\//g) || []).length;
      if (aDepth !== bDepth) return aDepth - bDepth;

      // Then sort by path alphabetically
      if (a.path !== b.path) return a.path.localeCompare(b.path);

      // Finally sort by status
      return a.status.localeCompare(b.status);
    });
  }

  /**
   * Get task progress value based on status
   */
  protected getTaskProgress(task: Task): number {
    switch (task.status) {
      case 'COMPLETED':
        return 100;
      case 'IN_PROGRESS':
        return 50;
      case 'BLOCKED':
        return 25;
      case 'PENDING':
      case 'CANCELLED':
      default:
        return 0;
    }
  }

  /**
   * Format date for display
   */
  protected formatDate(date: string | number): string {
    return new Date(date).toLocaleString();
  }

  /**
   * Get status emoji
   */
  protected getStatusEmoji(status: string): string {
    switch (status) {
      case 'PENDING':
        return '⏳';
      case 'IN_PROGRESS':
        return '🔄';
      case 'COMPLETED':
        return '✅';
      case 'BLOCKED':
        return '🚫';
      case 'CANCELLED':
        return '❌';
      default:
        return '❔';
    }
  }
}
