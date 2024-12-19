import { Task } from '../../../shared/types/task.js';
import { ValidationContext, TaskValidationError, ValidationErrorCodes } from '../types.js';
import { BaseValidator, BaseValidatorConfig } from './base-validator.js';
import { VALID_STATUS_VALUES } from '../../indexing/indexes/status.js';

/**
 * Task validator configuration
 */
export interface TaskValidatorConfig extends BaseValidatorConfig {
    validateIds: boolean;
    validateStatus: boolean;
    validateRelations: boolean;
}

/**
 * Default task validator configuration
 */
export const DEFAULT_TASK_VALIDATOR_CONFIG: TaskValidatorConfig = {
    validateIds: true,
    validateStatus: true,
    validateRelations: true,
    strict: true,
    maxErrors: 100,
    logErrors: true
};

/**
 * Task validator class
 */
export class TaskValidator extends BaseValidator<Task, TaskValidationError> {
    protected readonly config: TaskValidatorConfig;

    constructor(config: Partial<TaskValidatorConfig> = {}) {
        const mergedConfig = { ...DEFAULT_TASK_VALIDATOR_CONFIG, ...config };
        super(mergedConfig);
        this.config = mergedConfig;
    }

    /**
     * Validate task
     */
    protected async validateValue(
        task: Task,
        path: string[],
        errors: TaskValidationError[]
    ): Promise<void> {
        // Validate task object
        if (!task || typeof task !== 'object') {
            this.addError(
                errors,
                ValidationErrorCodes.INVALID_VALUE,
                'Task must be an object',
                path,
                task,
                { expected: 'object', actual: typeof task }
            );
            return;
        }

        // Validate ID
        if (this.config.validateIds) {
            await this.validateId(task, path, errors);
        }

        // Validate status
        if (this.config.validateStatus) {
            await this.validateStatus(task, path, errors);
        }

        // Validate relations
        if (this.config.validateRelations) {
            await this.validateRelations(task, path, errors);
        }

        // Validate other fields
        await this.validateFields(task, path, errors);
    }

    /**
     * Validate task ID
     */
    private async validateId(
        task: Task,
        path: string[],
        errors: TaskValidationError[]
    ): Promise<void> {
        const { id } = task;

        if (!id) {
            this.addError(
                errors,
                ValidationErrorCodes.MISSING_FIELD,
                'Task ID is required',
                [...path, 'id'],
                task,
                { field: 'id' }
            );
            return;
        }

        if (typeof id !== 'string') {
            this.addError(
                errors,
                ValidationErrorCodes.TYPE_ERROR,
                'Task ID must be a string',
                [...path, 'id'],
                task,
                { field: 'id', expected: 'string', actual: typeof id }
            );
            return;
        }

        if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
            this.addError(
                errors,
                ValidationErrorCodes.FORMAT_ERROR,
                'Task ID contains invalid characters',
                [...path, 'id'],
                task,
                { field: 'id', pattern: '^[a-zA-Z0-9_-]+$' }
            );
        }
    }

    /**
     * Validate task status
     */
    private async validateStatus(
        task: Task,
        path: string[],
        errors: TaskValidationError[]
    ): Promise<void> {
        const { status } = task;

        if (!status) {
            this.addError(
                errors,
                ValidationErrorCodes.MISSING_FIELD,
                'Task status is required',
                [...path, 'status'],
                task,
                { field: 'status' }
            );
            return;
        }

        if (typeof status !== 'string') {
            this.addError(
                errors,
                ValidationErrorCodes.TYPE_ERROR,
                'Task status must be a string',
                [...path, 'status'],
                task,
                { field: 'status', expected: 'string', actual: typeof status }
            );
            return;
        }

        if (!VALID_STATUS_VALUES.includes(status as any)) {
            this.addError(
                errors,
                ValidationErrorCodes.INVALID_VALUE,
                `Invalid status value: ${status}`,
                [...path, 'status'],
                task,
                {
                    field: 'status',
                    expected: VALID_STATUS_VALUES,
                    actual: status
                }
            );
        }
    }

    /**
     * Validate task relations
     */
    private async validateRelations(
        task: Task,
        path: string[],
        errors: TaskValidationError[]
    ): Promise<void> {
        const { parentId } = task;

        if (parentId) {
            if (typeof parentId !== 'string') {
                this.addError(
                    errors,
                    ValidationErrorCodes.TYPE_ERROR,
                    'Parent ID must be a string',
                    [...path, 'parentId'],
                    task,
                    {
                        field: 'parentId',
                        expected: 'string',
                        actual: typeof parentId
                    }
                );
                return;
            }

            if (parentId === task.id) {
                this.addError(
                    errors,
                    ValidationErrorCodes.INVALID_REFERENCE,
                    'Task cannot be its own parent',
                    [...path, 'parentId'],
                    task,
                    { field: 'parentId' }
                );
            }
        }
    }

    /**
     * Validate task fields
     */
    private async validateFields(
        task: Task,
        path: string[],
        errors: TaskValidationError[]
    ): Promise<void> {
        const { name, description } = task;

        // Validate name
        if (name !== undefined && typeof name !== 'string') {
            this.addError(
                errors,
                ValidationErrorCodes.TYPE_ERROR,
                'Task name must be a string',
                [...path, 'name'],
                task,
                { field: 'name', expected: 'string', actual: typeof name }
            );
        }

        // Validate description
        if (description !== undefined && typeof description !== 'string') {
            this.addError(
                errors,
                ValidationErrorCodes.TYPE_ERROR,
                'Task description must be a string',
                [...path, 'description'],
                task,
                {
                    field: 'description',
                    expected: 'string',
                    actual: typeof description
                }
            );
        }
    }

    /**
     * Get validator configuration
     */
    getConfig(): TaskValidatorConfig {
        return { ...this.config };
    }
}

/**
 * Create task validator instance
 */
export function createTaskValidator(
    config?: Partial<TaskValidatorConfig>
): TaskValidator {
    return new TaskValidator(config);
}
