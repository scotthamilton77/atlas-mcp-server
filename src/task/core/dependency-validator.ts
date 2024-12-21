/**
 * Task dependency validation
 */
import { Logger } from '../../logging/index.js';
import { ErrorCodes, createError } from '../../errors/index.js';
import { Task, TaskStatus } from '../../types/task.js';

export type GetTaskByPath = (path: string) => Promise<Task | null>;

interface DependencyNode {
    path: string;
    dependencies: Set<string>;
    dependents: Set<string>;
    visited: boolean;
    inPath: boolean;
}

export class DependencyValidator {
    private readonly logger: Logger;
    private readonly nodes: Map<string, DependencyNode>;

    constructor() {
        this.logger = Logger.getInstance().child({ component: 'DependencyValidator' });
        this.nodes = new Map();
    }

    /**
     * Validates task dependencies
     */
    async validateDependencies(
        taskPath: string,
        dependencies: string[],
        getTaskByPath: GetTaskByPath
    ): Promise<void> {
        try {
            // Reset validation state
            this.nodes.clear();

            // Build dependency graph
            await this.buildDependencyGraph(taskPath, dependencies, getTaskByPath);

            // Check for cycles
            this.detectCycles(taskPath);

            // Validate dependency statuses
            await this.validateDependencyStatuses(getTaskByPath);

            this.logger.debug('Dependencies validated successfully', {
                taskPath,
                dependencies
            });
        } catch (error) {
            this.logger.error('Dependency validation failed', {
                taskPath,
                dependencies,
                error
            });
            throw error;
        }
    }

    /**
     * Validates dependencies for a status change
     */
    async validateDependenciesForStatus(
        task: Task,
        newStatus: TaskStatus,
        getTaskByPath: GetTaskByPath
    ): Promise<void> {
        if (newStatus === TaskStatus.COMPLETED) {
            await this.validateDependenciesForCompletion(task, getTaskByPath);
        }

        // For other status transitions, validate basic dependencies
        await this.validateDependencies(task.path, task.dependencies, getTaskByPath);
    }

    /**
     * Validates dependencies for task completion
     */
    async validateDependenciesForCompletion(
        task: Task,
        getTaskByPath: GetTaskByPath
    ): Promise<void> {
        // Reset validation state
        this.nodes.clear();

        // Build dependency graph
        await this.buildDependencyGraph(task.path, task.dependencies, getTaskByPath);

        // Check for cycles first
        this.detectCycles(task.path);

        // Get all dependencies in topological order
        const sortedDeps = await this.getTopologicalOrder(task.path);
        
        // Check all dependencies are completed in order
        for (const path of sortedDeps) {
            if (path === task.path) continue;

            const depTask = await getTaskByPath(path);
            if (!depTask) {
                throw createError(
                    ErrorCodes.TASK_DEPENDENCY,
                    `Dependency task not found: ${path}`
                );
            }

            if (depTask.status !== TaskStatus.COMPLETED) {
                throw createError(
                    ErrorCodes.TASK_DEPENDENCY,
                    `Cannot complete task: dependency ${path} is not completed`
                );
            }
        }
    }

    /**
     * Gets dependencies in topological order
     */
    private async getTopologicalOrder(startPath: string): Promise<string[]> {
        const order: string[] = [];
        const visited = new Set<string>();

        const visit = async (path: string) => {
            if (visited.has(path)) return;
            visited.add(path);

            const node = this.nodes.get(path);
            if (!node) return;

            for (const depPath of node.dependencies) {
                await visit(depPath);
            }

            order.push(path);
        };

        await visit(startPath);
        return order;
    }

    /**
     * Builds the dependency graph
     */
    private async buildDependencyGraph(
        taskPath: string,
        dependencies: string[],
        getTaskByPath: GetTaskByPath
    ): Promise<void> {
        // Create node for current task
        const node = this.getOrCreateNode(taskPath);

        // Process each dependency
        for (const depPath of dependencies) {
            // Validate dependency exists
            const depTask = await getTaskByPath(depPath);
            if (!depTask) {
                throw createError(
                    ErrorCodes.TASK_NOT_FOUND,
                    `Dependency task not found: ${depPath}`
                );
            }

            // Add dependency relationship
            node.dependencies.add(depPath);
            const depNode = this.getOrCreateNode(depPath);
            depNode.dependents.add(taskPath);

            // Process transitive dependencies
            await this.buildDependencyGraph(
                depPath,
                depTask.dependencies,
                getTaskByPath
            );
        }
    }

    /**
     * Detects cycles in the dependency graph
     */
    private detectCycles(startPath: string): void {
        const node = this.nodes.get(startPath);
        if (!node) {
            return;
        }

        node.visited = true;
        node.inPath = true;

        for (const depPath of node.dependencies) {
            const depNode = this.nodes.get(depPath);
            if (!depNode) {
                continue;
            }

            if (!depNode.visited) {
                this.detectCycles(depPath);
            } else if (depNode.inPath) {
                throw createError(
                    ErrorCodes.TASK_CYCLE,
                    `Circular dependency detected: ${this.getCyclePath(depPath)}`
                );
            }
        }

        node.inPath = false;
    }

    /**
     * Gets the path of a dependency cycle
     */
    private getCyclePath(startPath: string): string {
        const cycle: string[] = [startPath];
        let current = startPath;

        while (true) {
            const node = this.nodes.get(current);
            if (!node) {
                break;
            }

            for (const depPath of node.dependencies) {
                const depNode = this.nodes.get(depPath);
                if (depNode?.inPath) {
                    cycle.push(depPath);
                    if (depPath === startPath) {
                        return cycle.join(' -> ');
                    }
                    current = depPath;
                    break;
                }
            }
        }

        return cycle.join(' -> ');
    }

    /**
     * Validates dependency task statuses
     */
    private async validateDependencyStatuses(
        getTaskByPath: GetTaskByPath
    ): Promise<void> {
        for (const [path] of this.nodes) {
            const task = await getTaskByPath(path);
            if (!task) {
                continue;
            }

            if (task.status === TaskStatus.FAILED) {
                throw createError(
                    ErrorCodes.TASK_DEPENDENCY,
                    `Dependency task failed: ${path}`
                );
            }

            if (task.status === TaskStatus.BLOCKED) {
                throw createError(
                    ErrorCodes.TASK_DEPENDENCY,
                    `Dependency task is blocked: ${path}`
                );
            }
        }
    }

    /**
     * Gets or creates a dependency node
     */
    private getOrCreateNode(path: string): DependencyNode {
        let node = this.nodes.get(path);
        if (!node) {
            node = {
                path,
                dependencies: new Set(),
                dependents: new Set(),
                visited: false,
                inPath: false
            };
            this.nodes.set(path, node);
        }
        return node;
    }
}
