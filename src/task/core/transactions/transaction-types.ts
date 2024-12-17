import { Task } from '../../../types/task.js';

export type OperationType = 'add' | 'update' | 'remove';

export interface TaskOperation {
    type: OperationType;
    task: Task;
    previousState?: Task;
}

export interface Transaction {
    id: string;
    operations: TaskOperation[];
    timestamp: string;
    metadata?: Record<string, unknown>;
}

export interface TransactionResult {
    success: boolean;
    transactionId: string;
    error?: Error;
    affectedTasks: string[];
}

export interface TransactionManager {
    startTransaction(): string;
    addOperation(transactionId: string, operation: TaskOperation): void;
    commitTransaction(transactionId: string): Promise<TransactionResult>;
    rollbackTransaction(transactionId: string): Promise<TransactionResult>;
    getTransaction(transactionId: string): Transaction | null;
    isActive(transactionId: string): boolean;
    clear(): void;
}

export interface TransactionConfig {
    timeout: number;
    maxOperationsPerTransaction: number;
    enableRollback: boolean;
}

export interface TransactionError extends Error {
    transactionId: string;
    operationType?: OperationType;
    taskId?: string;
}
