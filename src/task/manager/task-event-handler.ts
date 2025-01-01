import { Task, TaskStatus } from '../../types/task.js';
import { EventManager } from '../../events/event-manager.js';
import { EventTypes } from '../../types/events.js';

import { TaskStatusMetadata, TaskDependencyMetadata } from '../../types/events.js';

type TaskEventCallback = (
  task?: Task,
  metadata?: TaskStatusMetadata | TaskDependencyMetadata | Record<string, unknown>
) => Promise<void>;

export class TaskEventHandler {
  private readonly eventManager: EventManager;
  private readonly handlers: Map<string, Set<TaskEventCallback>>;

  constructor() {
    this.eventManager = EventManager.getInstance();
    this.handlers = new Map();
  }

  /**
   * Subscribe to task events
   */
  subscribe(
    event: 'created' | 'updated' | 'deleted' | 'cleared',
    handler: TaskEventCallback
  ): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)?.add(handler);
  }

  /**
   * Unsubscribe from task events
   */
  unsubscribe(
    event: 'created' | 'updated' | 'deleted' | 'cleared',
    handler: TaskEventCallback
  ): void {
    this.handlers.get(event)?.delete(handler);
  }

  /**
   * Emit task created event
   */
  async emitTaskCreated(task: Task): Promise<void> {
    this.eventManager.emitTaskEvent({
      type: EventTypes.TASK_CREATED,
      timestamp: Date.now(),
      taskId: task.id,
      task,
    });

    const handlers = this.handlers.get('created');
    if (handlers) {
      await Promise.all(Array.from(handlers).map(handler => handler(task)));
    }
  }

  /**
   * Emit task updated event
   */
  async emitTaskUpdated(task: Task): Promise<void> {
    this.eventManager.emitTaskEvent({
      type: EventTypes.TASK_UPDATED,
      timestamp: Date.now(),
      taskId: task.id,
      task,
    });

    const handlers = this.handlers.get('updated');
    if (handlers) {
      await Promise.all(Array.from(handlers).map(handler => handler(task)));
    }
  }

  /**
   * Emit task deleted event
   */
  async emitTaskDeleted(task: Task): Promise<void> {
    this.eventManager.emitTaskEvent({
      type: EventTypes.TASK_DELETED,
      timestamp: Date.now(),
      taskId: task.id,
      task,
    });

    const handlers = this.handlers.get('deleted');
    if (handlers) {
      await Promise.all(Array.from(handlers).map(handler => handler(task)));
    }
  }

  /**
   * Emit all tasks cleared event
   */
  async emitAllTasksCleared(): Promise<void> {
    this.eventManager.emitTaskEvent({
      type: EventTypes.CACHE_CLEARED, // Using CACHE_CLEARED as a substitute for ALL_TASKS_CLEARED
      timestamp: Date.now(),
      taskId: 'all',
      task: {} as Task, // Empty task object for system-wide events
    });

    const handlers = this.handlers.get('cleared');
    if (handlers) {
      await Promise.all(Array.from(handlers).map(handler => handler()));
    }
  }

  /**
   * Emit task status changed event
   */
  async emitTaskStatusChanged(
    task: Task,
    oldStatus: TaskStatus,
    newStatus: TaskStatus,
    metadata?: TaskStatusMetadata
  ): Promise<void> {
    this.eventManager.emitTaskEvent({
      type: EventTypes.TASK_STATUS_CHANGED,
      timestamp: Date.now(),
      taskId: task.id,
      task,
      changes: {
        before: { status: oldStatus },
        after: { status: newStatus },
      },
      metadata,
    });

    const handlers = this.handlers.get('updated');
    if (handlers) {
      await Promise.all(Array.from(handlers).map(handler => handler(task, metadata)));
    }
  }

  /**
   * Emit task dependencies changed event
   */
  async emitTaskDependenciesChanged(task: Task, metadata: TaskDependencyMetadata): Promise<void> {
    this.eventManager.emitTaskEvent({
      type: EventTypes.TASK_DEPENDENCIES_CHANGED,
      timestamp: Date.now(),
      taskId: task.id,
      task,
      metadata,
    });

    const handlers = this.handlers.get('updated');
    if (handlers) {
      await Promise.all(Array.from(handlers).map(handler => handler(task, metadata)));
    }
  }

  /**
   * Emit parent status propagation event
   */
  async emitParentStatusPropagation(
    task: Task,
    oldStatus: TaskStatus,
    newStatus: TaskStatus,
    childrenPaths: string[]
  ): Promise<void> {
    await this.emitTaskStatusChanged(task, oldStatus, newStatus, {
      childrenPaths,
      oldStatus,
      newStatus,
      reason: 'children_completed',
    });
  }

  /**
   * Emit children status propagation event
   */
  async emitChildrenStatusPropagation(
    tasks: Task[],
    oldStatus: TaskStatus,
    newStatus: TaskStatus,
    parentPath: string
  ): Promise<void> {
    for (const task of tasks) {
      await this.emitTaskStatusChanged(task, oldStatus, newStatus, {
        parentPath,
        oldStatus,
        newStatus,
        reason: 'parent_update',
      });
    }
  }

  /**
   * Emit memory pressure event
   */
  emitMemoryPressure(
    memoryUsage: NodeJS.MemoryUsage,
    threshold: number,
    currentCacheSize: number,
    maxCacheSize: number
  ): void {
    const heapUsage = memoryUsage.heapUsed / memoryUsage.heapTotal;
    const cacheUsage = currentCacheSize / maxCacheSize;

    this.eventManager.emitCacheEvent({
      type: EventTypes.MEMORY_PRESSURE,
      timestamp: Date.now(),
      metadata: {
        memoryUsage: {
          heapUsed: memoryUsage.heapUsed,
          heapTotal: memoryUsage.heapTotal,
          rss: memoryUsage.rss,
          external: memoryUsage.external,
        },
        cacheUsage: {
          currentSize: currentCacheSize,
          maxSize: maxCacheSize,
          usagePercentage: Math.round(cacheUsage * 100),
        },
        pressure: {
          memoryPressure: Math.max(0, (heapUsage - 0.7) / 0.3),
          cachePressure: Math.max(0, (cacheUsage - 0.6) / 0.4),
          totalPressure:
            Math.max(0, (heapUsage - 0.7) / 0.3) * 0.6 +
            Math.max(0, (cacheUsage - 0.6) / 0.4) * 0.4,
        },
        threshold,
      },
    });
  }

  /**
   * Remove all event listeners
   */
  removeAllListeners(): void {
    this.handlers.clear();
    this.eventManager.removeAllListeners();
  }
}
