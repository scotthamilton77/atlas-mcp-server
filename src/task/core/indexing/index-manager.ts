/**
 * Task index manager
 * Maintains in-memory indexes for efficient task lookups
 */
import { ErrorCodes, createError } from '../../../errors/index.js';
import { Task, TaskStatus } from '../../../types/task.js';
import { Logger } from '../../../logging/index.js';

interface TaskIndex extends Task {
    path: string;
    status: TaskStatus;
    parentPath?: string;
    dependencies: string[];
    subtasks: string[];
}

interface IndexStats {
    totalTasks: number;
    byStatus: Record<TaskStatus, number>;
    byDepth: Record<number, number>;
    averageDepth: number;
}

export class TaskIndexManager {
    private readonly logger: Logger;
    private readonly taskIndexes: Map<string, TaskIndex>;
    private readonly pathIndex: Map<string, Set<string>>;
    private readonly statusIndex: Map<TaskStatus, Set<string>>;
    private readonly parentIndex: Map<string, Set<string>>;
    private readonly dependencyIndex: Map<string, Set<string>>;

    constructor() {
        this.logger = Logger.getInstance().child({ component: 'TaskIndexManager' });
        this.taskIndexes = new Map();
        this.pathIndex = new Map();
        this.statusIndex = new Map();
        this.parentIndex = new Map();
        this.dependencyIndex = new Map();
    }

    /**
     * Indexes a task
     */
    async indexTask(task: Task): Promise<void> {
        try {
            // Create task index
            const taskIndex: TaskIndex = {
                ...task,
                path: task.path,
                status: task.status,
                parentPath: task.parentPath,
                dependencies: task.dependencies,
                subtasks: task.subtasks
            };

            // Update task indexes
            this.taskIndexes.set(task.path, taskIndex);

            // Update path index
            const pathSegments = task.path.split('/');
            for (let i = 1; i <= pathSegments.length; i++) {
                const prefix = pathSegments.slice(0, i).join('/');
                let paths = this.pathIndex.get(prefix);
                if (!paths) {
                    paths = new Set();
                    this.pathIndex.set(prefix, paths);
                }
                paths.add(task.path);
            }

            // Update status index
            let statusPaths = this.statusIndex.get(task.status);
            if (!statusPaths) {
                statusPaths = new Set();
                this.statusIndex.set(task.status, statusPaths);
            }
            statusPaths.add(task.path);

            // Update parent index
            if (task.parentPath) {
                let children = this.parentIndex.get(task.parentPath);
                if (!children) {
                    children = new Set();
                    this.parentIndex.set(task.parentPath, children);
                }
                children.add(task.path);
            }

            // Update dependency index
            for (const depPath of task.dependencies) {
                let dependents = this.dependencyIndex.get(depPath);
                if (!dependents) {
                    dependents = new Set();
                    this.dependencyIndex.set(depPath, dependents);
                }
                dependents.add(task.path);
            }

            this.logger.debug('Indexed task', { path: task.path });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error('Failed to index task', { error: errorMessage, task });
            throw createError(
                ErrorCodes.OPERATION_FAILED,
                'Failed to index task',
                errorMessage
            );
        }
    }

    /**
     * Indexes task dependencies
     */
    async indexDependencies(task: Task): Promise<void> {
        try {
            // Clear existing dependency entries
            const existingTask = this.taskIndexes.get(task.path);
            if (existingTask) {
                for (const depPath of existingTask.dependencies) {
                    const dependents = this.dependencyIndex.get(depPath);
                    if (dependents) {
                        dependents.delete(task.path);
                        if (dependents.size === 0) {
                            this.dependencyIndex.delete(depPath);
                        }
                    }
                }
            }

            // Add new dependency entries
            for (const depPath of task.dependencies) {
                let dependents = this.dependencyIndex.get(depPath);
                if (!dependents) {
                    dependents = new Set();
                    this.dependencyIndex.set(depPath, dependents);
                }
                dependents.add(task.path);
            }

            // Update task index
            if (existingTask) {
                existingTask.dependencies = [...task.dependencies];
            }

            this.logger.debug('Indexed task dependencies', { path: task.path });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error('Failed to index task dependencies', { error: errorMessage, task });
            throw createError(
                ErrorCodes.OPERATION_FAILED,
                'Failed to index task dependencies',
                errorMessage
            );
        }
    }

    /**
     * Gets project tasks by pattern
     */
    async getProjectTasks(pattern: string): Promise<TaskIndex[]> {
        return this.getTasksByPattern(pattern);
    }

