/**
 * Task Dependency Validator
 * 
 * Handles validation of task dependencies, including:
 * - Self-dependency checks
 * - Circular dependency detection with depth limits
 * - Dependency existence validation
 * - Dependency chain validation
 * - Validation result caching
 * - Status-based dependency validation
 */

import { Task, TaskStatus, TaskStatuses } from '../../types/task.js';
import { TaskError, ErrorCodes } from '../../errors/index.js';
import { Logger } from '../../logging/index.js';

interface ValidationResult {
    valid: boolean;
    error?: {
        code: string;
        message: string;
        details?: unknown;
    };
    timestamp: number;
}

interface ValidationContext {
    visited: Set<string>;
    path: string[];
    depth: number;
}

export class DependencyValidator {
    private readonly MAX_DEPTH = 10; // Maximum dependency chain depth
    private readonly CACHE_TTL = 60000; // Cache TTL in milliseconds (1 minute)
    private validationCache: Map<string, ValidationResult>;
    private logger: Logger;

    constructor() {
        this.validationCache = new Map();
        this.logger = Logger.getInstance().child({ component: 'DependencyValidator' });
    }

    /**
     * Validates task dependencies with caching
     */
    async validateDependencies(
        task: Task,
        getTaskById: (id: string) => Task | null
    ): Promise<void> {
        const cacheKey = this.getCacheKey(task);
        const cachedResult = this.validationCache.get(cacheKey);

        // Return cached result if valid and not expired
        if (cachedResult && Date.now() - cachedResult.timestamp < this.CACHE_TTL) {
            if (!cachedResult.valid) {
                throw new TaskError(
                    cachedResult.error!.code as any,
                    cachedResult.error!.message,
                    cachedResult.error!.details
                );
            }
            return;
        }

        try {
            // Check for self-dependencies
            if (task.dependencies.includes(task.id)) {
                throw new TaskError(
                    ErrorCodes.TASK_DEPENDENCY,
                    'Task cannot depend on itself',
                    { taskId: task.id }
                );
            }

            // Check for duplicate dependencies
            const uniqueDeps = new Set(task.dependencies);
            if (uniqueDeps.size !== task.dependencies.length) {
                throw new TaskError(
                    ErrorCodes.TASK_DEPENDENCY,
                    'Duplicate dependencies detected',
                    { taskId: task.id, dependencies: task.dependencies }
                );
            }

            // Check if all dependencies exist
            for (const depId of task.dependencies) {
                const depTask = getTaskById(depId);
                if (!depTask) {
                    throw new TaskError(
                        ErrorCodes.TASK_DEPENDENCY,
                        `Dependency task ${depId} not found`,
                        { taskId: task.id, dependencyId: depId }
                    );
                }
            }

            // Check for circular dependencies with depth limit
            const context: ValidationContext = {
                visited: new Set(),
                path: [],
                depth: 0
            };

            await this.checkCircularDependencies(
                task.id,
                task.dependencies,
                getTaskById,
                context
            );

            // Cache successful validation
            this.validationCache.set(cacheKey, {
                valid: true,
                timestamp: Date.now()
            });

        } catch (error) {
            // Cache validation error
            if (error instanceof TaskError) {
                this.validationCache.set(cacheKey, {
                    valid: false,
                    error: {
                        code: error.code,
                        message: error.message,
                        details: error.details
                    },
                    timestamp: Date.now()
                });
            }
            throw error;
        }
    }

    /**
     * Validates dependencies for task status transitions
     * Updated to allow parallel work while enforcing completion requirements
     */
    async validateDependenciesForStatus(
        task: Task,
        newStatus: TaskStatus,
        getTaskById: (id: string) => Task | null
    ): Promise<void> {
        // Only enforce strict dependency checking for completion
        if (newStatus === TaskStatuses.COMPLETED) {
            const incompleteDeps = task.dependencies
                .map(depId => getTaskById(depId))
                .filter(depTask => !depTask || depTask.status !== TaskStatuses.COMPLETED);

            if (incompleteDeps.length > 0) {
                throw new TaskError(
                    ErrorCodes.TASK_STATUS,
                    'Cannot complete task until all dependencies are completed',
                    { 
                        taskId: task.id,
                        newStatus,
                        incompleteDependencies: incompleteDeps.map(dep => ({
                            id: dep?.id,
                            status: dep?.status
                        })),
                        suggestion: 'Complete all dependencies before marking this task as completed'
                    }
                );
            }
        }

        // For in_progress, only check for failed dependencies
        if (newStatus === TaskStatuses.IN_PROGRESS) {
            const failedDeps = task.dependencies
                .map(depId => getTaskById(depId))
                .filter(depTask => depTask?.status === TaskStatuses.FAILED);

            if (failedDeps.length > 0) {
                throw new TaskError(
                    ErrorCodes.TASK_STATUS,
                    'Cannot start task with failed dependencies',
                    { 
                        taskId: task.id,
                        newStatus,
                        failedDependencies: failedDeps.map(dep => ({
                            id: dep?.id,
                            status: dep?.status
                        })),
                        suggestion: 'Fix or remove failed dependencies before starting this task'
                    }
                );
            }
        }
    }

