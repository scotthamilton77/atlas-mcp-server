import { Task } from '../../../types/task.js';

export interface CacheEntry {
    task: Task;
    timestamp: number;
    accessCount: number;
}

export interface CacheConfig {
    baseTTL: number;
    maxTTL: number;
    cleanupInterval: number;
}

export interface CacheManager {
    get(taskId: string): Task | null;
    set(taskId: string, task: Task): void;
    delete(taskId: string): void;
    clear(): void;
    cleanup(): void;
}
