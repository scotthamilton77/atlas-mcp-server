import { Task } from '../../../types/task.js';

export interface CacheConfig {
    maxSize: number;        // Maximum number of entries in cache
    baseTTL: number;        // Base time-to-live in milliseconds
    maxTTL: number;         // Maximum time-to-live in milliseconds
    cleanupInterval: number; // Cleanup interval in milliseconds
    persistPath: string | null; // Optional path for cache persistence
}

export interface CacheEntry {
    task: Task;
    timestamp: number;
    lastAccessed: number;
    accessCount: number;
}

export interface CacheStats {
    size: number;
    hitRate: number;
    averageAccessCount: number;
    memoryUsage: number;
}

export interface CacheManager {
    get(path: string): Promise<Task | null>;
    set(path: string, task: Task): Promise<void>;
    delete(path: string): Promise<void>;
    clear(): Promise<void>;
    cleanup(): Promise<void>;
    destroy(): Promise<void>;
    getStats(): Promise<CacheStats>;
}
