import { Task, TaskStatus } from '../../../types/task.js';
import { StatusManager } from '../status-manager.js';
import { TaskBatchProcessor } from './batch-processor.js';
import { BatchResult, BatchProgressCallback } from './batch-types.js';
import { Logger } from '../../../logging/index.js';
import { TaskError, ErrorCodes } from '../../../errors/index.js';

interface TaskStatusUpdate {
    taskId: string;
    newStatus: TaskStatus;
}

/**
 * Specialized batch processor for task status updates that ensures proper validation
 * and maintains status transition rules across batch operations.
 */
export class TaskStatusBatchProcessor {
    private statusManager: StatusManager;
    private batchProcessor: TaskBatchProcessor;
    private logger: Logger;

    constructor() {
        this.statusManager = new StatusManager();
        this.batchProcessor = new TaskBatchProcessor();
        this.logger = Logger.getInstance().child({ component: 'TaskStatusBatchProcessor' });
    }

    /**
     * Updates status for multiple tasks with proper validation
     */
    async updateTaskStatuses(
        updates: TaskStatusUpdate[],
        getTaskById: (id: string) => Task | null,
        updateTask: (taskId: string, updates: { status: TaskStatus }) => Promise<void>,
        progressCallback?: BatchProgressCallback
    ): Promise<BatchResult> {
        // Create operation that includes validation
        const operation = async (update: TaskStatusUpdate) => {
            const task = getTaskById(update.taskId);
            if (!task) {
                throw new TaskError(
                    ErrorCodes.TASK_NOT_FOUND,
                    'Task not found',
                    { taskId: update.taskId }
                );
            }

            // Validate and process the status change
            await this.statusManager.validateAndProcessStatusChange(
                task,
                update.newStatus,
                getTaskById,
                updateTask
            );
        };

        // Process updates in small batches to maintain consistency
        return this.batchProcessor.processInBatches(
            updates,
            10, // Small batch size for better control
            operation,
            progressCallback
        );
    }

    /**
     * Updates status for tasks in a hierarchy, maintaining parent-child relationships
     */
    async updateHierarchicalTaskStatuses(
        rootTaskId: string,
        newStatus: TaskStatus,
        getTaskById: (id: string) => Task | null,
        updateTask: (taskId: string, updates: { status: TaskStatus }) => Promise<void>,
        progressCallback?: BatchProgressCallback
    ): Promise<BatchResult> {
        const rootTask = getTaskById(rootTaskId);
        if (!rootTask) {
            throw new TaskError(
                ErrorCodes.TASK_NOT_FOUND,
                'Root task not found',
                { taskId: rootTaskId }
            );
        }

        // Collect all tasks in the hierarchy
        const updates: TaskStatusUpdate[] = [];
        const collectTasks = (task: Task) => {
            updates.push({ taskId: task.id, newStatus });
            task.subtasks
                .map(id => getTaskById(id))
                .filter((t): t is Task => t !== null)
                .forEach(collectTasks);
        };
        collectTasks(rootTask);

        // Sort updates to process leaf nodes first
        const taskDepths = new Map<string, number>();
        const getTaskDepth = (taskId: string, depth = 0): number => {
            if (taskDepths.has(taskId)) {
                return taskDepths.get(taskId)!;
            }
            const task = getTaskById(taskId);
            if (!task) {
                return depth;
            }
            const maxSubtaskDepth = Math.max(
                0,
                ...task.subtasks.map(id => getTaskDepth(id, depth + 1))
            );
            taskDepths.set(taskId, maxSubtaskDepth);
            return maxSubtaskDepth;
        };

        updates.sort((a, b) => {
            const depthA = getTaskDepth(a.taskId);
            const depthB = getTaskDepth(b.taskId);
            return depthB - depthA; // Process deeper nodes first
        });

        return this.updateTaskStatuses(updates, getTaskById, updateTask, progressCallback);
    }

    /**
     * Updates status for tasks with dependencies, maintaining dependency order
     */
    async updateDependentTaskStatuses(
        taskIds: string[],
        newStatus: TaskStatus,
        getTaskById: (id: string) => Task | null,
        updateTask: (taskId: string, updates: { status: TaskStatus }) => Promise<void>,
        progressCallback?: BatchProgressCallback
    ): Promise<BatchResult> {
        // Build dependency graph
        const graph = new Map<string, Set<string>>();
        const tasks = taskIds
            .map(id => getTaskById(id))
            .filter((t): t is Task => t !== null);

        tasks.forEach(task => {
            graph.set(task.id, new Set(task.dependencies));
        });

        // Topologically sort tasks
        const sorted: string[] = [];
        const visited = new Set<string>();
        const temp = new Set<string>();

        const visit = (taskId: string) => {
            if (temp.has(taskId)) {
                throw new TaskError(
                    ErrorCodes.TASK_CYCLE,
                    'Circular dependency detected',
                    { taskId, suggestion: 'Review task dependencies to remove cycles' }
                );
            }
            if (visited.has(taskId)) {
                return;
            }
            temp.add(taskId);
            const dependencies = graph.get(taskId) || new Set();
            for (const depId of dependencies) {
                visit(depId);
            }
            temp.delete(taskId);
            visited.add(taskId);
            sorted.unshift(taskId);
        };

        for (const task of tasks) {
            if (!visited.has(task.id)) {
                visit(task.id);
            }
        }

        // Create updates in dependency order
        const updates = sorted.map(taskId => ({
            taskId,
            newStatus
        }));

        return this.updateTaskStatuses(updates, getTaskById, updateTask, progressCallback);
    }
}
