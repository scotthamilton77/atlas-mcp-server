import { ErrorCodes, createError } from '../../../errors/index.js';
import { Task } from '../../../types/task.js';

/**
 * Validates task dependencies and detects cycles
 */
export class DependencyValidator {
    /**
     * Validates dependencies for a task
     */
    async validateDependencies(
        dependencies: string[],
        getTaskByPath: (path: string) => Promise<Task | null>
    ): Promise<void> {
        if (!Array.isArray(dependencies)) {
            throw createError(
                ErrorCodes.INVALID_INPUT,
                'Dependencies must be an array',
                'DependencyValidator.validateDependencies'
            );
        }

        // Check for missing dependencies
        const missingDeps: string[] = [];
        for (const depPath of dependencies) {
            const depTask = await getTaskByPath(depPath);
            if (!depTask) {
                missingDeps.push(depPath);
            }
        }

        if (missingDeps.length > 0) {
            throw createError(
                ErrorCodes.INVALID_INPUT,
                `Missing dependencies: ${missingDeps.join(', ')}`,
                'DependencyValidator.validateDependencies'
            );
        }
    }

    /**
     * Detects circular dependencies in task relationships
     */
    async detectDependencyCycle(
        task: Task,
        newDeps: string[],
        getTaskByPath: (path: string) => Promise<Task | null>
    ): Promise<boolean> {
        if (!Array.isArray(newDeps)) {
            throw createError(
                ErrorCodes.INVALID_INPUT,
                'Dependencies must be an array',
                'DependencyValidator.detectDependencyCycle'
            );
        }

        const visited = new Set<string>();
        const recursionStack = new Set<string>();

        const dfs = async (currentPath: string): Promise<boolean> => {
            if (recursionStack.has(currentPath)) return true;
            if (visited.has(currentPath)) return false;

            visited.add(currentPath);
            recursionStack.add(currentPath);

            const current = await getTaskByPath(currentPath);
            if (!current) return false;

            // Check both existing and new dependencies
            const allDeps = currentPath === task.path ? newDeps : current.dependencies;
            if (!Array.isArray(allDeps)) {
                throw createError(
                    ErrorCodes.INVALID_INPUT,
                    'Task dependencies must be an array',
                    'DependencyValidator.detectDependencyCycle'
                );
            }

            for (const depPath of allDeps) {
                if (await dfs(depPath)) return true;
            }

            recursionStack.delete(currentPath);
            return false;
        };

        const hasCycle = await dfs(task.path);
        if (hasCycle) {
            throw createError(
                ErrorCodes.TASK_CYCLE,
                'Circular dependencies detected in task relationships',
                'DependencyValidator.detectDependencyCycle',
                undefined,
                {
                    taskPath: task.path,
                    dependencies: newDeps
                }
            );
        }

        return hasCycle;
    }

    /**
     * Validates dependency constraints between tasks
     */
    async validateDependencyConstraints(
        task: Task,
        dependencies: string[],
        getTaskByPath: (path: string) => Promise<Task | null>
    ): Promise<void> {
        if (!Array.isArray(dependencies)) {
            throw createError(
                ErrorCodes.INVALID_INPUT,
                'Dependencies must be an array',
                'DependencyValidator.validateDependencyConstraints'
            );
        }

        // Validate dependencies exist
        await this.validateDependencies(dependencies, getTaskByPath);

        // Check for cycles
        await this.detectDependencyCycle(task, dependencies, getTaskByPath);

        // Additional dependency validations can be added here
        // For example:
        // - Maximum dependency depth
        // - Cross-project dependencies
        // - Type-based dependency rules
    }
}
