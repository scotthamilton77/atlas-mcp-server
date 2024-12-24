import { TaskStatus, UpdateTaskInput } from '../../../types/task.js';
import { Logger } from '../../../logging/index.js';
import { TransactionManager } from '../transactions/transaction-manager.js';
import { TaskStorage } from '../../../types/storage.js';
import { ErrorCodes, createError } from '../../../errors/index.js';

export class StatusUpdateBatch {
    private readonly logger: Logger;
    private readonly transactionManager: TransactionManager;
    private readonly updates: Map<string, UpdateTaskInput> = new Map();
    private readonly processedTasks: Set<string> = new Set();

    constructor(
        private readonly storage: TaskStorage
    ) {
        this.logger = Logger.getInstance().child({ component: 'StatusUpdateBatch' });
        this.transactionManager = TransactionManager.getInstance(storage);
    }

    /**
     * Add a task status update to the batch
     */
    addUpdate(path: string, status: TaskStatus, metadata?: Record<string, any>): void {
        if (this.processedTasks.has(path)) {
            return; // Prevent circular updates
        }

        this.updates.set(path, {
            status,
            metadata: {
                ...metadata,
                statusUpdatedAt: Date.now()
            }
        });
        this.processedTasks.add(path);
    }

    /**
     * Execute all batched updates in a single transaction
     */
    async execute(): Promise<void> {
        if (this.updates.size === 0) {
            return;
        }

        const transaction = await this.transactionManager.begin({
            timeout: 30000, // 30 second timeout for batch operations
            requireLock: true
        });

        try {
            // Process updates in dependency order
            const orderedUpdates = await this.orderUpdatesByDependencies();

            for (const [path, update] of orderedUpdates) {
                const task = await this.storage.getTask(path);
                if (!task) {
                    this.logger.warn('Task not found during batch update', { path });
                    continue;
                }

                await this.storage.updateTask(path, update);
            }

            await this.transactionManager.commit(transaction);
            
            this.logger.info('Status update batch completed', {
                updateCount: this.updates.size,
                paths: Array.from(this.updates.keys())
            });
        } catch (error) {
            this.logger.error('Failed to execute status update batch', { error });
            await this.transactionManager.rollback(transaction);
            throw createError(
                ErrorCodes.OPERATION_FAILED,
                'Failed to execute status update batch',
                String(error)
            );
        } finally {
            this.updates.clear();
            this.processedTasks.clear();
        }
    }

    /**
     * Order updates based on task dependencies to prevent conflicts
     */
    private async orderUpdatesByDependencies(): Promise<Map<string, UpdateTaskInput>> {
        const ordered = new Map<string, UpdateTaskInput>();
        const visited = new Set<string>();
        const visiting = new Set<string>();

        const visit = async (path: string) => {
            if (visited.has(path)) return;
            if (visiting.has(path)) {
                throw createError(
                    ErrorCodes.INVALID_STATE,
                    `Circular dependency detected: ${path}`
                );
            }

            visiting.add(path);

            const task = await this.storage.getTask(path);
            if (task) {
                // Visit dependencies first
                for (const depPath of task.dependencies) {
                    if (this.updates.has(depPath)) {
                        await visit(depPath);
                    }
                }

                // Then add this task's update
                const update = this.updates.get(path);
                if (update) {
                    ordered.set(path, update);
                }
            }

            visiting.delete(path);
            visited.add(path);
        };

        // Visit all tasks in the update set
        for (const path of this.updates.keys()) {
            await visit(path);
        }

        return ordered;
    }

    /**
     * Get number of pending updates
     */
    get size(): number {
        return this.updates.size;
    }
}
