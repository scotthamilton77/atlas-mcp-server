import { 
    BatchProgressCallback,
    BatchResult,
    DependentItem
} from '../../../types/batch.js';
import { ErrorCodes, createError } from '../../../errors/index.js';
import { GenericBatchProcessor } from './generic-batch-processor.js';

/**
 * Batch processor for handling items with dependencies.
 * Extends GenericBatchProcessor to add dependency-aware processing.
 * Uses types defined in src/types/batch.ts for consistent type definitions.
 */
export class DependencyAwareBatchProcessor<T extends DependentItem> extends GenericBatchProcessor<T> {
    /**
     * Process multiple batches of items with dependency ordering
     * @see BatchProcessor in src/types/batch.ts
     */
    override async processInBatches(
        items: T[],
        batchSize: number,
        operation: (item: T) => Promise<void>,
        progressCallback?: BatchProgressCallback
    ): Promise<BatchResult> {
        try {
            // Sort items based on dependencies
            const sortedItems = this.sortByDependencies(items);

            const batches = this.createBatches(sortedItems, batchSize);
            const totalBatches = batches.length;
            let currentBatch = 0;

            const result: BatchResult = {
                success: true,
                processedCount: 0,
                failedCount: 0,
                errors: []
            };

            // Process batches sequentially to maintain dependency order
            for (const batch of batches) {
                if (progressCallback?.onBatchStart) {
                    progressCallback.onBatchStart(currentBatch + 1, totalBatches);
                }

                const batchResult = await this.processBatch(
                    batch,
                    operation,
                    progressCallback
                );

                if (progressCallback?.onBatchComplete) {
                    progressCallback.onBatchComplete(currentBatch + 1, batchResult);
                }

                result.processedCount += batchResult.processedCount;
                result.failedCount += batchResult.failedCount;
                result.errors.push(...batchResult.errors);

                if (!batchResult.success) {
                    result.success = false;
                    // Stop processing on failure when dealing with dependencies
                    break;
                }

                currentBatch++;
            }

            this.logger.info('Dependency-aware batch processing completed', {
                totalItems: items.length,
                processedCount: result.processedCount,
                failedCount: result.failedCount,
                batchCount: totalBatches
            });

            return result;
        } catch (error) {
            this.logger.error('Dependency-aware batch processing failed', { error });
            throw error;
        }
    }

    /**
     * Sort items based on their dependencies using topological sort
     */
    private sortByDependencies(items: T[]): T[] {
        const graph = new Map<string, Set<string>>();
        const inDegree = new Map<string, number>();
        const itemMap = new Map<string, T>();

        // Build dependency graph
        for (const item of items) {
            const itemId = this.getItemId(item);
            if (!itemId) {
                throw createError(
                    ErrorCodes.INVALID_INPUT,
                    {
                        message: 'Item missing required identifier',
                        context: { item }
                    },
                    'Items must have either a path or id property'
                );
            }

            itemMap.set(itemId, item);
            if (!graph.has(itemId)) {
                graph.set(itemId, new Set());
            }

            if (item.dependencies) {
                for (const dep of item.dependencies) {
                    if (!graph.has(dep)) {
                        graph.set(dep, new Set());
                    }
                    graph.get(dep)!.add(itemId);
                    inDegree.set(itemId, (inDegree.get(itemId) || 0) + 1);
                }
            }
        }

        // Perform topological sort
        const sorted: T[] = [];
        const queue: string[] = [];

        // Find all nodes with no dependencies
        for (const [node] of graph) {
            if (!inDegree.has(node)) {
                queue.push(node);
            }
        }

        while (queue.length > 0) {
            const node = queue.shift()!;
            const item = itemMap.get(node);
            if (item) {
                sorted.push(item);
            }

            for (const dependent of graph.get(node) || []) {
                inDegree.set(dependent, inDegree.get(dependent)! - 1);
                if (inDegree.get(dependent) === 0) {
                    queue.push(dependent);
                }
            }
        }

        // Check for cycles
        if (sorted.length !== items.length) {
            throw createError(
                ErrorCodes.TASK_CYCLE,
                {
                    message: 'Circular dependencies detected',
                    context: {
                        graph: Object.fromEntries(graph),
                        inDegree: Object.fromEntries(inDegree),
                        processedCount: sorted.length,
                        totalItems: items.length
                    }
                },
                'Cannot process items with circular dependencies',
                'Review dependencies to ensure there are no cycles'
            );
        }

        return sorted;
    }

    /**
     * Get unique identifier for an item
     */
    private getItemId(item: T): string | undefined {
        return item.path || item.id;
    }

    /**
     * Pre-validate batch items
     * @see BaseBatchProcessor in src/task/core/batch/base-batch-processor.ts
     */
    protected async preValidateBatch(batch: T[]): Promise<void> {
        await super.preValidateBatch(batch);

        const missingIds = batch.filter(item => !this.getItemId(item));
        if (missingIds.length > 0) {
            throw createError(
                ErrorCodes.INVALID_INPUT,
                {
                    message: 'Items missing required identifiers',
                    context: { items: missingIds }
                },
                'All items must have either a path or id property'
            );
        }
    }
}
