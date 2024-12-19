import { Task } from '../../../shared/types/task.js';
import { Logger } from '../../../logging/index.js';
import {
    IndexEntry,
    IndexOperation,
    IndexOperationType,
    IndexResult,
    IndexError,
    IndexErrorType,
    IndexQuery,
    IndexQueryResult
} from '../types/entries.js';
import { BaseIndex } from '../types/common.js';

/**
 * Status index configuration
 */
export interface StatusIndexConfig {
    validateStatus: boolean;
    trackTransitions: boolean;
    maxEntriesPerStatus: number;
    maxStatusValues: number;
}

/**
 * Default status index configuration
 */
export const DEFAULT_STATUS_INDEX_CONFIG: StatusIndexConfig = {
    validateStatus: true,
    trackTransitions: true,
    maxEntriesPerStatus: 1000000,
    maxStatusValues: 100
};

/**
 * Valid task status values
 */
export const VALID_STATUS_VALUES = [
    'pending',
    'in_progress',
    'completed',
    'failed',
    'blocked'
] as const;

export type TaskStatus = typeof VALID_STATUS_VALUES[number];

/**
 * Status index for task lookup by status
 */
export class StatusIndex implements BaseIndex {
    private readonly entriesByStatus: Map<TaskStatus, Set<string>>;
    private readonly statusByEntry: Map<string, TaskStatus>;
    private readonly transitions: Map<TaskStatus, TaskStatus[]>;
    private readonly logger: Logger;
    private readonly config: StatusIndexConfig;

    constructor(config: Partial<StatusIndexConfig> = {}) {
        this.entriesByStatus = new Map();
        this.statusByEntry = new Map();
        this.transitions = new Map();
        this.config = { ...DEFAULT_STATUS_INDEX_CONFIG, ...config };
        this.logger = Logger.getInstance().child({ component: 'StatusIndex' });

        // Initialize status sets
        for (const status of VALID_STATUS_VALUES) {
            this.entriesByStatus.set(status, new Set());
        }
    }

    /**
     * Add or update an entry
     */
    async upsert(task: Task): Promise<IndexResult> {
        try {
            const { id, status } = task;

            // Validate status
            if (this.config.validateStatus) {
                this.validateStatus(status as TaskStatus);
            }

            // Check status limit
            if (!this.entriesByStatus.has(status as TaskStatus)) {
                if (this.entriesByStatus.size >= this.config.maxStatusValues) {
                    throw this.createError(
                        IndexErrorType.LIMIT_EXCEEDED,
                        'Maximum number of status values exceeded'
                    );
                }
                this.entriesByStatus.set(status as TaskStatus, new Set());
            }

            // Check entries per status limit
            const statusEntries = this.entriesByStatus.get(status as TaskStatus)!;
            if (!statusEntries.has(id) && statusEntries.size >= this.config.maxEntriesPerStatus) {
                throw this.createError(
                    IndexErrorType.LIMIT_EXCEEDED,
                    `Maximum number of entries for status ${status} exceeded`
                );
            }

            // Track status transition
            if (this.config.trackTransitions) {
                const previousStatus = this.statusByEntry.get(id);
                if (previousStatus && previousStatus !== status) {
                    this.trackTransition(previousStatus, status as TaskStatus);
                }
            }

            // Update status mappings
            const previousStatus = this.statusByEntry.get(id);
            if (previousStatus) {
                this.entriesByStatus.get(previousStatus)?.delete(id);
            }
            this.entriesByStatus.get(status as TaskStatus)?.add(id);
            this.statusByEntry.set(id, status as TaskStatus);

            const entry: IndexEntry = {
                key: id,
                value: task,
                metadata: {
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    version: 1,
                    previousStatus,
                    currentStatus: status
                }
            };

            return {
                success: true,
                operation: IndexOperationType.UPSERT,
                entry
            };
        } catch (error) {
            this.logger.error('Failed to upsert entry', { error, task });
            throw this.wrapError(error);
        }
    }

    /**
     * Delete an entry
     */
    async delete(id: string): Promise<IndexResult> {
        try {
            const status = this.statusByEntry.get(id);
            if (!status) {
                throw this.createError(
                    IndexErrorType.NOT_FOUND,
                    `Entry not found: ${id}`
                );
            }

            // Remove from mappings
            this.entriesByStatus.get(status)?.delete(id);
            this.statusByEntry.delete(id);

            const now = new Date().toISOString();
            const entry: IndexEntry = {
                key: id,
                value: null,
                metadata: {
                    createdAt: now,
                    updatedAt: now,
                    version: 1,
                    deletedAt: now,
                    previousStatus: status
                }
            };

            return {
                success: true,
                operation: IndexOperationType.DELETE,
                entry
            };
        } catch (error) {
            this.logger.error('Failed to delete entry', { error, id });
            throw this.wrapError(error);
        }
    }

