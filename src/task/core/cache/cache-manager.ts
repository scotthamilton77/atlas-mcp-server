import { Task } from '../../../types/task.js';
import { Logger } from '../../../logging/index.js';
import { CacheEntry, CacheConfig, CacheManager } from './cache-types.js';

const DEFAULT_CONFIG: CacheConfig = {
    maxSize: 1000, // Maximum number of entries
    baseTTL: 60000, // 1 minute base TTL
    maxTTL: 300000, // 5 minutes maximum TTL
    cleanupInterval: 60000, // Run cleanup every minute
    persistPath: null // Optional path for cache persistence
};

interface LRUNode {
    key: string;
    entry: CacheEntry;
    prev: LRUNode | null;
    next: LRUNode | null;
}

/**
 * Enhanced cache manager with LRU eviction, persistence, and adaptive TTL
 */
export class EnhancedCacheManager implements CacheManager {
    private cache: Map<string, LRUNode>;
    private head: LRUNode | null = null;
    private tail: LRUNode | null = null;
    private logger: Logger;
    private config: CacheConfig;
    private cleanupTimer: ReturnType<typeof setInterval>;
    private hits: number = 0;
    private misses: number = 0;

    constructor(config: Partial<CacheConfig> = {}) {
        this.cache = new Map();
        this.logger = Logger.getInstance().child({ component: 'EnhancedCacheManager' });
        this.config = { ...DEFAULT_CONFIG, ...config };

        // Start periodic cleanup and persistence
        this.cleanupTimer = setInterval(() => {
            this.cleanup();
            if (this.config.persistPath) {
                this.persistCache();
            }
        }, this.config.cleanupInterval);

        // Load persisted cache if available
        if (this.config.persistPath) {
            this.loadPersistedCache();
        }
    }

    /**
     * Gets a task from cache with LRU update and adaptive TTL
     */
    get(taskId: string): Task | null {
        const node = this.cache.get(taskId);
        if (!node) {
            this.misses++;
            this.logger.debug('Cache miss', { taskId });
            return null;
        }

        const ttl = this.calculateAdaptiveTTL(node.entry);
        if (Date.now() - node.entry.timestamp > ttl) {
            this.delete(taskId);
            this.misses++;
            return null;
        }

        // Move to front of LRU list
        this.moveToFront(node);

        // Update access statistics
        node.entry.accessCount++;
        node.entry.lastAccessed = Date.now();
        this.hits++;

        this.logger.debug('Cache hit', {
            taskId,
            accessCount: node.entry.accessCount,
            ttl
        });

        return node.entry.task;
    }

    /**
     * Sets a task in cache with LRU eviction
     */
    set(taskId: string, task: Task): void {
        const existingNode = this.cache.get(taskId);
        const timestamp = Date.now();

        if (existingNode) {
            // Update existing entry
            existingNode.entry = {
                task,
                timestamp,
                lastAccessed: timestamp,
                accessCount: existingNode.entry.accessCount + 1
            };
            this.moveToFront(existingNode);
        } else {
            // Create new entry
            const newNode: LRUNode = {
                key: taskId,
                entry: {
                    task,
                    timestamp,
                    lastAccessed: timestamp,
                    accessCount: 1
                },
                prev: null,
                next: null
            };

            // Evict if at capacity
            if (this.cache.size >= this.config.maxSize) {
                this.evictLRU();
            }

            this.cache.set(taskId, newNode);
            this.addToFront(newNode);
        }

        this.logger.debug('Cache set', {
            taskId,
            cacheSize: this.cache.size,
            maxSize: this.config.maxSize
        });
    }

    /**
     * Removes a task from cache
     */
    delete(taskId: string): void {
        const node = this.cache.get(taskId);
        if (node) {
            this.removeFromList(node);
            this.cache.delete(taskId);
            this.logger.debug('Cache delete', { taskId });
        }
    }

    /**
     * Clears all entries from cache
     */
    clear(): void {
        this.cache.clear();
        this.head = null;
        this.tail = null;
        this.hits = 0;
        this.misses = 0;
        this.logger.debug('Cache cleared');
    }

