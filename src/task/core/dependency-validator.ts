/**
 * Task Dependency Validator
 * 
 * Handles validation of task dependencies, including:
 * - Self-dependency checks
 * - Circular dependency detection
 * - Dependency existence validation
 */

import { Task } from '../../types/task.js';
import { TaskError, ErrorCodes } from '../../errors/index.js';

export class DependencyValidator {
    /**
     * Validates task dependencies
     * 
     * @param task - Task with dependencies to validate
     * @param getTaskById - Function to retrieve a task by ID
     * @throws {TaskError} If dependencies are invalid
     */
    async validateDependencies(
        task: Task,
        getTaskById: (id: string) => Task | null
    ): Promise<void> {
        // Check for self-dependencies
        if (task.dependencies.includes(task.id)) {
            throw new TaskError(
                ErrorCodes.TASK_DEPENDENCY,
                'Task cannot depend on itself'
            );
        }

        // Check if all dependencies exist
        for (const depId of task.dependencies) {
            const depTask = getTaskById(depId);
            if (!depTask) {
                throw new TaskError(
                    ErrorCodes.TASK_DEPENDENCY,
                    `Dependency task ${depId} not found`
                );
            }
        }

        // Check for circular dependencies
        await this.checkCircularDependencies(task.id, task.dependencies, getTaskById);
    }

    /**
     * Checks for circular dependencies
     * 
     * @param taskId - Task ID to check
     * @param dependencies - Dependencies to check
     * @param getTaskById - Function to retrieve a task by ID
     * @param visited - Set of visited task IDs
     * @throws {TaskError} If circular dependency is found
     */
    private async checkCircularDependencies(
        taskId: string,
        dependencies: string[],
        getTaskById: (id: string) => Task | null,
        visited: Set<string> = new Set()
    ): Promise<void> {
        if (visited.has(taskId)) {
            throw new TaskError(
                ErrorCodes.TASK_DEPENDENCY,
                'Circular dependency detected'
            );
        }

        visited.add(taskId);

        for (const depId of dependencies) {
            const depTask = getTaskById(depId);
            if (depTask) {
                await this.checkCircularDependencies(
                    depId,
                    depTask.dependencies,
                    getTaskById,
                    visited
                );
            }
        }

        visited.delete(taskId);
    }

    /**
     * Validates dependencies for task completion
     * 
     * @param task - Task to validate
     * @param getTaskById - Function to retrieve a task by ID
     * @throws {TaskError} If dependencies prevent completion
     */
    async validateDependenciesForCompletion(
        task: Task,
        getTaskById: (id: string) => Task | null
    ): Promise<void> {
        for (const depId of task.dependencies) {
            const depTask = getTaskById(depId);
            if (!depTask || depTask.status !== 'completed') {
                throw new TaskError(
                    ErrorCodes.TASK_STATUS,
                    'Cannot complete task with incomplete dependencies'
                );
            }
        }
    }
}
