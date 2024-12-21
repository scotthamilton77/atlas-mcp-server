/**
 * Transaction types for atomic task operations
 */

import { Task } from '../../../types/task.js';

export interface Transaction {
    id: string;
    operations: Operation[];
    timestamp: number;
    status: TransactionStatus;
}

export type TransactionStatus = 'pending' | 'committed' | 'rolled_back';

export type Operation = 
    | DeleteOperation
    | UpdateOperation
    | CreateOperation;

export interface DeleteOperation {
    type: 'delete';
    paths: string[];
    tasks: Task[];
}

export interface UpdateOperation {
    type: 'update';
    path: string;
    task: Task;
}

export interface CreateOperation {
    type: 'create';
    task: Task;
}

export interface TransactionResult {
    success: boolean;
    transactionId: string;
    error?: Error;
}
