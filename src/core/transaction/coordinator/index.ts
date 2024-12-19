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
import { TransactionManager, TransactionState } from '../types/common.js';
import {
    TransactionOperation,
    SingleTaskOperation,
    BatchTaskOperation,
    isSingleTaskOperation,
    isBatchOperation,
    isCreateOperation,
    isUpdateOperation,
    isDeleteOperation
} from '../types/operations.js';
import {
    TransactionResult,
    OperationResult,
    createSuccessTransactionResult,
    createErrorTransactionResult,
    createOperationResult
} from '../types/results.js';

/**
 * Transaction coordinator class
 */
export class TransactionCoordinator {
    private readonly logger: Logger;
    private readonly manager: TransactionManager;
    private readonly validator: (task: Task, context: ValidationContext) => Promise<ValidationResult<ValidationError>>;
    private active: boolean;
    private operations: OperationResult[];

    constructor(
        manager: TransactionManager,
        validator: (task: Task, context: ValidationContext) => Promise<ValidationResult<ValidationError>>
    ) {
        this.manager = manager;
        this.validator = validator;
        this.active = false;
        this.operations = [];
        this.logger = Logger.getInstance().child({ component: 'TransactionCoordinator' });
    }

    /**
     * Begin transaction
     */
    async begin(): Promise<TransactionResult<void>> {
        try {
            if (this.active) {
                return createErrorTransactionResult(
                    StorageError.invalidOperation('Transaction already active'),
                    TransactionState.FAILED
                );
            }

            this.active = true;
            this.operations = [];
            return createSuccessTransactionResult(undefined, TransactionState.ACTIVE);
        } catch (error) {
            this.logger.error('Transaction begin failed', { error });
            throw StorageError.transaction('Transaction begin failed', { error });
        }
    }

    /**
     * Execute operation
     */
    async execute(operation: TransactionOperation): Promise<StorageResult<Task | void>> {
        try {
            if (!this.active) {
                return createErrorResult(
                    StorageError.invalidOperation('No active transaction')
                );
            }

            if (isBatchOperation(operation)) {
                return this.executeBatchOperation(operation);
            } else {
                return this.executeSingleOperation(operation);
            }
        } catch (error) {
            this.logger.error('Transaction operation failed', { error, operation });
            throw StorageError.transaction('Transaction operation failed', { error });
        }
    }

    /**
     * Execute single operation
     */
    private async executeSingleOperation(operation: SingleTaskOperation): Promise<StorageResult<Task | void>> {
        // Create validation context
        const context = createValidationContext({
            path: ['task'],
            metadata: {
                transactionId: operation.id,
                operationType: operation.type
            },
            operation: this.mapOperationType(operation.type),
            value: operation.task
        });

        // Validate task
        const validationResult = await this.validator(operation.task, context);
        if (!validationResult.valid) {
            const result = createErrorResult(
                StorageError.validation(
                    validationResult.error?.message ?? 'Validation failed',
                    { errors: validationResult.errors }
                )
            );
            this.operations.push(createOperationResult(operation, false, undefined, result.error));
            return result as StorageResult<void | Task>;
        }

        // Execute operation
        let result: StorageResult<Task | void>;
        if (isCreateOperation(operation)) {
            result = await this.manager.create(operation.task);
        } else if (isUpdateOperation(operation)) {
            result = await this.manager.update(operation.task);
        } else if (isDeleteOperation(operation)) {
            result = await this.manager.delete(operation.task);
        } else {
            result = createErrorResult(
                StorageError.invalidOperation(`Invalid operation type: ${isCreateOperation(operation) ? 'create' : isUpdateOperation(operation) ? 'update' : isDeleteOperation(operation) ? 'delete' : 'unknown'}`)
            );
        }

        // Store operation result
        this.operations.push(createOperationResult(
            operation,
            result.success,
            'data' in result ? result.data as Task : undefined,
            result.error
        ));

        return result;
    }

    /**
     * Execute batch operation
     */
    private async executeBatchOperation(operation: BatchTaskOperation): Promise<StorageResult<void>> {
        const results: StorageResult<Task | void>[] = [];

        // Execute each operation
        for (const subOperation of operation.operations) {
            const result = await this.executeSingleOperation(subOperation);
            results.push(result);

            // Stop on first error if not all operations succeeded
            if (!result.success) {
                return createErrorResult(
                    StorageError.transaction('Batch operation failed', {
                        failedOperation: subOperation,
                        error: result.error
                    })
                );
            }
        }

        return createSuccessResult(undefined);
    }

    /**
     * Commit transaction
     */
    async commit(): Promise<TransactionResult<void>> {
        try {
            if (!this.active) {
                return createErrorTransactionResult(
                    StorageError.invalidOperation('No active transaction'),
                    TransactionState.FAILED
                );
            }

            const result = await this.manager.commit();
            this.active = false;

            if (result.success) {
                return createSuccessTransactionResult(undefined, TransactionState.COMMITTED, this.operations);
            } else {
                return createErrorTransactionResult(result.error!, TransactionState.FAILED, this.operations);
            }
        } catch (error) {
            this.logger.error('Transaction commit failed', { error });
            throw StorageError.transaction('Transaction commit failed', { error });
        }
    }

    /**
     * Rollback transaction
     */
    async rollback(): Promise<TransactionResult<void>> {
        try {
            if (!this.active) {
                return createErrorTransactionResult(
                    StorageError.invalidOperation('No active transaction'),
                    TransactionState.FAILED
                );
            }

            const result = await this.manager.rollback();
            this.active = false;

            if (result.success) {
                return createSuccessTransactionResult(undefined, TransactionState.ROLLED_BACK, this.operations);
            } else {
                return createErrorTransactionResult(result.error!, TransactionState.FAILED, this.operations);
            }
        } catch (error) {
            this.logger.error('Transaction rollback failed', { error });
            throw StorageError.transaction('Transaction rollback failed', { error });
        }
    }

    /**
     * Map operation type to validation operation
     */
    private mapOperationType(type: string): ValidationOperations {
        switch (type) {
            case 'create':
                return ValidationOperations.CREATE;
            case 'update':
                return ValidationOperations.UPDATE;
            case 'delete':
                return ValidationOperations.DELETE;
            default:
                throw new Error(`Invalid operation type: ${type}`);
        }
    }

    /**
     * Check if transaction is active
     */
    isActive(): boolean {
        return this.active;
    }

    /**
     * Get operation results
     */
    getOperationResults(): OperationResult[] {
        return [...this.operations];
    }
}

/**
 * Create transaction coordinator instance
 */
export function createTransactionCoordinator(
    manager: TransactionManager,
    validator: (task: Task, context: ValidationContext) => Promise<ValidationResult<ValidationError>>
): TransactionCoordinator {
    return new TransactionCoordinator(manager, validator);
}