    /**
     * Unindexes a task
     */
    async unindexTask(task: Task): Promise<void> {
        try {
            // Remove from task indexes
            this.taskIndexes.delete(task.path);

            // Remove from path index
            const pathSegments = task.path.split('/');
            for (let i = 1; i <= pathSegments.length; i++) {
                const prefix = pathSegments.slice(0, i).join('/');
                const paths = this.pathIndex.get(prefix);
                if (paths) {
                    paths.delete(task.path);
                    if (paths.size === 0) {
                        this.pathIndex.delete(prefix);
                    }
                }
            }

            // Remove from status index
            const statusPaths = this.statusIndex.get(task.status);
            if (statusPaths) {
                statusPaths.delete(task.path);
                if (statusPaths.size === 0) {
                    this.statusIndex.delete(task.status);
                }
            }

            // Remove from parent index
            if (task.parentPath) {
                const children = this.parentIndex.get(task.parentPath);
                if (children) {
                    children.delete(task.path);
                    if (children.size === 0) {
                        this.parentIndex.delete(task.parentPath);
                    }
                }
            }

            // Remove from dependency index
            for (const depPath of task.dependencies) {
                const dependents = this.dependencyIndex.get(depPath);
                if (dependents) {
                    dependents.delete(task.path);
                    if (dependents.size === 0) {
                        this.dependencyIndex.delete(depPath);
                    }
                }
            }

            this.logger.debug('Unindexed task', { path: task.path });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error('Failed to unindex task', { error: errorMessage, task });
            throw createError(
                ErrorCodes.OPERATION_FAILED,
                'Failed to unindex task',
                errorMessage
            );
        }
    }

    /**
     * Gets a task by path
     */
    async getTaskByPath(path: string): Promise<TaskIndex | null> {
        return this.taskIndexes.get(path) || null;
    }

    /**
     * Gets tasks by path pattern
     */
    async getTasksByPattern(pattern: string): Promise<TaskIndex[]> {
        const paths = this.pathIndex.get(pattern) || new Set<string>();
        return Array.from(paths)
            .map(path => this.taskIndexes.get(path))
            .filter((task): task is TaskIndex => task !== undefined);
    }

    /**
     * Gets tasks by status
     */
    async getTasksByStatus(status: TaskStatus, pattern?: string): Promise<TaskIndex[]> {
        const statusPaths = this.statusIndex.get(status) || new Set<string>();
        const patternPaths = pattern ? (this.pathIndex.get(pattern) || new Set<string>()) : null;

        const paths = patternPaths
            ? new Set([...statusPaths].filter(path => patternPaths.has(path)))
            : statusPaths;

        return Array.from(paths)
            .map(path => this.taskIndexes.get(path))
            .filter((task): task is TaskIndex => task !== undefined);
    }

    /**
     * Gets tasks by parent path
     */
    async getTasksByParent(parentPath: string): Promise<TaskIndex[]> {
        const children = this.parentIndex.get(parentPath) || new Set<string>();
        return Array.from(children)
            .map(path => this.taskIndexes.get(path))
            .filter((task): task is TaskIndex => task !== undefined);
    }

    /**
     * Gets tasks that depend on a task
     */
    async getDependentTasks(path: string): Promise<TaskIndex[]> {
        const dependents = this.dependencyIndex.get(path) || new Set<string>();
        return Array.from(dependents)
            .map(path => this.taskIndexes.get(path))
            .filter((task): task is TaskIndex => task !== undefined);
    }

    /**
     * Gets index statistics
     */
    getStats(): IndexStats {
        const byStatus = {} as Record<TaskStatus, number>;
        const byDepth = {} as Record<number, number>;
        let totalDepth = 0;

        for (const task of this.taskIndexes.values()) {
            // Count by status
            byStatus[task.status] = (byStatus[task.status] || 0) + 1;

            // Count by depth
            const depth = task.path.split('/').length - 1;
            byDepth[depth] = (byDepth[depth] || 0) + 1;
            totalDepth += depth;
        }

        return {
            totalTasks: this.taskIndexes.size,
            byStatus,
            byDepth,
            averageDepth: this.taskIndexes.size > 0 ? totalDepth / this.taskIndexes.size : 0
        };
    }

    /**
     * Clears all indexes
     */
    clear(): void {
        this.taskIndexes.clear();
        this.pathIndex.clear();
        this.statusIndex.clear();
        this.parentIndex.clear();
        this.dependencyIndex.clear();
        this.logger.debug('Cleared all indexes');
    }
}
