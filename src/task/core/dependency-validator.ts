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
            // Pre-validate dependencies exist
            await this.preValidateDependencies(dependencies, getTaskByPath);

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
                dependencies,
                validationSteps: [
                    'pre-validation',
                    'graph-building',
                    'cycle-detection',
                    'status-validation'
                ]
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
    /**
     * Pre-validates all dependencies exist before building the graph
     */
    private async preValidateDependencies(
        dependencies: string[],
        getTaskByPath: GetTaskByPath
    ): Promise<void> {
        const missingDeps: string[] = [];
        
        for (const depPath of dependencies) {
            const depTask = await getTaskByPath(depPath);
            if (!depTask) {
                missingDeps.push(depPath);
            }
        }

        if (missingDeps.length > 0) {
            throw createError(
                ErrorCodes.TASK_NOT_FOUND,
                {
                    message: 'One or more dependency tasks not found',
                    context: {
                        missingDependencies: missingDeps,
                        totalDependencies: dependencies.length
                    }
                },
                `Missing dependencies: ${missingDeps.join(', ')}`,
                'Ensure all dependency tasks exist before creating relationships'
            );
        }
    }

    private async buildDependencyGraph(
        taskPath: string,
        dependencies: string[],
        getTaskByPath: GetTaskByPath
    ): Promise<void> {
        try {
            // Create node for current task
            const node = this.getOrCreateNode(taskPath);

            // Process each dependency
            for (const depPath of dependencies) {
                const depTask = await getTaskByPath(depPath);
                if (!depTask) {
                    // This shouldn't happen due to pre-validation, but handle just in case
                    throw createError(
                        ErrorCodes.TASK_NOT_FOUND,
                        {
                            message: 'Dependency task not found during graph building',
                            context: {
                                taskPath,
                                dependencyPath: depPath,
                                graphState: this.getGraphState()
                            }
                        }
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
        } catch (error) {
            this.logger.error('Error building dependency graph', {
                taskPath,
                dependencies,
                error,
                graphState: this.getGraphState()
            });
            throw error;
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
                const cyclePath = this.getCyclePath(depPath);
                throw createError(
                    ErrorCodes.TASK_CYCLE,
                    {
                        message: 'Circular dependency detected in task graph',
                        context: {
                            cyclePath,
                            startPath,
                            affectedTasks: Array.from(this.nodes.keys()),
                            graphState: this.getGraphState()
                        }
                    },
                    `Circular dependency: ${cyclePath}`,
                    'Remove one of the dependencies to break the cycle'
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
        const statusIssues: Array<{ path: string; status: TaskStatus; issue: string }> = [];

        for (const [path] of this.nodes) {
            const task = await getTaskByPath(path);
            if (!task) {
                continue;
            }

            if (task.status === TaskStatus.FAILED) {
                statusIssues.push({
                    path,
                    status: task.status,
                    issue: 'Task has failed'
                });
            }

            if (task.status === TaskStatus.BLOCKED) {
                statusIssues.push({
                    path,
                    status: task.status,
                    issue: 'Task is blocked'
                });
            }
        }

        if (statusIssues.length > 0) {
            throw createError(
                ErrorCodes.TASK_DEPENDENCY,
                {
                    message: 'Dependency status validation failed',
                    context: {
                        statusIssues,
                        graphState: this.getGraphState()
                    }
                },
                `Invalid dependency statuses: ${statusIssues.map(i => `${i.path} (${i.status})`).join(', ')}`,
                'Ensure all dependencies are in a valid state before proceeding'
            );
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

    /**
     * Gets the current state of the dependency graph for debugging
     */
    private getGraphState(): Record<string, unknown> {
        const graphState: Record<string, unknown> = {};
        for (const [path, node] of this.nodes) {
            graphState[path] = {
                dependencies: Array.from(node.dependencies),
                dependents: Array.from(node.dependents),
                visited: node.visited,
                inPath: node.inPath
            };
        }
        return graphState;
    }
}
