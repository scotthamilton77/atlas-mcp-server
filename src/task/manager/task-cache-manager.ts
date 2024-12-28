import { Logger } from '../../logging/index.js';
import { formatTimestamp } from '../../utils/date-formatter.js';
import { CacheManager } from '../core/cache/cache-manager.js';
import { CacheOptions } from '../../types/cache.js';
import { TaskIndexManager } from '../core/indexing/index-manager.js';
import { TaskEventHandler } from './task-event-handler.js';
import { Task, TaskType, TaskStatus } from '../../types/task.js';
import { TaskStorage } from '../../types/storage.js';
import { PlatformCapabilities } from '../../utils/platform-utils.js';

export class TaskCacheManager {
    private readonly logger: Logger;
    private readonly cacheManager: CacheManager;
    private readonly indexManager: TaskIndexManager;
    private readonly eventHandler: TaskEventHandler;
    private memoryMonitor?: NodeJS.Timeout;
    private lastCleanupTime: number = 0;

    // Memory management constants
    private readonly MAX_CACHE_MEMORY = 16 * 1024 * 1024; // 16MB cache limit for VSCode extension
    private readonly MEMORY_CHECK_INTERVAL = 5000; // 5 seconds
    private readonly MEMORY_PRESSURE_THRESHOLD = 0.6; // 60% of max before cleanup
    private readonly MEMORY_CHECK_COOLDOWN = 2000; // 2 second cooldown between cleanups

    constructor() {
        this.logger = Logger.getInstance().child({ component: 'TaskCacheManager' });
        this.eventHandler = new TaskEventHandler();
        
        const cacheOptions: CacheOptions = {
            maxSize: this.MAX_CACHE_MEMORY,
            ttl: 60 * 1000, // 1 minute
            cleanupInterval: 15 * 1000 // 15 seconds
        };
        
        this.cacheManager = CacheManager.getInstance(cacheOptions);
        this.indexManager = new TaskIndexManager();
        
        this.setupMemoryMonitoring();
    }

    private setupMemoryMonitoring(): void {
        if (this.memoryMonitor) {
            clearInterval(this.memoryMonitor);
        }

        const weakThis = new WeakRef(this);
        
        this.memoryMonitor = setInterval(async () => {
            const instance = weakThis.deref();
            if (!instance) {
                clearInterval(this.memoryMonitor);
                return;
            }

            const memUsage = process.memoryUsage();
            
            const stats = {
                heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
                heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
                rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
                platform: PlatformCapabilities.getArchInfo().platform
            };
            
            this.logger.debug('Task cache memory usage:', stats);

            // More aggressive memory monitoring for VSCode
            const memoryUsageRatio = Math.max(
                memUsage.heapUsed / instance.MAX_CACHE_MEMORY,
                memUsage.heapUsed / memUsage.heapTotal
            );
            
            const now = Date.now();
            if (memoryUsageRatio > instance.MEMORY_PRESSURE_THRESHOLD && 
                (now - instance.lastCleanupTime) >= instance.MEMORY_CHECK_COOLDOWN) {
                instance.lastCleanupTime = now;
                
                this.eventHandler.emitMemoryPressure(memUsage, instance.MAX_CACHE_MEMORY);

                this.logger.warn('Cache memory threshold exceeded, clearing caches', {
                    heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
                    threshold: `${Math.round(instance.MAX_CACHE_MEMORY / 1024 / 1024)}MB`
                });
                
                await instance.clearCaches(true);
            }
        }, this.MEMORY_CHECK_INTERVAL);

        process.on('beforeExit', () => {
            if (this.memoryMonitor) {
                clearInterval(this.memoryMonitor);
            }
        });
    }

