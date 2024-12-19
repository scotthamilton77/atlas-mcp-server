import { Task } from '../../../shared/types/task.js';
import { Logger } from '../../../logging/index.js';
import { StorageError } from '../../storage/types/errors.js';
import { StorageResult, createErrorResult, createSuccessResult } from '../../storage/types/results.js';
import {
    ValidationContext,
    ValidationOperations,
    ValidationResult,
    ValidationError,
    createValidationContext
} from '../../validation/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * File transaction manager class
 */
export class FileTransaction {
    private readonly logger: Logger;
    private readonly basePath: string;
    private readonly validator: (task: Task, context: ValidationContext) => Promise<ValidationResult<ValidationError>>;
    private readonly operations: Map<string, Task>;
    private readonly deletions: Set<string>;

    constructor(
        basePath: string,
        validator: (task: Task, context: ValidationContext) => Promise<ValidationResult<ValidationError>>
    ) {
        this.basePath = basePath;
        this.validator = validator;
        this.operations = new Map();
        this.deletions = new Set();
        this.logger = Logger.getInstance().child({ component: 'FileTransaction' });
    }

    /**
     * Create task
     */
    async create(task: Task): Promise<StorageResult<Task>> {
        try {
            const filePath = this.getFilePath(task.id);

            // Check if task exists
            if (await this.exists(task.id) || this.operations.has(task.id)) {
                return createErrorResult(
                    StorageError.alreadyExists(`Task already exists: ${task.id}`)
                );
            }

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

            // Store task
            this.operations.set(task.id, task);
            return createSuccessResult(task);
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
            // Check if task exists
            if (!(await this.exists(task.id)) && !this.operations.has(task.id)) {
                return createErrorResult(
                    StorageError.notFound(`Task not found: ${task.id}`)
                );
            }

            // Check if task is deleted
            if (this.deletions.has(task.id)) {
                return createErrorResult(
                    StorageError.invalidOperation(`Task is deleted: ${task.id}`)
                );
            }

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

            // Store task
            this.operations.set(task.id, task);
            return createSuccessResult(task);
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
            // Check if task exists
            if (!(await this.exists(task.id)) && !this.operations.has(task.id)) {
                return createErrorResult(
                    StorageError.notFound(`Task not found: ${task.id}`)
                );
            }

            // Check if task is already deleted
            if (this.deletions.has(task.id)) {
                return createErrorResult(
                    StorageError.invalidOperation(`Task is already deleted: ${task.id}`)
                );
            }

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

            // Mark task for deletion
            this.deletions.add(task.id);
            return createSuccessResult(undefined);
        } catch (error) {
            this.logger.error('Task deletion failed', { error, task });
            throw StorageError.internal('Task deletion failed', { error });
        }
    }

    /**
     * Commit transaction
     */
    async commit(): Promise<StorageResult<void>> {
        try {
            // Create base directory if needed
            await fs.mkdir(this.basePath, { recursive: true });

            // Apply operations
            for (const [id, task] of this.operations) {
                const filePath = this.getFilePath(id);
                await fs.writeFile(filePath, JSON.stringify(task, null, 2));
            }

            // Apply deletions
            for (const id of this.deletions) {
                const filePath = this.getFilePath(id);
                await fs.unlink(filePath).catch(() => {});
            }

            return createSuccessResult(undefined);
        } catch (error) {
            this.logger.error('Transaction commit failed', { error });
            throw StorageError.transaction('Transaction commit failed', { error });
        }
    }

    /**
     * Rollback transaction
     */
    async rollback(): Promise<StorageResult<void>> {
        try {
            // Clear operations
            this.operations.clear();
            this.deletions.clear();

            return createSuccessResult(undefined);
        } catch (error) {
            this.logger.error('Transaction rollback failed', { error });
            throw StorageError.transaction('Transaction rollback failed', { error });
        }
    }

    /**
     * Check if task exists
     */
    private async exists(id: string): Promise<boolean> {
        try {
            await fs.access(this.getFilePath(id));
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get file path for task
     */
    private getFilePath(id: string): string {
        return path.join(this.basePath, `${id}.json`);
    }
}

/**
 * Create file transaction instance
 */
export function createFileTransaction(
    basePath: string,
    validator: (task: Task, context: ValidationContext) => Promise<ValidationResult<ValidationError>>
): FileTransaction {
    return new FileTransaction(basePath, validator);
}
