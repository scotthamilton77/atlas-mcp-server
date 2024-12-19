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
 * Hierarchy index configuration
 */
export interface HierarchyIndexConfig {
    maxDepth: number;
    maxChildren: number;
    validateRelations: boolean;
    trackAncestry: boolean;
}

/**
 * Default hierarchy index configuration
 */
export const DEFAULT_HIERARCHY_INDEX_CONFIG: HierarchyIndexConfig = {
    maxDepth: 10,
    maxChildren: 1000,
    validateRelations: true,
    trackAncestry: true
};

/**
 * Task relationship types
 */
export enum RelationType {
    PARENT = 'parent',
    CHILD = 'child',
    SIBLING = 'sibling'
}

/**
 * Hierarchy index for task parent-child relationships
 */
export class HierarchyIndex implements BaseIndex {
    private readonly parentToChildren: Map<string, Set<string>>;
    private readonly childToParent: Map<string, string>;
    private readonly ancestry: Map<string, Set<string>>;
    private readonly logger: Logger;
    private readonly config: HierarchyIndexConfig;

    constructor(config: Partial<HierarchyIndexConfig> = {}) {
        this.parentToChildren = new Map();
        this.childToParent = new Map();
        this.ancestry = new Map();
        this.config = { ...DEFAULT_HIERARCHY_INDEX_CONFIG, ...config };
        this.logger = Logger.getInstance().child({ component: 'HierarchyIndex' });
    }

