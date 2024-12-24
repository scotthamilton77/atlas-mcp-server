import { Task } from './task.js';

export type TransactionStatus = 'pending' | 'committed' | 'rolled_back';

export interface Transaction {
  id: string;
  operations: Operation[];
  timestamp: number;
  status: TransactionStatus;
  timeout?: number;
  metadata?: {
    retryCount?: number;
    parentTransaction?: string;
    initiator?: string;
  };
}

export interface Operation {
  id: string;
  type: 'create' | 'update' | 'delete';
  timestamp: number;
  path: string;
  task?: Task;
  tasks?: Task[];
  previousState?: Partial<Task>;
  metadata?: Record<string, any>;
}

export interface TransactionResult {
  success: boolean;
  transactionId: string;
  error?: Error;
  metadata?: {
    duration: number;
    retryCount?: number;
  };
}

export interface TransactionOptions {
  timeout?: number;
  retryLimit?: number;
  retryDelay?: number;
  requireLock?: boolean;
}

export const DEFAULT_TRANSACTION_OPTIONS: TransactionOptions = {
  timeout: 30000, // 30 seconds
  retryLimit: 3,
  retryDelay: 1000, // 1 second
  requireLock: true
};
