import { Logger } from '../../logging/index.js';
import { PrimaryIndex, PrimaryIndexConfig } from './indexes/primary.js';
import { StatusIndex, StatusIndexConfig } from './indexes/status.js';
import { HierarchyIndex, HierarchyIndexConfig } from './indexes/hierarchy.js';
import { IndexError, IndexErrorType } from './types/entries.js';

/**
 * Index types
 */
export enum IndexType {
    PRIMARY = 'primary',
    STATUS = 'status',
    HIERARCHY = 'hierarchy'
}

/**
 * Index factory configuration
 */
export interface IndexFactoryConfig {
    primary?: Partial<PrimaryIndexConfig>;
    status?: Partial<StatusIndexConfig>;
    hierarchy?: Partial<HierarchyIndexConfig>;
}

/**
 * Index factory for creating and managing indexes
 */
export class IndexFactory {
    private readonly indexes: Map<IndexType, unknown>;
    private readonly logger: Logger;
    private readonly config: IndexFactoryConfig;

    constructor(config: IndexFactoryConfig = {}) {
        this.indexes = new Map();
        this.config = config;
        this.logger = Logger.getInstance().child({ component: 'IndexFactory' });
    }

    /**
     * Get primary index
     */
    getPrimaryIndex(): PrimaryIndex {
        return this.getOrCreateIndex(
            IndexType.PRIMARY,
            () => new PrimaryIndex(this.config.primary)
        );
    }

    /**
     * Get status index
     */
    getStatusIndex(): StatusIndex {
        return this.getOrCreateIndex(
            IndexType.STATUS,
            () => new StatusIndex(this.config.status)
        );
    }

    /**
     * Get hierarchy index
     */
    getHierarchyIndex(): HierarchyIndex {
        return this.getOrCreateIndex(
            IndexType.HIERARCHY,
            () => new HierarchyIndex(this.config.hierarchy)
        );
    }

    /**
     * Clear all indexes
     */
    async clearAll(): Promise<void> {
        const clearPromises: Promise<void>[] = [];

        for (const [type, index] of this.indexes) {
            try {
                switch (type) {
                    case IndexType.PRIMARY:
                        clearPromises.push((index as PrimaryIndex).clear());
                        break;
                    case IndexType.STATUS:
                        clearPromises.push((index as StatusIndex).clear());
                        break;
                    case IndexType.HIERARCHY:
                        clearPromises.push((index as HierarchyIndex).clear());
                        break;
                }
            } catch (error) {
                this.logger.error(`Failed to clear ${type} index`, { error });
            }
        }

        await Promise.all(clearPromises);
        this.indexes.clear();
    }

    /**
     * Get index statistics
     */
    getStats(): Record<IndexType, unknown> {
        const stats: Record<IndexType, unknown> = {} as Record<IndexType, unknown>;

        for (const [type, index] of this.indexes) {
            try {
                switch (type) {
                    case IndexType.PRIMARY:
                        stats[type] = (index as PrimaryIndex).getStats();
                        break;
                    case IndexType.STATUS:
                        stats[type] = (index as StatusIndex).getStats();
                        break;
                    case IndexType.HIERARCHY:
                        stats[type] = (index as HierarchyIndex).getStats();
                        break;
                }
            } catch (error) {
                this.logger.error(`Failed to get stats for ${type} index`, { error });
                stats[type] = { error: 'Failed to get stats' };
            }
        }

        return stats;
    }

    /**
     * Get or create index
     */
    private getOrCreateIndex<T>(type: IndexType, factory: () => T): T {
        const existing = this.indexes.get(type);
        if (existing) {
            return existing as T;
        }

        try {
            const index = factory();
            this.indexes.set(type, index);
            return index;
        } catch (error) {
            this.logger.error(`Failed to create ${type} index`, { error });
            throw this.createError(
                IndexErrorType.INTERNAL_ERROR,
                `Failed to create ${type} index: ${error instanceof Error ? error.message : String(error)}`
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
     * Get factory statistics
     */
    getFactoryStats(): {
        totalIndexes: number;
        indexTypes: IndexType[];
        memoryUsage: number;
    } {
        return {
            totalIndexes: this.indexes.size,
            indexTypes: Array.from(this.indexes.keys()),
            memoryUsage: process.memoryUsage().heapUsed
        };
    }
}

/**
 * Create index factory instance
 */
export function createIndexFactory(config?: IndexFactoryConfig): IndexFactory {
    return new IndexFactory(config);
}
