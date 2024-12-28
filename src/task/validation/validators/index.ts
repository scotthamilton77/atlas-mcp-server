import { Task, TaskStatus, TaskType } from '../../../types/task.js';
import { StatusValidator } from './status-validator.js';
import { 
    DependencyValidator,
    DependencyValidationMode,
    DependencyValidationResult 
} from './dependency-validator.js';
import { 
    HierarchyValidator,
    HierarchyValidationMode,
    HierarchyValidationResult 
} from './hierarchy-validator.js';

// Re-export validation types
export { DependencyValidationMode, DependencyValidationResult } from './dependency-validator.js';
export { HierarchyValidationMode, HierarchyValidationResult } from './hierarchy-validator.js';

export class TaskValidators {
    private readonly statusValidator: StatusValidator;
    private readonly dependencyValidator: DependencyValidator;
    private readonly hierarchyValidator: HierarchyValidator;

    constructor() {
        this.statusValidator = new StatusValidator();
        this.dependencyValidator = new DependencyValidator();
        this.hierarchyValidator = new HierarchyValidator();
    }

    /**
     * Get the hierarchy validator instance
     */
    getHierarchyValidator(): HierarchyValidator {
        return this.hierarchyValidator;
    }

    /**
     * Ensures a task has all required arrays initialized
     */
    private ensureTaskArrays(task: Partial<Task>): Task {
        return {
            ...task,
            notes: task.notes || [],
            dependencies: task.dependencies || [],
            subtasks: task.subtasks || [],
            metadata: task.metadata || {},
        } as Task;
    }

    /**
     * Validates task status transition
     */
    async validateStatusTransition(
        task: Partial<Task>,
        newStatus: TaskStatus,
        getTaskByPath: (path: string) => Promise<Task | null>
    ): Promise<void> {
        const validTask = this.ensureTaskArrays(task);
        
        // First validate the basic status transition
        await this.statusValidator.validateStatusTransition(validTask, newStatus, getTaskByPath);

        // Then get siblings if there's a parent
        let siblings: Task[] = [];
        if (validTask.parentPath) {
            const parent = await getTaskByPath(validTask.parentPath);
            if (parent) {
                const allSiblings = await Promise.all(
                    parent.subtasks
                        .filter(path => path !== validTask.path)
                        .map(path => getTaskByPath(path))
                );
                siblings = allSiblings.filter((t): t is Task => t !== null);
            }
        }

        // Finally validate parent-child status constraints
        await this.statusValidator.validateParentChildStatus(
            validTask,
            newStatus,
            siblings,
            getTaskByPath
        );
    }

    /**
     * Validates task dependencies
     */
    /**
     * Validates task dependencies with configurable validation mode
     */
    async validateDependencyConstraints(
        task: Partial<Task>,
        dependencies: string[],
        getTaskByPath: (path: string) => Promise<Task | null>,
        mode: DependencyValidationMode = DependencyValidationMode.STRICT
    ): Promise<DependencyValidationResult> {
        const validTask = this.ensureTaskArrays(task);
        return this.dependencyValidator.validateDependencyConstraints(validTask, dependencies, getTaskByPath, mode);
    }

    /**
     * Sort tasks by dependency order for bulk operations
     */
    async sortTasksByDependencies(
        tasks: { path: string; dependencies: string[] }[]
    ): Promise<string[]> {
        return this.dependencyValidator.sortTasksByDependencies(tasks);
    }

    /**
     * Validates task hierarchy with configurable validation mode
     */
    async validateHierarchy(
        task: Partial<Task>,
        parentPath: string | undefined,
        getTaskByPath: (path: string) => Promise<Task | null>,
        mode: HierarchyValidationMode = HierarchyValidationMode.STRICT
    ): Promise<HierarchyValidationResult> {
        const validTask = this.ensureTaskArrays(task);
        return this.hierarchyValidator.validateParentChild(validTask, parentPath, getTaskByPath, mode);
    }

    /**
     * Register a task that will be created in a bulk operation
     */
    registerPendingParent(path: string): void {
        this.hierarchyValidator.registerPendingParent(path);
    }

    /**
     * Clear pending parent registry
     */
    clearPendingParents(): void {
        this.hierarchyValidator.clearPendingParents();
    }

    /**
     * Sort tasks by dependency graph including parent-child relationships
     */
    async sortTasksByDependencyGraph(
        graph: Map<string, Set<string>>
    ): Promise<string[]> {
        const visited = new Set<string>();
        const temp = new Set<string>();
        const order: string[] = [];

        const visit = async (node: string) => {
            if (temp.has(node)) {
                throw new Error(`Circular dependency detected involving task: ${node}`);
            }
            if (!visited.has(node)) {
                temp.add(node);
                const deps = graph.get(node) || new Set();
                for (const dep of deps) {
                    await visit(dep);
                }
                temp.delete(node);
                visited.add(node);
                order.push(node);
            }
        };

        for (const node of graph.keys()) {
            if (!visited.has(node)) {
                await visit(node);
            }
        }

        return order.reverse();
    }

    /**
     * Validates task type change
     */
    async validateTypeChange(
        task: Partial<Task>,
        newType: TaskType
    ): Promise<void> {
        const validTask = this.ensureTaskArrays(task);
        await this.hierarchyValidator.validateTypeChange(validTask, newType);
    }

    /**
     * Detects dependency cycles
     */
    async detectDependencyCycle(
        task: Partial<Task>,
        newDeps: string[],
        getTaskByPath: (path: string) => Promise<Task | null>
    ): Promise<boolean> {
        const validTask = this.ensureTaskArrays(task);
        return this.dependencyValidator.detectDependencyCycle(validTask, newDeps, getTaskByPath);
    }
}

// Re-export individual validators for direct use
export { StatusValidator } from './status-validator.js';
export { DependencyValidator } from './dependency-validator.js';
export { HierarchyValidator } from './hierarchy-validator.js';
