import { Task, TaskType } from '../../../types/task.js';
import { ErrorCodes, createError } from '../../../errors/index.js';

export enum HierarchyValidationMode {
    STRICT = 'strict',    // Parent must exist
    DEFERRED = 'deferred' // Parent may be created later in bulk operation
}

export interface HierarchyValidationResult {
    valid: boolean;
    error?: string;
    missingParents?: string[];
}

export class HierarchyValidator {
    /**
     * Tracks pending parent tasks that will be created in bulk operations
     */
    private pendingParents: Set<string> = new Set();

    /**
     * Registers a task path that will be created in a bulk operation
     */
    registerPendingParent(path: string): void {
        this.pendingParents.add(path);
    }

    /**
     * Clears the pending parents registry
     */
    clearPendingParents(): void {
        this.pendingParents.clear();
    }

    /**
     * Validates parent-child relationship between tasks
     */
    async validateParentChild(
        task: Task,
        parentPath: string | undefined,
        getTaskByPath: (path: string) => Promise<Task | null>,
        mode: HierarchyValidationMode = HierarchyValidationMode.STRICT
    ): Promise<HierarchyValidationResult> {
        if (!parentPath) {
            return { valid: true };
        }

        // Check if parent exists or is pending
        const parent = await getTaskByPath(parentPath);
        const isPending = this.pendingParents.has(parentPath);

        if (!parent && !isPending) {
            if (mode === HierarchyValidationMode.STRICT) {
                throw createError(
                    ErrorCodes.VALIDATION_ERROR,
                    `Parent task not found: ${parentPath}`,
                    'validateParentChild'
                );
            }
            return {
                valid: false,
                error: `Parent task not found: ${parentPath}`,
                missingParents: [parentPath]
            };
        }

        // Validate parent-child relationship
        if (parent) {
            // Prevent circular parent-child relationships
            let currentPath = parent.parentPath;
            while (currentPath) {
                if (currentPath === task.path) {
                    throw createError(
                        ErrorCodes.VALIDATION_ERROR,
                        `Circular parent-child relationship detected: ${task.path} -> ${parentPath}`,
                        'validateParentChild'
                    );
                }
                const current = await getTaskByPath(currentPath);
                currentPath = current?.parentPath;
            }
        }

        return { valid: true };
    }

    /**
     * Validates task type change
     */
    async validateTypeChange(task: Task, newType: TaskType): Promise<void> {
        if (task.type === newType) return;

        // Validate type change is allowed
        if (task.type === TaskType.MILESTONE && newType === TaskType.TASK) {
            throw createError(
                ErrorCodes.VALIDATION_ERROR,
                'Cannot change MILESTONE to TASK if it has subtasks',
                'validateTypeChange'
            );
        }
    }
}
