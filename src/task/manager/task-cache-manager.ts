import { Logger } from '../../logging/index.js';
import { CacheManager } from '../core/cache/cache-manager.js';
import { CacheOptions } from '../../types/cache.js';
import { TaskIndexManager } from '../core/indexing/index-manager.js';
import { TaskEventHandler } from './task-event-handler.js';
import { Task, TaskType, TaskStatus } from '../../types/task.js';

export class TaskCacheManager {
    private readonly logger: Logger;
    private readonly cacheManager: CacheManager;
    private readonly indexManager: TaskIndexManager;
    private readonly eventHandler: TaskEventHandler;
    private memoryMonitor?: NodeJS.Timeout;
    private lastCleanupTime: number = 0;

    // Memory management constants
    private readonly MAX_CACHE_MEMORY = 1024 * 1024 * 1024; // 1GB cache limit
    private readonly MEMORY_CHECK_INTERVAL = 300000; // 5 minutes
    private readonly MEMORY_PRESSURE_THRESHOLD = 0.95; // 95% of max before cleanup
    private readonly MEMORY_CHECK_COOLDOWN = 60000; // 1 minute cooldown between cleanups

    constructor() {
        this.logger = Logger.getInstance().child({ component: 'TaskCacheManager' });
        this.eventHandler = new TaskEventHandler();
        
        const cacheOptions: CacheOptions = {
            maxSize: this.MAX_CACHE_MEMORY,
            ttl: 15 * 60 * 1000, // 15 minutes
            cleanupInterval: 5 * 60 * 1000 // 5 minutes
        };
        
        this.cacheManager = new CacheManager(cacheOptions);
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
                platform: process.platform
            };
            
            this.logger.debug('Task cache memory usage:', stats);

            const memoryUsageRatio = memUsage.heapUsed / instance.MAX_CACHE_MEMORY;
            
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
            created: task.created || now,
            updated: task.updated || now,
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

    async getTaskByPath(path: string): Promise<Task | null> {
        return this.indexManager.getTaskByPath(path);
    }

    async getTasksByPattern(pattern: string): Promise<Task[]> {
        return this.indexManager.getTasksByPattern(pattern);
    }

    async getTasksByStatus(status: TaskStatus): Promise<Task[]> {
        return this.indexManager.getTasksByStatus(status);
    }

    async getTasksByParent(parentPath: string): Promise<Task[]> {
        return this.indexManager.getTasksByParent(parentPath);
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
