import { Task, TaskStatus, TaskType } from '../../../types/task.js';
import { StatusValidator } from './status-validator.js';
import { 
    DependencyValidator,
    DependencyValidationMode,
    DependencyValidationResult 
} from './dependency-validator.js';
import { HierarchyValidator } from './hierarchy-validator.js';

// Re-export dependency validation types
export { DependencyValidationMode, DependencyValidationResult } from './dependency-validator.js';

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
     * Validates task hierarchy
     */
    async validateHierarchy(
        task: Partial<Task>,
        parentPath: string | undefined,
        getTaskByPath: (path: string) => Promise<Task | null>
    ): Promise<void> {
        const validTask = this.ensureTaskArrays(task);
        await this.hierarchyValidator.validateParentChild(validTask, parentPath, getTaskByPath);
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