    async indexTask(task: Task): Promise<void> {
        const now = Date.now();
        const fullTask: Task = {
            ...task,
            path: task.path,
            name: task.name,
            type: task.type || TaskType.TASK,
            status: task.status || TaskStatus.PENDING,
            projectPath: task.projectPath || task.path.split('/')[0],
            created: task.created || formatTimestamp(now),
            updated: task.updated || formatTimestamp(now),
            version: task.version || 1,
            metadata: task.metadata || {},
            dependencies: task.dependencies || [],
            subtasks: task.subtasks || [],
            description: task.description,
            parentPath: task.parentPath,
            notes: task.notes,
            reasoning: task.reasoning
        };
        await this.indexManager.indexTask(fullTask);
    }

    async unindexTask(task: Task): Promise<void> {
        await this.indexManager.unindexTask(task);
    }

    async clearCaches(forceClean: boolean = false): Promise<void> {
        try {
            await this.cacheManager.clear();
            this.indexManager.clear();

            if (global.gc) {
                global.gc();
                
                const afterGC = process.memoryUsage();
                if (forceClean && afterGC.heapUsed > (this.MAX_CACHE_MEMORY * this.MEMORY_PRESSURE_THRESHOLD)) {
                    this.logger.warn('Memory usage remains high after cleanup', {
                        heapUsed: `${Math.round(afterGC.heapUsed / 1024 / 1024)}MB`,
                        threshold: `${Math.round(this.MAX_CACHE_MEMORY / 1024 / 1024)}MB`
                    });
                }
            }

            this.logger.info('Caches cleared successfully');
        } catch (error) {
            this.logger.error('Failed to clear caches', { error });
            throw error;
        }
    }

    private storage?: TaskStorage;

    setStorage(storage: TaskStorage): void {
        this.storage = storage;
    }

    async getTaskByPath(path: string): Promise<Task | null> {
        // Try index first
        const indexedTask = await this.indexManager.getTaskByPath(path);
        if (indexedTask) {
            return indexedTask;
        }

        // Fall back to storage if available
        if (this.storage) {
            const task = await this.storage.getTask(path);
            if (task) {
                await this.indexTask(task);
                return task;
            }
        }

        return null;
    }

    async getTasksByPattern(pattern: string, limit?: number, offset?: number): Promise<Task[]> {
        // Try index first
        const indexedTasks = await this.indexManager.getTasksByPattern(pattern, limit, offset);
        if (indexedTasks.length > 0) {
            return indexedTasks;
        }

        // Fall back to storage if available
        if (this.storage) {
            const tasks = await this.storage.getTasksByPattern(pattern);
            for (const task of tasks) {
                await this.indexTask(task);
            }
            return tasks;
        }

        return [];
    }

    async getTasksByStatus(status: TaskStatus, pattern?: string, limit?: number, offset?: number): Promise<Task[]> {
        // Try index first
        const indexedTasks = await this.indexManager.getTasksByStatus(status, pattern, limit, offset);
        if (indexedTasks.length > 0) {
            return indexedTasks;
        }

        // Fall back to storage if available
        if (this.storage) {
            const tasks = await this.storage.getTasksByStatus(status);
            for (const task of tasks) {
                await this.indexTask(task);
            }
            return tasks;
        }

        return [];
    }

    async getTasksByParent(parentPath: string, limit?: number, offset?: number): Promise<Task[]> {
        // Try index first
        const indexedTasks = await this.indexManager.getTasksByParent(parentPath, limit, offset);
        if (indexedTasks.length > 0) {
            return indexedTasks;
        }

        // Fall back to storage if available
        if (this.storage) {
            const tasks = await this.storage.getSubtasks(parentPath);
            for (const task of tasks) {
                await this.indexTask(task);
            }
            return tasks;
        }

        return [];
    }

    getMemoryStats(): { heapUsed: number; heapTotal: number; rss: number } {
        const memUsage = process.memoryUsage();
        return {
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal,
            rss: memUsage.rss
        };
    }

    cleanup(): void {
        if (this.memoryMonitor) {
            clearInterval(this.memoryMonitor);
            this.memoryMonitor = undefined;
        }
        this.eventHandler.removeAllListeners();
    }
}
