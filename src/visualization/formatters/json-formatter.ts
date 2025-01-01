import { Task, TaskMetadata } from '../../types/task.js';
import { BaseFormatter } from './base-formatter.js';

interface TaskSummary {
  totalTasks: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
}

interface TaskNode {
  id: string;
  path: string;
  name: string;
  type: string;
  status: string;
  progress: number;
  description?: string;
  dependencies: string[];
  metadata: TaskMetadata;
  children: TaskNode[];
  notes: {
    planning: string[];
    progress: string[];
    completion: string[];
    troubleshooting: string[];
  };
  created: string;
  updated: string;
}

/**
 * Formats tasks as a structured JSON document
 */
export class JsonFormatter extends BaseFormatter {
  format(tasks: Task[]): string {
    const sortedTasks = this.sortTasks(tasks);
    const hierarchy = this.buildHierarchy(sortedTasks);

    const output = {
      summary: this.generateSummary(tasks),
      tasks: this.buildTaskTree(hierarchy),
      metadata: {
        generatedAt: new Date().toISOString(),
        version: '1.0.0',
      },
    };

    return JSON.stringify(output, null, 2);
  }

  private generateSummary(tasks: Task[]): TaskSummary {
    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};

    tasks.forEach(task => {
      byStatus[task.status] = (byStatus[task.status] || 0) + 1;
      byType[task.type] = (byType[task.type] || 0) + 1;
    });

    return {
      totalTasks: tasks.length,
      byStatus,
      byType,
    };
  }

  private buildTaskTree(hierarchy: Map<string, Task[]>, parentPath: string = ''): TaskNode[] {
    const tasks = hierarchy.get(parentPath) || [];

    return tasks.map(task => ({
      id: task.id,
      path: task.path,
      name: task.name,
      type: task.type,
      status: task.status,
      progress: this.getTaskProgress(task),
      description: task.description,
      dependencies: task.dependencies,
      metadata: task.metadata,
      children: this.buildTaskTree(hierarchy, task.path),
      notes: {
        planning: task.planningNotes,
        progress: task.progressNotes,
        completion: task.completionNotes,
        troubleshooting: task.troubleshootingNotes,
      },
      created: task.created,
      updated: task.updated,
    }));
  }
}
