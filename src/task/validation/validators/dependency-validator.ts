import { ErrorCodes, createError } from '../../../errors/index.js';
import { Task } from '../../../types/task.js';

/**
 * Validation modes for dependency checking
 */
export enum DependencyValidationMode {
    STRICT = 'strict',      // All dependencies must exist
    DEFERRED = 'deferred'   // Allow missing dependencies for bulk operations
}

/**
 * Result of dependency validation
 */
export interface DependencyValidationResult {
    valid: boolean;
    missingDependencies: string[];
    error?: string;
}

/**
 * Validates task dependencies and detects cycles
 */
export class DependencyValidator {
    /**
     * Validates dependencies for a task
     */
    async validateDependencies(
        dependencies: string[],
        getTaskByPath: (path: string) => Promise<Task | null>,
        mode: DependencyValidationMode = DependencyValidationMode.STRICT
    ): Promise<DependencyValidationResult> {
        if (!Array.isArray(dependencies)) {
            return {
                valid: false,
                missingDependencies: [],
                error: 'Dependencies must be an array'
            };
        }

        // Check for missing dependencies
        const missingDeps: string[] = [];
        for (const depPath of dependencies) {
            const depTask = await getTaskByPath(depPath);
            if (!depTask) {
                missingDeps.push(depPath);
            }
        }

        // In strict mode, fail if any dependencies are missing
        if (mode === DependencyValidationMode.STRICT && missingDeps.length > 0) {
            return {
                valid: false,
                missingDependencies: missingDeps,
                error: `Missing dependencies: ${missingDeps.join(', ')}`
            };
        }

        // In deferred mode, just return the missing dependencies
        return {
            valid: mode === DependencyValidationMode.DEFERRED || missingDeps.length === 0,
            missingDependencies: missingDeps
        };
    }

    /**
     * Detects circular dependencies in task relationships
     */
    async detectDependencyCycle(
        task: Task,
        dependencies: string[],
        getTaskByPath: (path: string) => Promise<Task | null>
    ): Promise<boolean> {
        if (!Array.isArray(dependencies)) {
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
            const allDeps = currentPath === task.path ? dependencies : current.dependencies;
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
                    dependencies
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
        getTaskByPath: (path: string) => Promise<Task | null>,
        mode: DependencyValidationMode = DependencyValidationMode.STRICT
    ): Promise<DependencyValidationResult> {
        if (!Array.isArray(dependencies)) {
            return {
                valid: false,
                missingDependencies: [],
                error: 'Dependencies must be an array'
            };
        }

        // Validate dependencies exist
        const validationResult = await this.validateDependencies(dependencies, getTaskByPath, mode);
        if (!validationResult.valid && mode === DependencyValidationMode.STRICT) {
            return validationResult;
        }

        // Only check for cycles in STRICT mode
        if (mode === DependencyValidationMode.STRICT) {
            try {
                // Check for cycles only with existing dependencies
                const existingDeps = dependencies.filter(async dep => await getTaskByPath(dep) !== null);
                await this.detectDependencyCycle(task, existingDeps, getTaskByPath);
            } catch (error) {
                return {
                    valid: false,
                    missingDependencies: validationResult.missingDependencies,
                    error: error instanceof Error ? error.message : 'Dependency cycle detected'
                };
            }
        }

        return validationResult;
    }

    /**
     * Sort tasks by dependency order for bulk operations
     */
    async sortTasksByDependencies(
        tasks: { path: string; dependencies: string[] }[]
    ): Promise<string[]> {
        const graph = new Map<string, Set<string>>();
        const inDegree = new Map<string, number>();

        // Build dependency graph
        for (const task of tasks) {
            if (!graph.has(task.path)) {
                graph.set(task.path, new Set());
                inDegree.set(task.path, 0);
            }

            for (const dep of task.dependencies) {
                if (!graph.has(dep)) {
                    graph.set(dep, new Set());
                    inDegree.set(dep, 0);
                }
                graph.get(dep)?.add(task.path);
                inDegree.set(task.path, (inDegree.get(task.path) || 0) + 1);
            }
        }

        // Find tasks with no dependencies
        const queue: string[] = [];
        for (const [path, degree] of inDegree.entries()) {
            if (degree === 0) {
                queue.push(path);
            }
        }

        // Process queue
        const result: string[] = [];
        while (queue.length > 0) {
            const current = queue.shift()!;
            result.push(current);

            // Update degrees for dependent tasks
            const dependents = graph.get(current) || new Set();
            for (const dependent of dependents) {
                inDegree.set(dependent, (inDegree.get(dependent) || 0) - 1);
                if (inDegree.get(dependent) === 0) {
                    queue.push(dependent);
                }
            }
        }

        // Check for cycles
        if (result.length !== tasks.length) {
            throw createError(
                ErrorCodes.TASK_CYCLE,
                'Circular dependencies detected in bulk task creation',
                'DependencyValidator.sortTasksByDependencies'
            );
        }

        return result;
    }
}
