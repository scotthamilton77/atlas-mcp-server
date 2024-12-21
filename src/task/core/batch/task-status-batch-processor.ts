/**
 * Path-based task status batch processor
 */
import { Task, TaskStatus } from '../../../types/task.js';
import { ErrorCodes, createError } from '../../../errors/index.js';
import { Logger } from '../../../logging/index.js';
import { BatchProcessor, BatchResult } from './batch-types.js';

interface StatusUpdate {
    taskPath: string;
    newStatus: TaskStatus;
}

export class TaskStatusBatchProcessor implements BatchProcessor {
    private logger: Logger;

    constructor() {
        this.logger = Logger.getInstance().child({ component: 'TaskStatusBatchProcessor' });
    }

    /**
     * Processes a batch of task status updates
     */
    async processBatch<T>(tasks: T[], operation: (item: T) => Promise<void>): Promise<BatchResult> {
        if (!tasks.length) {
            return {
                success: true,
                processedCount: 0,
                failedCount: 0,
                errors: []
            };
        }

        try {
            if (!this.isTaskArray(tasks)) {
                throw createError(
                    ErrorCodes.INVALID_INPUT,
                    'Invalid batch input: expected Task array'
                );
            }

            // Build dependency graph
            const graph = this.buildDependencyGraph(tasks);

            // Check for cycles
            this.checkForCycles(graph, tasks);

            // Calculate status updates
            const updates = this.calculateStatusUpdates(tasks, graph);

            // Apply updates
            let processedCount = 0;
            const errors: BatchResult['errors'] = [];

            for (const update of updates) {
                try {
                    await operation(update as T);
                    processedCount++;
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
     * Process items in batches
     */
    async processInBatches<T>(
        items: T[],
        batchSize: number,
        operation: (item: T) => Promise<void>
    ): Promise<BatchResult> {
        const results: BatchResult[] = [];
        
        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            const result = await this.processBatch(batch, operation);
            results.push(result);
        }

        return {
            success: results.every(r => r.success),
            processedCount: results.reduce((sum, r) => sum + r.processedCount, 0),
            failedCount: results.reduce((sum, r) => sum + r.failedCount, 0),
            errors: results.flatMap(r => r.errors)
        };
    }

    /**
     * Type guard for Task array
     */
    private isTaskArray(items: unknown[]): items is Task[] {
        return items.every(item => 
            typeof item === 'object' && 
            item !== null && 
            'path' in item &&
            'status' in item &&
            'dependencies' in item
        );
    }

    /**
     * Builds a dependency graph from tasks
     */
    private buildDependencyGraph(tasks: Task[]): Map<string, Set<string>> {
        const graph = new Map<string, Set<string>>();

        for (const task of tasks) {
            graph.set(task.path, new Set(task.dependencies));
        }

        return graph;
    }

    /**
     * Checks for dependency cycles
     */
    private checkForCycles(graph: Map<string, Set<string>>, tasks: Task[]): void {
        const visited = new Set<string>();
        const recursionStack = new Set<string>();

        const visit = (taskPath: string, path: string[] = []): void => {
            if (recursionStack.has(taskPath)) {
                throw createError(
                    ErrorCodes.TASK_CYCLE,
                    `Dependency cycle detected: ${[...path.slice(path.indexOf(taskPath)), taskPath].join(' -> ')}`
                );
            }

            if (visited.has(taskPath)) {
                return;
            }

            visited.add(taskPath);
            recursionStack.add(taskPath);

            const dependencies = graph.get(taskPath) || new Set();
            for (const dep of dependencies) {
                visit(dep, [...path, taskPath]);
            }

            recursionStack.delete(taskPath);
        };

        for (const task of tasks) {
            if (!visited.has(task.path)) {
                visit(task.path);
            }
        }
    }

    /**
     * Calculates required status updates
     */
    private calculateStatusUpdates(
        tasks: Task[],
        graph: Map<string, Set<string>>
    ): StatusUpdate[] {
        const updates: StatusUpdate[] = [];
        const taskMap = new Map(tasks.map(t => [t.path, t]));

        for (const task of tasks) {
            const newStatus = this.calculateTaskStatus(task, taskMap, graph);
            if (newStatus !== task.status) {
                updates.push({ taskPath: task.path, newStatus });
            }
        }

        return updates;
    }

    /**
     * Calculates status for a single task
     */
    private calculateTaskStatus(
        task: Task,
        taskMap: Map<string, Task>,
        graph: Map<string, Set<string>>
    ): TaskStatus {
        // Check dependencies
        const dependencies = graph.get(task.path) || new Set();
        if (dependencies.size === 0) {
            return task.status;
        }

        // Check if any dependencies are blocked or failed
        for (const depPath of dependencies) {
            const depTask = taskMap.get(depPath);
            if (!depTask) continue;

            if (depTask.status === TaskStatus.BLOCKED || 
                depTask.status === TaskStatus.FAILED) {
                return TaskStatus.BLOCKED;
            }
        }

        // Check if all dependencies are completed
        const allCompleted = Array.from(dependencies).every(depPath => {
            const depTask = taskMap.get(depPath);
            return depTask?.status === TaskStatus.COMPLETED;
        });

        if (!allCompleted) {
            return TaskStatus.BLOCKED;
        }

        return task.status;
    }
}