    /**
     * Cleans up expired cache entries
     */
    cleanup(): void {
        const now = Date.now();
        let expiredCount = 0;
        let node = this.tail;

        while (node) {
            const ttl = this.calculateAdaptiveTTL(node.entry);
            if (now - node.entry.timestamp > ttl) {
                const prevNode = node.prev;
                this.delete(node.key);
                expiredCount++;
                node = prevNode;
            } else {
                node = node.prev;
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
     * Stops the cleanup timer and persists cache if configured
     */
    destroy(): void {
        clearInterval(this.cleanupTimer);
        if (this.config.persistPath) {
            this.persistCache();
        }
        this.logger.debug('Cache manager destroyed');
    }

    /**
     * Gets detailed cache statistics
     */
    getStats(): {
        size: number;
        hitRate: number;
        averageAccessCount: number;
        memoryUsage: number;
    } {
        const entries = Array.from(this.cache.values());
        const totalAccessCount = entries.reduce((sum, node) => sum + node.entry.accessCount, 0);
        const totalHits = this.hits + this.misses;
        
        return {
            size: this.cache.size,
            hitRate: totalHits > 0 ? this.hits / totalHits : 0,
            averageAccessCount: this.cache.size > 0 ? totalAccessCount / this.cache.size : 0,
            memoryUsage: process.memoryUsage().heapUsed
        };
    }

    /**
     * Calculates adaptive TTL based on access patterns
     */
    private calculateAdaptiveTTL(entry: CacheEntry): number {
        const baseMultiplier = Math.log2(entry.accessCount + 1);
        const recencyBonus = Math.max(0, 1 - (Date.now() - entry.lastAccessed) / this.config.maxTTL);
        return Math.min(
            this.config.baseTTL * (baseMultiplier + recencyBonus),
            this.config.maxTTL
        );
    }

    /**
     * Moves a node to the front of the LRU list
     */
    private moveToFront(node: LRUNode): void {
        if (node === this.head) return;
        this.removeFromList(node);
        this.addToFront(node);
    }

    /**
     * Adds a node to the front of the LRU list
     */
    private addToFront(node: LRUNode): void {
        if (!this.head) {
            this.head = node;
            this.tail = node;
        } else {
            node.next = this.head;
            this.head.prev = node;
            this.head = node;
        }
    }

    /**
     * Removes a node from the LRU list
     */
    private removeFromList(node: LRUNode): void {
        if (node.prev) node.prev.next = node.next;
        if (node.next) node.next.prev = node.prev;
        if (node === this.head) this.head = node.next;
        if (node === this.tail) this.tail = node.prev;
        node.prev = null;
        node.next = null;
    }

    /**
     * Evicts the least recently used entry
     */
    private evictLRU(): void {
        if (this.tail) {
            this.logger.debug('Cache eviction', {
                taskId: this.tail.key,
                accessCount: this.tail.entry.accessCount,
                lastAccessed: new Date(this.tail.entry.lastAccessed).toISOString()
            });
            this.delete(this.tail.key);
        }
    }

    /**
     * Persists cache to disk if configured
     */
    private persistCache(): void {
        if (!this.config.persistPath) return;

        const persistData = {
            entries: Array.from(this.cache.entries()).map(([key, node]) => ({
                key,
                entry: node.entry
            })),
            stats: {
                hits: this.hits,
                misses: this.misses
            }
        };

        try {
            require('fs').writeFileSync(
                this.config.persistPath,
                JSON.stringify(persistData),
                'utf8'
            );
            this.logger.debug('Cache persisted', {
                path: this.config.persistPath,
                entries: persistData.entries.length
            });
        } catch (error) {
            this.logger.error('Failed to persist cache', { error });
        }
    }

    /**
     * Loads persisted cache from disk
     */
    private loadPersistedCache(): void {
        if (!this.config.persistPath) return;

        try {
            const data = require('fs').readFileSync(this.config.persistPath, 'utf8');
            const persistData = JSON.parse(data);

            this.clear();
            for (const { key, entry } of persistData.entries) {
                if (Date.now() - entry.timestamp <= this.config.maxTTL) {
                    this.set(key, entry.task);
                }
            }

            this.hits = persistData.stats.hits;
            this.misses = persistData.stats.misses;

            this.logger.debug('Cache loaded', {
                path: this.config.persistPath,
                entries: this.cache.size
            });
        } catch (error) {
            this.logger.error('Failed to load persisted cache', { error });
        }
    }
}
