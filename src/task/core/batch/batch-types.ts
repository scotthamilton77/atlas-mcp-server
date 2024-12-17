import { Task } from '../../../types/task.js';

export interface BatchOperation<T> {
    operation: (item: T) => Promise<void>;
    items: T[];
    onError?: (error: Error, item: T) => Promise<void>;
}

export interface BatchResult {
    success: boolean;
    processedCount: number;
    failedCount: number;
    errors: Array<{
        item: unknown;
        error: Error;
    }>;
}

export interface BatchConfig {
    batchSize: number;
    concurrentBatches: number;
    retryCount: number;
    retryDelay: number;
}

export interface BatchProcessor {
    processBatch<T>(batch: T[], operation: (item: T) => Promise<void>): Promise<BatchResult>;
    processInBatches<T>(items: T[], batchSize: number, operation: (item: T) => Promise<void>): Promise<BatchResult>;
}

export interface TaskBatchOperation {
    type: 'add' | 'update' | 'remove';
    tasks: Task[];
    options?: {
        skipValidation?: boolean;
        forceUpdate?: boolean;
        ignoreErrors?: boolean;
    };
}

export interface TaskBatchResult extends BatchResult {
    affectedTasks: string[];
    transactionId?: string;
    validationErrors?: Array<{
        taskId: string;
        error: Error;
    }>;
}

export interface BatchProgressCallback {
    onBatchStart?: (batchIndex: number, totalBatches: number) => void;
    onBatchComplete?: (batchIndex: number, result: BatchResult) => void;
    onOperationComplete?: (itemIndex: number, totalItems: number) => void;
}
