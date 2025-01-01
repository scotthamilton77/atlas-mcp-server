import { Resource } from '@modelcontextprotocol/sdk/types.js';
import { Task, TaskStatus } from '../../types/task.js';
import { Logger } from '../../logging/index.js';
import { TaskStorage } from '../../types/storage.js';
import { ResourceCacheManager } from './cache/resource-cache-manager.js';

export class TaskResourceHandler {
  private static instance: TaskResourceHandler;
  private readonly logger: Logger;
  private readonly storage: TaskStorage;
  private readonly cacheManager: ResourceCacheManager;

  private constructor(storage: TaskStorage) {
    this.storage = storage;
    this.cacheManager = new ResourceCacheManager();
    this.logger = Logger.getInstance().child({ component: 'TaskResourceHandler' });
  }

  public static getInstance(storage: TaskStorage): TaskResourceHandler {
    if (!TaskResourceHandler.instance) {
      TaskResourceHandler.instance = new TaskResourceHandler(storage);
    }
    return TaskResourceHandler.instance;
  }

  /**
   * Get task content as a resource
   * @param uri Resource URI in format task://[task-path]/content or tasklist://current
   * @returns Resource containing task content
   */
  public async getTaskResource(uri: string): Promise<Resource> {
    // Handle tasklist resource
    if (uri === 'tasklist://current') {
      return this.getCurrentTaskListResource();
    }

    try {
      const taskPath = this.parseTaskPath(uri);
      const cacheKey = `task-resource:${taskPath}`;

      // Try to get from cache first
      const cached = this.cacheManager.get(cacheKey);
      if (cached) {
        this.logger.debug('Returning cached task resource', { taskPath });
        return cached;
      }

      // Get task from storage
      const task = await this.storage.getTask(taskPath);
      if (!task) {
        throw new Error(`Task not found: ${taskPath}`);
      }

      // Convert task to resource
      const resource = this.taskToResource(task, uri);

      // Cache the resource
      this.cacheManager.set(cacheKey, resource);

      return resource;
    } catch (error) {
      this.logger.error('Failed to get task resource:', {
        uri,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * List all available task resources
   * @returns Array of task resources
   */
  public async listTaskResources(): Promise<Resource[]> {
    return [
      {
        uri: 'tasklist://current',
        name: 'Current Task List Overview',
        mimeType: 'application/json',
        description:
          'Dynamic overview of all tasks including status counts, recent updates, and metrics. Updates in real-time when accessed.',
      },
    ];
  }

  /**
   * Invalidate cache for a task resource
   * @param taskPath Path of the task to invalidate
   */
  public async invalidateCache(taskPath: string): Promise<void> {
    const cacheKey = `task-resource:${taskPath}`;
    await this.cacheManager.delete(cacheKey);
  }

  /**
   * Parse task path from resource URI
   * @param uri Resource URI
   * @returns Task path
   */
  private parseTaskPath(uri: string): string {
    const match = uri.match(/^task:\/\/([^/]+(?:\/[^/]+)*?)\/content$/);
    if (!match) {
      throw new Error(`Invalid task resource URI: ${uri}`);
    }
    return match[1];
  }

  /**
   * Get current task list overview as a resource
   * @returns Resource containing task list overview
   */
  private async getCurrentTaskListResource(): Promise<Resource> {
    try {
      // Get all tasks
      const tasks = await this.storage.getTasksByPattern('*');

      // Calculate task counts by status
      const statusCounts: Record<string, number> = {};
      const recentlyUpdated: Task[] = [];
      const now = Date.now();
      const ONE_DAY = 24 * 60 * 60 * 1000;

      tasks.forEach(task => {
        // Count by status
        statusCounts[task.status] = (statusCounts[task.status] || 0) + 1;

        // Track recently updated tasks (last 24 hours)
        const taskUpdated = task.updated ? Number(task.updated) : 0;
        if (taskUpdated && now - taskUpdated < ONE_DAY) {
          recentlyUpdated.push(task);
        }
      });

      // Sort recently updated tasks by update time
      recentlyUpdated.sort((a, b) => {
        const aUpdated = a.updated ? Number(a.updated) : 0;
        const bUpdated = b.updated ? Number(b.updated) : 0;
        return bUpdated - aUpdated;
      });

      // Group tasks by their top-level path component
      const topLevelGroups: Record<string, Task[]> = {};
      tasks.forEach(task => {
        const topLevel = task.path.split('/')[0];
        if (!topLevelGroups[topLevel]) {
          topLevelGroups[topLevel] = [];
        }
        topLevelGroups[topLevel].push(task);
      });

      // Calculate metrics for each top-level group
      const topLevelOverview = Object.entries(topLevelGroups)
        .map(([group, groupTasks]) => {
          const groupStatusCounts: Record<string, number> = {};
          groupTasks.forEach(task => {
            groupStatusCounts[task.status] = (groupStatusCounts[task.status] || 0) + 1;
          });

          return {
            name: group,
            totalTasks: groupTasks.length,
            statusBreakdown: groupStatusCounts,
            progress: {
              completed: ((groupStatusCounts[TaskStatus.COMPLETED] || 0) / groupTasks.length) * 100,
              blocked: ((groupStatusCounts[TaskStatus.BLOCKED] || 0) / groupTasks.length) * 100,
              inProgress:
                ((groupStatusCounts[TaskStatus.IN_PROGRESS] || 0) / groupTasks.length) * 100,
            },
            recentActivity:
              groupTasks.filter(t => t.updated && now - Number(t.updated) < ONE_DAY).length > 0,
          };
        })
        .sort((a, b) => b.totalTasks - a.totalTasks);

      const overview = {
        timestamp: new Date().toISOString(),
        summary: {
          totalTasks: tasks.length,
          statusBreakdown: statusCounts,
          topLevelProjects: topLevelOverview,
        },
        recentActivity: {
          last24Hours: recentlyUpdated.slice(0, 10).map(task => ({
            id: task.id,
            path: task.path,
            name: task.name,
            status: task.status,
            updated: task.updated ? new Date(Number(task.updated)).toISOString() : undefined,
          })),
        },
        metrics: {
          tasksWithDependencies: tasks.filter(t => (t.dependencies?.length || 0) > 0).length,
          tasksWithNotes: tasks.filter(
            t =>
              (t.planningNotes?.length || 0) +
                (t.progressNotes?.length || 0) +
                (t.completionNotes?.length || 0) +
                (t.troubleshootingNotes?.length || 0) >
              0
          ).length,
          averageDependenciesPerTask:
            tasks.length > 0
              ? tasks.reduce((acc, t) => acc + (t.dependencies?.length || 0), 0) / tasks.length
              : 0,
          projectMetrics: {
            totalProjects: Object.keys(topLevelGroups).length,
            activeProjects: topLevelOverview.filter(
              p =>
                p.statusBreakdown[TaskStatus.IN_PROGRESS] || p.statusBreakdown[TaskStatus.PENDING]
            ).length,
            completedProjects: topLevelOverview.filter(
              p => p.totalTasks === (p.statusBreakdown[TaskStatus.COMPLETED] || 0)
            ).length,
          },
        },
      };

      return {
        uri: 'tasklist://current',
        name: 'Current Task List Overview',
        mimeType: 'application/json',
        text: JSON.stringify(overview, null, 2),
      };
    } catch (error) {
      this.logger.error('Failed to generate task list overview:', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Convert a task to a resource
   * @param task Task to convert
   * @param uri Resource URI
   * @returns Resource containing task content
   */
  private taskToResource(task: Task, uri: string): Resource {
    return {
      uri,
      name: `Task: ${task.name}`,
      mimeType: 'application/json',
      text: JSON.stringify(
        {
          id: task.id,
          path: task.path,
          name: task.name,
          type: task.type,
          status: task.status,
          description: task.description,
          created: task.created,
          updated: task.updated,
          version: task.version,
          projectPath: task.projectPath,
          parentPath: task.parentPath,
          dependencies: task.dependencies,
          metadata: task.metadata,
          statusMetadata: task.statusMetadata,
          planningNotes: task.planningNotes,
          progressNotes: task.progressNotes,
          completionNotes: task.completionNotes,
          troubleshootingNotes: task.troubleshootingNotes,
        },
        null,
        2
      ),
    };
  }
}