    /**
     * Query entries by status
     */
    async query(query: IndexQuery): Promise<IndexQueryResult> {
        try {
            const { filter, sort, limit = 100, offset = 0 } = query;
            const status = filter?.status as TaskStatus;

            if (!status) {
                throw this.createError(
                    IndexErrorType.INVALID_OPERATION,
                    'Status filter is required'
                );
            }

            if (!this.entriesByStatus.has(status)) {
                return {
                    success: true,
                    operation: IndexOperationType.QUERY,
                    entries: [],
                    total: 0,
                    offset,
                    limit,
                    hasMore: false
                };
            }

            let entries = Array.from(this.entriesByStatus.get(status)!);

            // Apply sorting
            if (sort?.length) {
                entries.sort((a, b) => {
                    for (const { field, order } of sort) {
                        if (field === 'id') {
                            if (a < b) return order === 'asc' ? -1 : 1;
                            if (a > b) return order === 'asc' ? 1 : -1;
                        }
                    }
                    return 0;
                });
            }

            // Apply pagination
            const total = entries.length;
            entries = entries.slice(offset, offset + limit);

            const now = new Date().toISOString();
            const indexEntries: IndexEntry[] = entries.map(id => ({
                key: id,
                value: null,
                metadata: {
                    createdAt: now,
                    updatedAt: now,
                    version: 1,
                    status
                }
            }));

            return {
                success: true,
                operation: IndexOperationType.QUERY,
                entries: indexEntries,
                total,
                offset,
                limit,
                hasMore: offset + limit < total
            };
        } catch (error) {
            this.logger.error('Failed to query entries', { error, query });
            throw this.wrapError(error);
        }
    }

    /**
     * Execute batch operations
     */
    async batch(operations: IndexOperation[]): Promise<IndexResult[]> {
        const results: IndexResult[] = [];

        for (const operation of operations) {
            try {
                let result: IndexResult;

                switch (operation.type) {
                    case IndexOperationType.UPSERT:
                        if (!operation.value) {
                            throw this.createError(
                                IndexErrorType.INVALID_OPERATION,
                                'Value is required for upsert operation'
                            );
                        }
                        result = await this.upsert(operation.value as Task);
                        break;
                    case IndexOperationType.DELETE:
                        if (!operation.key) {
                            throw this.createError(
                                IndexErrorType.INVALID_OPERATION,
                                'Key is required for delete operation'
                            );
                        }
                        result = await this.delete(operation.key);
                        break;
                    default:
                        throw this.createError(
                            IndexErrorType.INVALID_OPERATION,
                            `Invalid operation type: ${operation.type}`
                        );
                }

                results.push(result);
            } catch (error) {
                results.push({
                    success: false,
                    operation: operation.type,
                    error: this.wrapError(error)
                });
            }
        }

        return results;
    }

    /**
     * Clear all entries
     */
    async clear(): Promise<void> {
        this.entriesByStatus.clear();
        this.statusByEntry.clear();
        this.transitions.clear();

        // Reinitialize status sets
        for (const status of VALID_STATUS_VALUES) {
            this.entriesByStatus.set(status, new Set());
        }
    }

    /**
     * Get status counts
     */
    async getStatusCounts(): Promise<Record<TaskStatus, number>> {
        const counts: Record<TaskStatus, number> = {} as Record<TaskStatus, number>;
        for (const [status, entries] of this.entriesByStatus) {
            counts[status] = entries.size;
        }
        return counts;
    }

    /**
     * Get status transitions
     */
    async getStatusTransitions(): Promise<Record<TaskStatus, TaskStatus[]>> {
        if (!this.config.trackTransitions) {
            throw this.createError(
                IndexErrorType.INVALID_OPERATION,
                'Status transitions tracking is disabled'
            );
        }

        const transitions: Record<TaskStatus, TaskStatus[]> = {} as Record<TaskStatus, TaskStatus[]>;
        for (const [fromStatus, toStatuses] of this.transitions) {
            transitions[fromStatus] = Array.from(new Set(toStatuses));
        }
        return transitions;
    }

    /**
     * Validate status value
     */
    private validateStatus(status: TaskStatus): void {
        if (!status) {
            throw this.createError(
                IndexErrorType.INVALID_VALUE,
                'Status cannot be empty'
            );
        }

        if (!VALID_STATUS_VALUES.includes(status)) {
            throw this.createError(
                IndexErrorType.INVALID_VALUE,
                `Invalid status value: ${status}`
            );
        }
    }

    /**
     * Track status transition
     */
    private trackTransition(fromStatus: TaskStatus, toStatus: TaskStatus): void {
        if (!this.transitions.has(fromStatus)) {
            this.transitions.set(fromStatus, []);
        }
        this.transitions.get(fromStatus)!.push(toStatus);
    }

    /**
     * Create index error
     */
    private createError(type: IndexErrorType, message: string): IndexError {
        return {
            type,
            message,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Wrap error in index error
     */
    private wrapError(error: unknown): IndexError {
        if (this.isIndexError(error)) {
            return error;
        }

        return this.createError(
            IndexErrorType.INTERNAL_ERROR,
            error instanceof Error ? error.message : String(error)
        );
    }

    /**
     * Check if error is index error
     */
    private isIndexError(error: unknown): error is IndexError {
        return (
            typeof error === 'object' &&
            error !== null &&
            'type' in error &&
            'message' in error &&
            'timestamp' in error
        );
    }

    /**
     * Get index statistics
     */
    getStats(): Record<string, unknown> {
        const entriesPerStatus: Record<string, number> = {};
        let totalEntries = 0;

        for (const [status, entries] of this.entriesByStatus) {
            entriesPerStatus[status] = entries.size;
            totalEntries += entries.size;
        }

        return {
            totalEntries,
            entriesPerStatus,
            transitionCount: Array.from(this.transitions.values())
                .reduce((sum, transitions) => sum + transitions.length, 0),
            memoryUsage: process.memoryUsage().heapUsed
        };
    }
}
