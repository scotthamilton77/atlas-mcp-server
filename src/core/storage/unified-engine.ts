import { Task } from '../../shared/types/task.js';
import { Logger } from '../../logging/index.js';
import { StorageEngine } from './types/store.js';
import { StorageError } from './types/errors.js';
import { StorageResult, createErrorResult } from './types/results.js';
import {
    ValidationContext,
    ValidationOperations,
    ValidationResult,
    ValidationError,
    createValidationContext
} from '../validation/types.js';

/**
 * Unified storage engine class
 */
export class UnifiedEngine implements StorageEngine {
    private readonly logger: Logger;
    private readonly engine: StorageEngine;
    private readonly validator: (task: Task, context: ValidationContext) => Promise<ValidationResult<ValidationError>>;

    constructor(
        engine: StorageEngine,
        validator: (task: Task, context: ValidationContext) => Promise<ValidationResult<ValidationError>>
    ) {
        this.engine = engine;
        this.validator = validator;
        this.logger = Logger.getInstance().child({ component: 'UnifiedEngine' });
    }

    /**
     * Create task
     */
    async create(task: Task): Promise<StorageResult<Task>> {
        try {
            // Validate task
            const context = createValidationContext({
                path: ['task'],
                metadata: {},
                operation: ValidationOperations.CREATE,
                value: task
            });

            const validationResult = await this.validator(task, context);
            if (!validationResult.valid) {
                return createErrorResult(
                    StorageError.validation(
                        validationResult.error?.message ?? 'Validation failed',
                        { errors: validationResult.errors }
                    )
                );
            }

            // Create task
            return this.engine.create(task);
        } catch (error) {
            this.logger.error('Task creation failed', { error, task });
            throw StorageError.internal('Task creation failed', { error });
        }
    }

    /**
     * Update task
     */
    async update(task: Task): Promise<StorageResult<Task>> {
        try {
            // Validate task
            const context = createValidationContext({
                path: ['task'],
                metadata: {},
                operation: ValidationOperations.UPDATE,
                value: task
            });

            const validationResult = await this.validator(task, context);
            if (!validationResult.valid) {
                return createErrorResult(
                    StorageError.validation(
                        validationResult.error?.message ?? 'Validation failed',
                        { errors: validationResult.errors }
                    )
                );
            }

            // Update task
            return this.engine.update(task);
        } catch (error) {
            this.logger.error('Task update failed', { error, task });
            throw StorageError.internal('Task update failed', { error });
        }
    }

    /**
     * Delete task
     */
    async delete(task: Task): Promise<StorageResult<void>> {
        try {
            // Validate task
            const context = createValidationContext({
                path: ['task'],
                metadata: {},
                operation: ValidationOperations.DELETE,
                value: task
            });

            const validationResult = await this.validator(task, context);
            if (!validationResult.valid) {
                return createErrorResult(
                    StorageError.validation(
                        validationResult.error?.message ?? 'Validation failed',
                        { errors: validationResult.errors }
                    )
                );
            }

            // Delete task
            return this.engine.delete(task);
        } catch (error) {
            this.logger.error('Task deletion failed', { error, task });
            throw StorageError.internal('Task deletion failed', { error });
        }
    }

    /**
     * Get task by ID
     */
    async get(id: string): Promise<StorageResult<Task>> {
        return this.engine.get(id);
    }

    /**
     * Get all tasks
     */
    async getAll(): Promise<StorageResult<Task[]>> {
        return this.engine.getAll();
    }

    /**
     * Get tasks by parent ID
     */
    async getByParentId(parentId: string): Promise<StorageResult<Task[]>> {
        return this.engine.getByParentId(parentId);
    }

    /**
     * Get tasks by status
     */
    async getByStatus(status: string): Promise<StorageResult<Task[]>> {
        return this.engine.getByStatus(status);
    }

    /**
     * Clear all tasks
     */
    async clear(): Promise<StorageResult<void>> {
        return this.engine.clear();
    }
}

/**
 * Create unified engine instance
 */
export function createUnifiedEngine(
    engine: StorageEngine,
    validator: (task: Task, context: ValidationContext) => Promise<ValidationResult<ValidationError>>
): UnifiedEngine {
    return new UnifiedEngine(engine, validator);
}
