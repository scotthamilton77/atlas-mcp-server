import { ErrorCodes, createError } from '../../../errors/index.js';
import { BaseTask } from '../schemas/index.js';

/**
 * Validates task dependencies and detects cycles
 */
export class DependencyValidator {
    /**
     * Validates dependencies for a task
     */
    async validateDependencies(
        dependencies: string[],
        getTaskByPath: (path: string) => Promise<BaseTask | null>
    ): Promise<void> {
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
        task: BaseTask,
        newDeps: string[],
        getTaskByPath: (path: string) => Promise<BaseTask | null>
    ): Promise<boolean> {
        const visited = new Set<string>();
        const recursionStack = new Set<string>();

        async function dfs(currentPath: string): Promise<boolean> {
            if (recursionStack.has(currentPath)) return true;
            if (visited.has(currentPath)) return false;

            visited.add(currentPath);
            recursionStack.add(currentPath);

            const current = await getTaskByPath(currentPath);
            if (!current) return false;

            // Check both existing and new dependencies
            const allDeps = currentPath === task.path ? newDeps : current.dependencies;
            for (const depPath of allDeps) {
                if (await dfs(depPath)) return true;
            }

            recursionStack.delete(currentPath);
            return false;
        }

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
        task: BaseTask,
        dependencies: string[],
        getTaskByPath: (path: string) => Promise<BaseTask | null>
    ): Promise<void> {
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
