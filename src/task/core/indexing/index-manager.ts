import { Task, TaskStatus } from '../../../types/task.js';
import { Logger } from '../../../logging/index.js';
import { TaskIndex, IndexManager, IndexConfig, IndexOperationResult } from './index-types.js';
import { TaskError, ErrorCodes, createError } from '../../../errors/index.js';

const DEFAULT_CONFIG: IndexConfig = {
    batchSize: 50,
    parallelOperations: true
};

export class TaskIndexManager implements IndexManager {
    private indexes: TaskIndex;
    private logger: Logger;
    private config: IndexConfig;

    constructor(config: Partial<IndexConfig> = {}) {
        this.indexes = this.createEmptyIndex();
        this.logger = Logger.getInstance().child({ component: 'TaskIndexManager' });
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Creates an empty task index
     */
    private createEmptyIndex(): TaskIndex {
        return {
            byId: new Map(),
            byStatus: new Map(),
            byParent: new Map(),
            bySession: new Map(),
            byDependency: new Map()
        };
    }

    /**
     * Indexes a task in all relevant indexes
     */
    indexTask(task: Task): void {
        try {
            // Validate task data
            if (!task.id || !task.status || !task.metadata?.sessionId) {
                throw new Error('Invalid task data: missing required fields');
            }

            // Log task details before indexing
            this.logger.debug('Indexing task', {
                taskId: task.id,
                status: task.status,
                parentId: task.parentId,
                sessionId: task.metadata.sessionId,
                currentIndexSizes: {
                    byId: this.indexes.byId.size,
                    byStatus: this.indexes.byStatus.size,
                    byParent: this.indexes.byParent.size,
                    bySession: this.indexes.bySession.size
                }
            });

            // Index by ID
            this.indexes.byId.set(task.id, task);

            // Index by status
            if (!this.indexes.byStatus.has(task.status)) {
                this.indexes.byStatus.set(task.status, new Set());
            }
            this.indexes.byStatus.get(task.status)!.add(task.id);

            // Index by parent
            if (!this.indexes.byParent.has(task.parentId)) {
                this.indexes.byParent.set(task.parentId, new Set());
            }
            this.indexes.byParent.get(task.parentId)!.add(task.id);

            // Index by session
            if (!this.indexes.bySession.has(task.metadata.sessionId)) {
                this.indexes.bySession.set(task.metadata.sessionId, new Set());
            }
            this.indexes.bySession.get(task.metadata.sessionId)!.add(task.id);

            // Log successful indexing
            this.logger.debug('Task indexed successfully', {
                taskId: task.id,
                status: task.status,
                parentId: task.parentId,
                sessionId: task.metadata.sessionId,
                updatedIndexSizes: {
                    byId: this.indexes.byId.size,
                    byStatus: this.indexes.byStatus.size,
                    byParent: this.indexes.byParent.size,
                    bySession: this.indexes.bySession.size
                }
            });
        } catch (error) {
            this.logger.error('Failed to index task', {
                taskId: task.id,
                error
            });
            throw createError(ErrorCodes.OPERATION_FAILED, error);
        }
    }

    /**
     * Removes a task from all indexes
     */
    unindexTask(task: Task): void {
        try {
            this.indexes.byId.delete(task.id);
            this.indexes.byStatus.get(task.status)?.delete(task.id);
            this.indexes.byParent.get(task.parentId)?.delete(task.id);
            this.indexes.bySession.get(task.metadata.sessionId)?.delete(task.id);

            this.logger.debug('Task unindexed', {
                taskId: task.id
            });
        } catch (error) {
            this.logger.error('Failed to unindex task', {
                taskId: task.id,
                error
            });
            throw createError(ErrorCodes.OPERATION_FAILED, error);
        }
    }

    /**
     * Indexes task dependencies with parallel processing
     */
    async indexDependencies(task: Task): Promise<void> {
        try {
            if (this.config.parallelOperations) {
                await Promise.all(task.dependencies.map(async depId => {
                    if (!this.indexes.byDependency.has(depId)) {
                        this.indexes.byDependency.set(depId, new Set());
                    }
                    this.indexes.byDependency.get(depId)!.add(task.id);
                }));
            } else {
                for (const depId of task.dependencies) {
                    if (!this.indexes.byDependency.has(depId)) {
                        this.indexes.byDependency.set(depId, new Set());
                    }
                    this.indexes.byDependency.get(depId)!.add(task.id);
                }
            }

            this.logger.debug('Dependencies indexed', {
                taskId: task.id,
                dependencyCount: task.dependencies.length
            });
        } catch (error) {
            this.logger.error('Failed to index dependencies', {
                taskId: task.id,
                error
            });
            throw createError(ErrorCodes.OPERATION_FAILED, error);
        }
    }

    /**
     * Removes task dependencies with parallel processing
     */
    async unindexDependencies(task: Task): Promise<void> {
        try {
            const operations = [];

            // Remove task as a dependency of other tasks
            if (this.indexes.byDependency.has(task.id)) {
                const dependentIds = Array.from(this.indexes.byDependency.get(task.id)!);
                operations.push(...dependentIds.map(async dependentId => {
                    const dependentTask = this.indexes.byId.get(dependentId);
                    if (dependentTask) {
                        const updatedTask = {
                            ...dependentTask,
                            dependencies: dependentTask.dependencies.filter(id => id !== task.id)
                        };
                        this.unindexTask(dependentTask);
                        this.indexTask(updatedTask);
                    }
                }));
            }

            // Remove task's dependencies
            operations.push(...task.dependencies.map(async depId => {
                const depSet = this.indexes.byDependency.get(depId);
                if (depSet) {
                    depSet.delete(task.id);
                    if (depSet.size === 0) {
                        this.indexes.byDependency.delete(depId);
                    }
                }
            }));

            if (this.config.parallelOperations) {
                await Promise.all(operations);
            } else {
                for (const operation of operations) {
                    await operation;
                }
            }

            this.indexes.byDependency.delete(task.id);

            this.logger.debug('Dependencies unindexed', {
                taskId: task.id
            });
        } catch (error) {
            this.logger.error('Failed to unindex dependencies', {
                taskId: task.id,
                error
            });
            throw createError(ErrorCodes.OPERATION_FAILED, error);
        }
    }

    /**
     * Gets a task by ID
     */
    getTaskById(taskId: string): Task | null {
        return this.indexes.byId.get(taskId) || null;
    }

    /**
     * Gets tasks by status
     */
    getTasksByStatus(status: TaskStatus): Task[] {
        const taskIds = this.indexes.byStatus.get(status) || new Set();
        return Array.from(taskIds)
            .map(id => this.getTaskById(id))
            .filter((t): t is Task => t !== null);
    }

    /**
     * Gets tasks by parent ID
     */
    getTasksByParent(parentId: string | null): Task[] {
        const taskIds = this.indexes.byParent.get(parentId) || new Set();
        return Array.from(taskIds)
            .map(id => this.getTaskById(id))
            .filter((t): t is Task => t !== null);
    }

    /**
     * Gets tasks by session ID
     */
    getTasksBySession(sessionId: string): Task[] {
        const taskIds = this.indexes.bySession.get(sessionId) || new Set();
        return Array.from(taskIds)
            .map(id => this.getTaskById(id))
            .filter((t): t is Task => t !== null);
    }

    /**
     * Gets tasks that depend on a given task
     */
    getDependentTasks(taskId: string): Task[] {
        const dependentIds = this.indexes.byDependency.get(taskId) || new Set();
        return Array.from(dependentIds)
            .map(id => this.getTaskById(id))
            .filter((t): t is Task => t !== null);
    }

    /**
     * Gets root tasks
     */
    getRootTasks(): Task[] {
        return Array.from(this.indexes.byParent.entries())
            .filter(([parentId]) => parentId && parentId.startsWith('ROOT-'))
            .flatMap(([, taskIds]) => 
                Array.from(taskIds)
                    .map(id => this.getTaskById(id))
                    .filter((t): t is Task => t !== null)
            );
    }

    /**
     * Gets all tasks
     */
    getAllTasks(): Task[] {
        return Array.from(this.indexes.byId.values());
    }

    /**
     * Clears all indexes
     */
    clear(): void {
        this.indexes = this.createEmptyIndex();
        this.logger.debug('Indexes cleared');
    }

    /**
     * Gets index statistics
     */
    getStats(): {
        totalTasks: number;
        statusCounts: Record<TaskStatus, number>;
        dependencyCount: number;
    } {
        const statusCounts: Partial<Record<TaskStatus, number>> = {};
        for (const [status, tasks] of this.indexes.byStatus.entries()) {
            statusCounts[status] = tasks.size;
        }

        return {
            totalTasks: this.indexes.byId.size,
            statusCounts: statusCounts as Record<TaskStatus, number>,
            dependencyCount: Array.from(this.indexes.byDependency.values())
                .reduce((sum, deps) => sum + deps.size, 0)
        };
    }
}
