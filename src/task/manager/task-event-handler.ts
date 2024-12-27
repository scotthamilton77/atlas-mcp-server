import { Task, TaskStatus } from '../../types/task.js';
import { EventManager } from '../../events/event-manager.js';
import { EventTypes } from '../../types/events.js';

export class TaskEventHandler {
    private readonly eventManager: EventManager;

    constructor() {
        this.eventManager = EventManager.getInstance();
    }

    emitTaskCreated(taskId: string, task: Task, metadata: Record<string, any> = {}) {
        this.eventManager.emitTaskEvent({
            type: EventTypes.TASK_CREATED,
            timestamp: Date.now(),
            taskId,
            task,
            metadata
        });
    }

    emitTaskUpdated(taskId: string, task: Task, oldTask: Task, metadata: Record<string, any> = {}) {
        this.eventManager.emitTaskEvent({
            type: EventTypes.TASK_UPDATED,
            timestamp: Date.now(),
            taskId,
            task,
            changes: {
                before: oldTask,
                after: task
            },
            metadata
        });

        // Emit status change event if status was updated
        if (oldTask.status !== task.status) {
            this.emitTaskStatusChanged(taskId, task, oldTask.status, task.status);
        }
    }

    emitTaskDeleted(taskId: string, task: Task, metadata: Record<string, any> = {}) {
        this.eventManager.emitTaskEvent({
            type: EventTypes.TASK_DELETED,
            timestamp: Date.now(),
            taskId,
            task,
            metadata
        });
    }

    emitTaskStatusChanged(taskId: string, task: Task, oldStatus: TaskStatus, newStatus: TaskStatus) {
        this.eventManager.emitTaskEvent({
            type: EventTypes.TASK_STATUS_CHANGED,
            timestamp: Date.now(),
            taskId,
            task,
            changes: {
                before: { status: oldStatus },
                after: { status: newStatus }
            }
        });
    }

    emitMemoryPressure(memoryUsage: NodeJS.MemoryUsage, threshold: number) {
        this.eventManager.emitCacheEvent({
            type: EventTypes.MEMORY_PRESSURE,
            timestamp: Date.now(),
            metadata: {
                memoryUsage,
                threshold
            }
        });
    }

    removeAllListeners() {
        this.eventManager.removeAllListeners();
    }
}
