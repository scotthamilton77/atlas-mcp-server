import { Task } from '../../../shared/types/task.js';
import { StorageResult } from '../../storage/types/results.js';
import { StorageError, StorageErrorCode } from '../../storage/types/errors.js';

/**
 * Transaction interface
 */
export interface Transaction {
    id: string;
    state: TransactionState;
    startTime: Date;
    endTime?: Date;
    error?: Error;
    metadata?: Record<string, unknown>;
}

/**
 * Transaction error type
 */
export enum TransactionErrorType {
    INVALID_STATE = 'invalid_state',
    TIMEOUT = 'timeout',
    ROLLBACK_FAILED = 'rollback_failed',
    COMMIT_FAILED = 'commit_failed',
    VALIDATION_FAILED = 'validation_failed',
    OPERATION_FAILED = 'operation_failed'
}

/**
 * Transaction error interface
 */
export interface TransactionError extends Omit<StorageError, 'code'> {
    type: TransactionErrorType;
    transactionId: string;
    code: 'TRANSACTION_ERROR';
}

/**
 * Transaction participant interface
 */
export interface TransactionParticipant {
    prepare(): Promise<boolean>;
    commit(): Promise<boolean>;
    rollback(): Promise<boolean>;
}

/**
 * Transaction manager interface
 */
export interface TransactionManager {
    /**
     * Create task
     */
    create(task: Task): Promise<StorageResult<Task>>;

    /**
     * Update task
     */
    update(task: Task): Promise<StorageResult<Task>>;

    /**
     * Delete task
     */
    delete(task: Task): Promise<StorageResult<void>>;

    /**
     * Commit transaction
     */
    commit(): Promise<StorageResult<void>>;

    /**
     * Rollback transaction
     */
    rollback(): Promise<StorageResult<void>>;
}

/**
 * Transaction state enum
 */
export enum TransactionState {
    PENDING = 'pending',
    ACTIVE = 'active',
    COMMITTED = 'committed',
    ROLLED_BACK = 'rolled_back',
    FAILED = 'failed',
    ROLLING_BACK = 'rolling_back'
}


/**
 * Transaction metadata interface
 */
export interface TransactionMetadata {
    /**
     * Transaction ID
     */
    id: string;

    /**
     * Transaction state
     */
    state: TransactionState;

    /**
     * Transaction start time
     */
    startTime: Date;

    /**
     * Transaction end time
     */
    endTime?: Date;

    /**
     * Transaction error
     */
    error?: Error;

    /**
     * Additional metadata
     */
    [key: string]: unknown;
}
