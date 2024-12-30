import { Task, TaskStatus } from '../../types/task.js';
import { EventManager } from '../../events/event-manager.js';
import { EventTypes } from '../../types/events.js';

type TaskEventCallback = (task?: Task) => Promise<void>;

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
      task: null,
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
    newStatus: TaskStatus
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
    });
  }

  /**
   * Emit memory pressure event
   */
  emitMemoryPressure(memoryUsage: NodeJS.MemoryUsage, threshold: number): void {
    this.eventManager.emitCacheEvent({
      type: EventTypes.MEMORY_PRESSURE,
      timestamp: Date.now(),
      metadata: {
        memoryUsage,
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
