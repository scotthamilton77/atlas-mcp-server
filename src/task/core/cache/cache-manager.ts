import { Task } from '../../../types/task.js';
import { Logger } from '../../../logging/index.js';
import { CacheEntry, CacheConfig, CacheManager } from './cache-types.js';

const DEFAULT_CONFIG: CacheConfig = {
    baseTTL: 60000, // 1 minute base TTL
    maxTTL: 300000, // 5 minutes maximum TTL
    cleanupInterval: 60000 // Run cleanup every minute
};

export class AdaptiveCacheManager implements CacheManager {
    private cache: Map<string, CacheEntry>;
    private logger: Logger;
    private config: CacheConfig;
    private cleanupTimer: ReturnType<typeof setInterval>;

    constructor(config: Partial<CacheConfig> = {}) {
        this.cache = new Map();
        this.logger = Logger.getInstance().child({ component: 'AdaptiveCacheManager' });
        this.config = { ...DEFAULT_CONFIG, ...config };

        // Start periodic cleanup
        this.cleanupTimer = setInterval(() => this.cleanup(), this.config.cleanupInterval);
    }

    /**
     * Gets a task from cache with adaptive TTL
     */
    get(taskId: string): Task | null {
        const entry = this.cache.get(taskId);
        if (!entry) {
            return null;
        }

        const ttl = Math.min(
            this.config.baseTTL * Math.log2(entry.accessCount + 1),
            this.config.maxTTL
        );

        if (Date.now() - entry.timestamp > ttl) {
            this.delete(taskId);
            return null;
        }

        // Update access count and timestamp for frequently accessed items
        entry.accessCount++;
        this.logger.debug('Cache hit', {
            taskId,
            accessCount: entry.accessCount,
            ttl
        });

        return entry.task;
    }

    /**
     * Sets a task in cache
     */
    set(taskId: string, task: Task): void {
        const existingEntry = this.cache.get(taskId);
        this.cache.set(taskId, {
            task,
            timestamp: Date.now(),
            accessCount: existingEntry ? existingEntry.accessCount + 1 : 1
        });

        this.logger.debug('Cache set', {
            taskId,
            accessCount: existingEntry ? existingEntry.accessCount + 1 : 1
        });
    }

    /**
     * Removes a task from cache
     */
    delete(taskId: string): void {
        this.cache.delete(taskId);
        this.logger.debug('Cache delete', { taskId });
    }

    /**
     * Clears all entries from cache
     */
    clear(): void {
        this.cache.clear();
        this.logger.debug('Cache cleared');
    }

    /**
     * Cleans up expired cache entries
     */
    cleanup(): void {
        const now = Date.now();
        let expiredCount = 0;

        for (const [taskId, entry] of this.cache.entries()) {
            const ttl = Math.min(
                this.config.baseTTL * Math.log2(entry.accessCount + 1),
                this.config.maxTTL
            );

            if (now - entry.timestamp > ttl) {
                this.cache.delete(taskId);
                expiredCount++;
            }
        }

        if (expiredCount > 0) {
            this.logger.debug('Cache cleanup', {
                expiredCount,
                remainingCount: this.cache.size
            });
        }
    }

    /**
     * Stops the cleanup timer
     */
    destroy(): void {
        clearInterval(this.cleanupTimer);
        this.logger.debug('Cache manager destroyed');
    }

    /**
     * Gets cache statistics
     */
    getStats(): {
        size: number;
        averageAccessCount: number;
        hitRate: number;
    } {
        const entries = Array.from(this.cache.values());
        const totalAccessCount = entries.reduce((sum, entry) => sum + entry.accessCount, 0);
        
        return {
            size: this.cache.size,
            averageAccessCount: this.cache.size > 0 ? totalAccessCount / this.cache.size : 0,
            hitRate: totalAccessCount > 0 ? entries.length / totalAccessCount : 0
        };
    }
}