    /**
     * Checks for circular dependencies with depth tracking
     */
    private async checkCircularDependencies(
        taskId: string,
        dependencies: string[],
        getTaskById: (id: string) => Task | null,
        context: ValidationContext
    ): Promise<void> {
        // Check maximum depth
        if (context.depth >= this.MAX_DEPTH) {
            throw new TaskError(
                ErrorCodes.TASK_DEPENDENCY,
                'Maximum dependency depth exceeded',
                { 
                    taskId,
                    depth: context.depth,
                    maxDepth: this.MAX_DEPTH,
                    path: [...context.path, taskId]
                }
            );
        }

        // Check for circular dependencies
        if (context.visited.has(taskId)) {
            throw new TaskError(
                ErrorCodes.TASK_DEPENDENCY,
                'Circular dependency detected',
                { 
                    taskId,
                    path: [...context.path, taskId],
                    cycle: context.path.slice(context.path.indexOf(taskId))
                }
            );
        }

        context.visited.add(taskId);
        context.path.push(taskId);
        context.depth++;

        try {
            for (const depId of dependencies) {
                const depTask = getTaskById(depId);
                if (depTask) {
                    await this.checkCircularDependencies(
                        depId,
                        depTask.dependencies,
                        getTaskById,
                        context
                    );
                }
            }
        } finally {
            context.visited.delete(taskId);
            context.path.pop();
            context.depth--;
        }
    }

    /**
     * Validates dependencies for task completion
     */
    async validateDependenciesForCompletion(
        task: Task,
        getTaskById: (id: string) => Task | null
    ): Promise<void> {
        const cacheKey = `completion:${task.id}`;
        const cachedResult = this.validationCache.get(cacheKey);

        // Return cached result if valid and not expired
        if (cachedResult && Date.now() - cachedResult.timestamp < this.CACHE_TTL) {
            if (!cachedResult.valid) {
                throw new TaskError(
                    cachedResult.error!.code as any,
                    cachedResult.error!.message,
                    cachedResult.error!.details
                );
            }
            return;
        }

        try {
            const incompleteDeps = task.dependencies
                .map(depId => getTaskById(depId))
                .filter(depTask => !depTask || depTask.status !== TaskStatuses.COMPLETED);

            if (incompleteDeps.length > 0) {
                throw new TaskError(
                    ErrorCodes.TASK_STATUS,
                    'Cannot complete task with incomplete dependencies',
                    { 
                        taskId: task.id,
                        incompleteDependencies: incompleteDeps.map(dep => ({
                            id: dep?.id,
                            status: dep?.status,
                            name: dep?.name
                        })),
                        suggestion: 'Complete all dependencies before marking this task as completed'
                    }
                );
            }

            // Cache successful validation
            this.validationCache.set(cacheKey, {
                valid: true,
                timestamp: Date.now()
            });

        } catch (error) {
            // Cache validation error
            if (error instanceof TaskError) {
                this.validationCache.set(cacheKey, {
                    valid: false,
                    error: {
                        code: error.code,
                        message: error.message,
                        details: error.details
                    },
                    timestamp: Date.now()
                });
            }
            throw error;
        }
    }

    /**
     * Validates task deletion and handles dependent tasks
     */
    async validateTaskDeletion(
        taskId: string,
        getTaskById: (id: string) => Task | null,
        getDependentTasks: (id: string) => Task[]
    ): Promise<void> {
        const dependentTasks = getDependentTasks(taskId);
        
        if (dependentTasks.length > 0) {
            const inProgressDependents = dependentTasks.filter(
                t => t.status === TaskStatuses.IN_PROGRESS
            );

            if (inProgressDependents.length > 0) {
                throw new TaskError(
                    ErrorCodes.TASK_DEPENDENCY,
                    'Cannot delete task with in-progress dependent tasks',
                    {
                        taskId,
                        dependentTasks: inProgressDependents.map(t => ({
                            id: t.id,
                            name: t.name,
                            status: t.status
                        })),
                        suggestion: 'Complete or cancel dependent tasks before deletion'
                    }
                );
            }

            // For other dependent tasks, they should be automatically blocked
            // This is handled by the StatusManager when the task is deleted
        }
    }

    /**
     * Generates a cache key for dependency validation
     */
    private getCacheKey(task: Task): string {
        return `${task.id}:${task.dependencies.sort().join(',')}`;
    }

    /**
     * Clears the validation cache
     */
    clearCache(): void {
        this.validationCache.clear();
    }

    /**
     * Removes expired cache entries
     */
    cleanCache(): void {
        const now = Date.now();
        for (const [key, result] of this.validationCache.entries()) {
            if (now - result.timestamp >= this.CACHE_TTL) {
                this.validationCache.delete(key);
            }
        }
    }

    /**
     * Validates a batch of tasks for efficiency
     */
    async validateTaskBatch(
        tasks: Task[],
        getTaskById: (id: string) => Task | null
    ): Promise<void> {
        // Build dependency graph
        const graph = new Map<string, Set<string>>();
        for (const task of tasks) {
            graph.set(task.id, new Set(task.dependencies));
        }

        // Validate each task's dependencies
        for (const task of tasks) {
            await this.validateDependencies(task, getTaskById);
        }

        // Additional batch-specific validations could be added here
    }
}
