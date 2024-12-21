import { Task, TaskStatus } from '../../../types/task.js';
import { ErrorCodes, createError } from '../../../errors/index.js';
import { BatchProgressCallback, BatchResult } from '../../../types/batch.js';
import { DependencyAwareBatchProcessor } from './dependency-aware-batch-processor.js';

/**
 * Specialized batch processor for handling task status updates.
 * Extends DependencyAwareBatchProcessor to handle task-specific dependencies.
 * Uses types defined in src/types/batch.ts and src/types/task.ts.
 */
export class TaskStatusBatchProcessor extends DependencyAwareBatchProcessor<Task> {
    /**
     * Process a batch of task status updates
     * @see BatchProcessor in src/types/batch.ts
     */
    override async processBatch(
        tasks: Task[],
        operation: (item: Task) => Promise<void>,
        progressCallback?: BatchProgressCallback
    ): Promise<BatchResult> {
        if (!tasks.length) {
            return {
                success: true,
                processedCount: 0,
                failedCount: 0,
                errors: []
            };
        }

        try {
            // Calculate status updates
            const updates = this.calculateStatusUpdates(tasks);

            // Apply updates
            let processedCount = 0;
            const errors: BatchResult['errors'] = [];

            for (const update of updates) {
                try {
                    await operation(update);
                    processedCount++;

                    if (progressCallback?.onOperationComplete) {
                        progressCallback.onOperationComplete(processedCount, updates.length);
                    }
                } catch (error) {
                    errors.push({
                        item: update,
                        error: error instanceof Error ? error : new Error(String(error)),
                        context: {
                            batchSize: updates.length,
                            currentIndex: processedCount,
                            processedCount,
                            failureReason: 'Status update failed'
                        }
                    });
                }
            }

            this.logger.debug('Batch status updates processed', {
                taskCount: tasks.length,
                updateCount: updates.length,
                processedCount,
                errorCount: errors.length
            });

            return {
                success: errors.length === 0,
                processedCount,
                failedCount: errors.length,
                errors
            };
        } catch (error) {
            this.logger.error('Failed to process task status batch', { error });
            return {
                success: false,
                processedCount: 0,
                failedCount: tasks.length,
                errors: [{
                    item: tasks,
                    error: error instanceof Error ? error : new Error(String(error)),
                    context: {
                        batchSize: tasks.length,
                        currentIndex: 0,
                        processedCount: 0,
                        failureReason: 'Batch processing failed'
                    }
                }]
            };
        }
    }

    /**
     * Calculates required status updates based on task dependencies
     */
    private calculateStatusUpdates(tasks: Task[]): Task[] {
        const updates: Task[] = [];
        const taskMap = new Map(tasks.map(t => [t.path, t]));

        for (const task of tasks) {
            const newStatus = this.calculateTaskStatus(task, taskMap);
            if (newStatus !== task.status) {
                updates.push({
                    ...task,
                    status: newStatus
                });
            }
        }

        return updates;
    }

    /**
     * Calculates status for a single task based on its dependencies
     */
    private calculateTaskStatus(
        task: Task,
        taskMap: Map<string, Task>
    ): TaskStatus {
        // Check dependencies
        if (!task.dependencies?.length) {
            return task.status;
        }

        // Check if any dependencies are blocked or failed
        for (const depPath of task.dependencies) {
            const depTask = taskMap.get(depPath);
            if (!depTask) continue;

            if (depTask.status === TaskStatus.BLOCKED || 
                depTask.status === TaskStatus.FAILED) {
                return TaskStatus.BLOCKED;
            }
        }

        // Check if all dependencies are completed
        const allCompleted = task.dependencies.every(depPath => {
            const depTask = taskMap.get(depPath);
            return depTask?.status === TaskStatus.COMPLETED;
        });

        if (!allCompleted) {
            return TaskStatus.BLOCKED;
        }

        return task.status;
    }

    /**
     * Pre-validate batch items
     * @see DependencyAwareBatchProcessor in src/task/core/batch/dependency-aware-batch-processor.ts
     */
    protected override async preValidateBatch(batch: Task[]): Promise<void> {
        await super.preValidateBatch(batch);

        // Validate task statuses
        const invalidTasks = batch.filter(task => 
            !Object.values(TaskStatus).includes(task.status)
        );

        if (invalidTasks.length > 0) {
            throw createError(
                ErrorCodes.INVALID_INPUT,
                {
                    message: 'Tasks have invalid status values',
                    context: { tasks: invalidTasks }
                },
                'All tasks must have valid status values'
            );
        }
    }
}
