export * from './status-validator.js';
export * from './dependency-validator.js';
export * from './hierarchy-validator.js';

// Create a composite validator that combines all validators
import { StatusValidator } from './status-validator.js';
import { DependencyValidator } from './dependency-validator.js';
import { HierarchyValidator } from './hierarchy-validator.js';
import { BaseTask } from '../schemas/index.js';
import { TaskType, TaskStatus } from '../../../types/task.js';

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
     * Validates task status transitions
     */
    async validateStatus(
        task: BaseTask,
        newStatus: TaskStatus,
        getTaskByPath: (path: string) => Promise<BaseTask | null>,
        siblings: BaseTask[] = []
    ): Promise<void> {
        await this.statusValidator.validateStatusTransition(task, newStatus, getTaskByPath);
        await this.statusValidator.validateParentChildStatus(task, newStatus, siblings);
    }

    /**
     * Validates task dependencies
     */
    async validateDependencies(
        task: BaseTask,
        dependencies: string[],
        getTaskByPath: (path: string) => Promise<BaseTask | null>
    ): Promise<void> {
        await this.dependencyValidator.validateDependencyConstraints(task, dependencies, getTaskByPath);
    }

    /**
     * Validates task hierarchy
     */
    async validateHierarchy(
        task: BaseTask,
        parentPath: string | undefined,
        getTaskByPath: (path: string) => Promise<BaseTask | null>
    ): Promise<void> {
        await this.hierarchyValidator.validateParentChild(task, parentPath, getTaskByPath);
    }

    /**
     * Validates task type changes
     */
    async validateTypeChange(
        task: BaseTask,
        newType: TaskType
    ): Promise<void> {
        await this.hierarchyValidator.validateTypeChange(task, newType);
    }
}
