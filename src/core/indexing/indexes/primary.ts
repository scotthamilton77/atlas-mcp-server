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
 * Primary index configuration
 */
export interface PrimaryIndexConfig {
    caseSensitive: boolean;
    validateKeys: boolean;
    maxKeyLength: number;
    maxEntries: number;
}

/**
 * Default primary index configuration
 */
export const DEFAULT_PRIMARY_INDEX_CONFIG: PrimaryIndexConfig = {
    caseSensitive: false,
    validateKeys: true,
    maxKeyLength: 100,
    maxEntries: 1000000
};

/**
 * Primary index for task lookup by ID
 */
export class PrimaryIndex implements BaseIndex {
    private readonly entries: Map<string, IndexEntry>;
    private readonly logger: Logger;
    private readonly config: PrimaryIndexConfig;

    constructor(config: Partial<PrimaryIndexConfig> = {}) {
        this.entries = new Map();
        this.config = { ...DEFAULT_PRIMARY_INDEX_CONFIG, ...config };
        this.logger = Logger.getInstance().child({ component: 'PrimaryIndex' });
    }

    /**
     * Add or update an entry
     */
    async upsert(task: Task): Promise<IndexResult> {
        try {
            const key = this.normalizeKey(task.id);

            // Validate key
            if (this.config.validateKeys) {
                this.validateKey(key);
            }

            // Check entry limit
            if (!this.entries.has(key) && this.entries.size >= this.config.maxEntries) {
                throw this.createError(
                    IndexErrorType.LIMIT_EXCEEDED,
                    'Maximum number of entries exceeded'
                );
            }

            // Create entry
            const entry: IndexEntry = {
                key,
                value: task,
                metadata: {
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    version: 1
                }
            };

            // Update existing entry
            const existing = this.entries.get(key);
            if (existing) {
                entry.metadata = {
                    ...existing.metadata,
                    updatedAt: new Date().toISOString(),
                    version: (existing.metadata.version ?? 0) + 1
                };
            }

            this.entries.set(key, entry);

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
     * Get an entry by key
     */
    async get(key: string): Promise<IndexResult> {
        try {
            const normalizedKey = this.normalizeKey(key);
            const entry = this.entries.get(normalizedKey);

            if (!entry) {
                throw this.createError(
                    IndexErrorType.NOT_FOUND,
                    `Entry not found: ${key}`
                );
            }

            return {
                success: true,
                operation: IndexOperationType.GET,
                entry
            };
        } catch (error) {
            this.logger.error('Failed to get entry', { error, key });
            throw this.wrapError(error);
        }
    }

    /**
     * Delete an entry by key
     */
    async delete(key: string): Promise<IndexResult> {
        try {
            const normalizedKey = this.normalizeKey(key);
            const entry = this.entries.get(normalizedKey);

            if (!entry) {
                throw this.createError(
                    IndexErrorType.NOT_FOUND,
                    `Entry not found: ${key}`
                );
            }

            this.entries.delete(normalizedKey);

            return {
                success: true,
                operation: IndexOperationType.DELETE,
                entry
            };
        } catch (error) {
            this.logger.error('Failed to delete entry', { error, key });
            throw this.wrapError(error);
        }
    }

    /**
     * Query entries
     */
    async query(query: IndexQuery): Promise<IndexQueryResult> {
        try {
            const { filter, sort, limit = 100, offset = 0 } = query;

            // Get all entries
            let entries = Array.from(this.entries.values());

            // Apply filters
            if (filter) {
                entries = entries.filter(entry => {
                    const task = entry.value as Task;
                    return Object.entries(filter).every(([key, value]) => 
                        task[key as keyof Task] === value
                    );
                });
            }

            // Apply sorting
            if (sort?.length) {
                entries.sort((a, b) => {
                    for (const { field, order } of sort) {
                        const aTask = a.value as Task;
                        const bTask = b.value as Task;
                        const aValue = aTask[field as keyof Task] ?? null;
                        const bValue = bTask[field as keyof Task] ?? null;

                        // Handle null/undefined values
                        if (aValue === null && bValue === null) return 0;
                        if (aValue === null) return order === 'asc' ? -1 : 1;
                        if (bValue === null) return order === 'asc' ? 1 : -1;

                        // Compare non-null values
                        if (aValue < bValue) return order === 'asc' ? -1 : 1;
                        if (aValue > bValue) return order === 'asc' ? 1 : -1;
                    }
                    return 0;
                });
            }

            // Apply pagination
            const total = entries.length;
            entries = entries.slice(offset, offset + limit);

            return {
                success: true,
                operation: IndexOperationType.QUERY,
                entries,
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
     * Check if key exists
     */
    async exists(key: string): Promise<boolean> {
        const normalizedKey = this.normalizeKey(key);
        return this.entries.has(normalizedKey);
    }

    /**
     * Get all entries
     */
    async getAll(): Promise<IndexEntry[]> {
        return Array.from(this.entries.values());
    }

    /**
     * Clear all entries
     */
    async clear(): Promise<void> {
        this.entries.clear();
    }

    /**
     * Get entry count
     */
    async count(): Promise<number> {
        return this.entries.size;
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
     * Normalize key based on configuration
     */
    private normalizeKey(key: string): string {
        return this.config.caseSensitive ? key : key.toLowerCase();
    }

    /**
     * Validate key based on configuration
     */
    private validateKey(key: string): void {
        if (!key) {
            throw this.createError(
                IndexErrorType.INVALID_KEY,
                'Key cannot be empty'
            );
        }

        if (key.length > this.config.maxKeyLength) {
            throw this.createError(
                IndexErrorType.INVALID_KEY,
                `Key length exceeds maximum of ${this.config.maxKeyLength}`
            );
        }

        if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
            throw this.createError(
                IndexErrorType.INVALID_KEY,
                'Key contains invalid characters'
            );
        }
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
        const keys = Array.from(this.entries.keys());
        const totalKeyLength = keys.reduce((sum, key) => sum + key.length, 0);

        return {
            totalEntries: this.entries.size,
            averageKeyLength: this.entries.size > 0
                ? totalKeyLength / this.entries.size
                : 0,
            memoryUsage: process.memoryUsage().heapUsed
        };
    }
}