    /**
     * Add or update an entry
     */
    async upsert(task: Task): Promise<IndexResult> {
        try {
            const { id, parentId } = task;

            // Remove existing relationships
            await this.removeRelationships(id);

            // Add new relationships
            if (parentId) {
                // Validate relationship
                if (this.config.validateRelations) {
                    await this.validateRelationship(id, parentId);
                }

                // Check children limit
                const siblings = this.parentToChildren.get(parentId);
                if (siblings && siblings.size >= this.config.maxChildren) {
                    throw this.createError(
                        IndexErrorType.LIMIT_EXCEEDED,
                        `Maximum number of children exceeded for parent ${parentId}`
                    );
                }

                // Update mappings
                if (!this.parentToChildren.has(parentId)) {
                    this.parentToChildren.set(parentId, new Set());
                }
                this.parentToChildren.get(parentId)!.add(id);
                this.childToParent.set(id, parentId);

                // Update ancestry
                if (this.config.trackAncestry) {
                    await this.updateAncestry(id, parentId);
                }
            }

            const entry: IndexEntry = {
                key: id,
                value: task,
                metadata: {
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    version: 1,
                    parentId,
                    childCount: this.parentToChildren.get(id)?.size ?? 0,
                    depth: this.calculateDepth(id)
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
            // Remove relationships
            await this.removeRelationships(id);

            const now = new Date().toISOString();
            const entry: IndexEntry = {
                key: id,
                value: null,
                metadata: {
                    createdAt: now,
                    updatedAt: now,
                    version: 1,
                    deletedAt: now
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
     * Query entries by relationship
     */
    async query(query: IndexQuery): Promise<IndexQueryResult> {
        try {
            const { filter, sort, limit = 100, offset = 0 } = query;
            const { id, type } = filter as { id: string; type: RelationType };

            if (!id || !type) {
                throw this.createError(
                    IndexErrorType.INVALID_OPERATION,
                    'ID and relationship type are required'
                );
            }

            let entries: string[] = [];

            switch (type) {
                case RelationType.PARENT:
                    const parentId = this.childToParent.get(id);
                    entries = parentId ? [parentId] : [];
                    break;
                case RelationType.CHILD:
                    entries = Array.from(this.parentToChildren.get(id) ?? []);
                    break;
                case RelationType.SIBLING:
                    const parent = this.childToParent.get(id);
                    if (parent) {
                        entries = Array.from(this.parentToChildren.get(parent) ?? [])
                            .filter(siblingId => siblingId !== id);
                    }
                    break;
                default:
                    throw this.createError(
                        IndexErrorType.INVALID_OPERATION,
                        `Invalid relationship type: ${type}`
                    );
            }

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
            const indexEntries: IndexEntry[] = entries.map(entryId => ({
                key: entryId,
                value: null,
                metadata: {
                    createdAt: now,
                    updatedAt: now,
                    version: 1,
                    relationType: type,
                    relationId: id
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
        this.parentToChildren.clear();
        this.childToParent.clear();
        this.ancestry.clear();
    }

    /**
     * Get ancestors of a task
     */
    async getAncestors(id: string): Promise<string[]> {
        if (!this.config.trackAncestry) {
            throw this.createError(
                IndexErrorType.INVALID_OPERATION,
                'Ancestry tracking is disabled'
            );
        }

        return Array.from(this.ancestry.get(id) ?? []);
    }

    /**
     * Get descendants of a task
     */
    async getDescendants(id: string): Promise<string[]> {
        const descendants = new Set<string>();
        const queue = Array.from(this.parentToChildren.get(id) ?? []);

        while (queue.length > 0) {
            const current = queue.shift()!;
            descendants.add(current);
            queue.push(...Array.from(this.parentToChildren.get(current) ?? []));
        }

        return Array.from(descendants);
    }

    /**
     * Remove relationships for a task
     */
    private async removeRelationships(id: string): Promise<void> {
        // Remove from parent's children
        const parentId = this.childToParent.get(id);
        if (parentId) {
            this.parentToChildren.get(parentId)?.delete(id);
            if (this.parentToChildren.get(parentId)?.size === 0) {
                this.parentToChildren.delete(parentId);
            }
        }

        // Remove from child to parent mapping
        this.childToParent.delete(id);

        // Remove children
        this.parentToChildren.delete(id);

        // Remove ancestry
        this.ancestry.delete(id);
    }

    /**
     * Validate relationship
     */
    private async validateRelationship(childId: string, parentId: string): Promise<void> {
        // Check for self-reference
        if (childId === parentId) {
            throw this.createError(
                IndexErrorType.INVALID_VALUE,
                'Task cannot be its own parent'
            );
        }

        // Check for circular reference
        if (await this.isCircularReference(childId, parentId)) {
            throw this.createError(
                IndexErrorType.INVALID_VALUE,
                'Circular reference detected'
            );
        }

        // Check depth limit
        const depth = this.calculateDepth(parentId);
        if (depth >= this.config.maxDepth) {
            throw this.createError(
                IndexErrorType.LIMIT_EXCEEDED,
                'Maximum hierarchy depth exceeded'
            );
        }
    }

    /**
     * Check for circular reference
     */
    private async isCircularReference(childId: string, parentId: string): Promise<boolean> {
        const ancestors = await this.getAncestors(parentId);
        return ancestors.includes(childId);
    }

    /**
     * Update ancestry for a task
     */
    private async updateAncestry(childId: string, parentId: string): Promise<void> {
        const ancestors = new Set<string>();
        ancestors.add(parentId);

        const parentAncestors = this.ancestry.get(parentId);
        if (parentAncestors) {
            parentAncestors.forEach(ancestor => ancestors.add(ancestor));
        }

        this.ancestry.set(childId, ancestors);
    }

    /**
     * Calculate depth of a task
     */
    private calculateDepth(id: string): number {
        let depth = 0;
        let currentId = id;

        while (this.childToParent.has(currentId)) {
            depth++;
            currentId = this.childToParent.get(currentId)!;
        }

        return depth;
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
        let totalDepth = 0;
        let maxDepth = 0;
        let totalChildren = 0;
        let maxChildren = 0;

        for (const id of this.childToParent.keys()) {
            const depth = this.calculateDepth(id);
            totalDepth += depth;
            maxDepth = Math.max(maxDepth, depth);
        }

        for (const children of this.parentToChildren.values()) {
            const childCount = children.size;
            totalChildren += childCount;
            maxChildren = Math.max(maxChildren, childCount);
        }

        const totalEntries = this.childToParent.size;

        return {
            totalEntries,
            maxDepth,
            averageDepth: totalEntries > 0 ? totalDepth / totalEntries : 0,
            maxChildren,
            averageChildren: this.parentToChildren.size > 0
                ? totalChildren / this.parentToChildren.size
                : 0,
            memoryUsage: process.memoryUsage().heapUsed
        };
    }
}
