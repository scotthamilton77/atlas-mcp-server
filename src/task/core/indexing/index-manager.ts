/**
 * Task index manager
 * Maintains in-memory indexes for efficient task lookups
 */
import { ErrorCodes, createError } from '../../../errors/index.js';
import { Task, TaskStatus } from '../../../types/task.js';
import { TaskIndex, IndexStats } from '../../../types/indexing.js';
import { Logger } from '../../../logging/index.js';
import { globToRegex, generatePathPatterns, matchesPattern } from '../../../utils/pattern-matcher.js';

export class TaskIndexManager {
    private readonly logger: Logger;
    private readonly taskIndexes: Map<string, WeakRef<TaskIndex>>;
    private readonly pathIndex: Map<string, Set<string>>;
    private readonly patternIndex: Map<string, Set<string>>;
    private readonly statusIndex: Map<TaskStatus, Set<string>>;
    private readonly parentIndex: Map<string, Set<string>>;
    private readonly dependencyIndex: Map<string, Set<string>>;
    
    // Keep track of pattern count to prevent unbounded growth
    private readonly MAX_PATTERNS = 1000;
    private patternCount = 0;

    // Cleanup interval
    private readonly CLEANUP_INTERVAL = 60000; // 1 minute
    private cleanupTimer?: NodeJS.Timeout;

    constructor() {
        this.logger = Logger.getInstance().child({ component: 'TaskIndexManager' });
        this.taskIndexes = new Map();
        this.pathIndex = new Map();
        this.patternIndex = new Map();
        this.statusIndex = new Map();
        this.parentIndex = new Map();
        this.dependencyIndex = new Map();

        // Start cleanup timer
        this.startCleanupTimer();
    }

    private startCleanupTimer(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
        
        this.cleanupTimer = setInterval(() => {
            this.cleanupIndexes();
            this.cleanupPatterns();
            
            // Force GC if available
            if (global.gc) {
                global.gc();
            }
        }, this.CLEANUP_INTERVAL);

        // Ensure cleanup timer is cleared on process exit
        process.once('beforeExit', () => {
            if (this.cleanupTimer) {
                clearInterval(this.cleanupTimer);
                this.cleanupTimer = undefined;
            }
        });
    }

    /**
     * Indexes path patterns for efficient pattern matching
     */
    private indexPathPatterns(path: string): void {
        const patterns = generatePathPatterns(path);
        
        for (const pattern of patterns) {
            let paths = this.patternIndex.get(pattern);
            if (!paths) {
                paths = new Set();
                this.patternIndex.set(pattern, paths);
                this.patternCount++;
            }
            paths.add(path);
        }
    }

    /**
     * Gets a task from its weak reference
     */
    private getTaskFromWeakRef(path: string): TaskIndex | undefined {
        const ref = this.taskIndexes.get(path);
        if (!ref) return undefined;
        
        const task = ref.deref();
        if (!task) {
            // Clean up if task was garbage collected
            this.taskIndexes.delete(path);
            return undefined;
        }
        
        return task;
    }

    /**
     * Indexes a task
     */
    async indexTask(task: Task): Promise<void> {
        try {
            // Create task index
            const taskIndex: TaskIndex = {
                ...task,
                path: task.path,
                status: task.status,
                parentPath: task.parentPath,
                dependencies: task.dependencies || [],
                subtasks: task.subtasks || []
            };

            // Store weak reference to allow GC
            this.taskIndexes.set(task.path, new WeakRef(taskIndex));

            // Clean up old patterns if we're at the limit
            if (this.patternCount >= this.MAX_PATTERNS) {
                this.cleanupPatterns();
            }

            // Update path index and patterns
            const pathSegments = task.path.split('/');
            for (let i = 1; i <= pathSegments.length; i++) {
                const prefix = pathSegments.slice(0, i).join('/');
                let paths = this.pathIndex.get(prefix);
                if (!paths) {
                    paths = new Set();
                    this.pathIndex.set(prefix, paths);
                }
                paths.add(task.path);
            }
            this.indexPathPatterns(task.path);

            // Update status index
            let statusPaths = this.statusIndex.get(task.status);
            if (!statusPaths) {
                statusPaths = new Set();
                this.statusIndex.set(task.status, statusPaths);
            }
            statusPaths.add(task.path);

            // Update parent index
            if (task.parentPath) {
                let children = this.parentIndex.get(task.parentPath);
                if (!children) {
                    children = new Set();
                    this.parentIndex.set(task.parentPath, children);
                }
                children.add(task.path);
            }

            // Update dependency index
            for (const depPath of task.dependencies) {
                let dependents = this.dependencyIndex.get(depPath);
                if (!dependents) {
                    dependents = new Set();
                    this.dependencyIndex.set(depPath, dependents);
                }
                dependents.add(task.path);
            }

            this.logger.debug('Indexed task', { path: task.path });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error('Failed to index task', { error: errorMessage, task });
            throw createError(
                ErrorCodes.OPERATION_FAILED,
                'Failed to index task',
                errorMessage
            );
        }
    }

    /**
     * Gets tasks by path pattern
     */
    async getTasksByPattern(pattern: string): Promise<TaskIndex[]> {
        // First try exact pattern match from pattern index
        const exactMatches = this.patternIndex.get(pattern);
        if (exactMatches) {
            const tasks = Array.from(exactMatches)
                .map(path => this.getTaskFromWeakRef(path))
                .filter((task): task is TaskIndex => task !== undefined);
            
            // If we got matches, return them
            if (tasks.length > 0) {
                return tasks;
            }
            // Otherwise clean up the empty pattern
            this.patternIndex.delete(pattern);
            this.patternCount--;
        }

        // Try prefix match from path index
        const prefixMatches = this.pathIndex.get(pattern);
        if (prefixMatches) {
            const tasks = Array.from(prefixMatches)
                .map(path => this.getTaskFromWeakRef(path))
                .filter((task): task is TaskIndex => task !== undefined);
            
            // Clean up empty sets
            if (tasks.length === 0) {
                this.pathIndex.delete(pattern);
            }
            
            return tasks;
        }

        // Fall back to regex matching
        const regex = globToRegex(pattern);
        const matchingPaths = Array.from(this.taskIndexes.keys())
            .filter(path => regex.test(path));

        return matchingPaths
            .map(path => this.getTaskFromWeakRef(path))
            .filter((task): task is TaskIndex => task !== undefined);
    }

    /**
     * Gets tasks by status with optional pattern filtering
     */
    async getTasksByStatus(status: TaskStatus, pattern?: string): Promise<TaskIndex[]> {
        const statusPaths = this.statusIndex.get(status) || new Set<string>();
        
        if (!pattern) {
            return Array.from(statusPaths)
                .map(path => this.getTaskFromWeakRef(path))
                .filter((task): task is TaskIndex => task !== undefined);
        }

        // Filter by pattern if provided
        const matchingPaths = Array.from(statusPaths)
            .filter(path => matchesPattern(path, pattern));

        return matchingPaths
            .map(path => this.getTaskFromWeakRef(path))
            .filter((task): task is TaskIndex => task !== undefined);
    }

    /**
     * Gets project tasks by pattern
     */
    async getProjectTasks(pattern: string): Promise<TaskIndex[]> {
        return this.getTasksByPattern(pattern);
    }

    /**
     * Gets tasks by parent path
     */
    async getTasksByParent(parentPath: string): Promise<TaskIndex[]> {
        const children = this.parentIndex.get(parentPath) || new Set<string>();
        return Array.from(children)
            .map(path => this.getTaskFromWeakRef(path))
            .filter((task): task is TaskIndex => task !== undefined);
    }

    /**
     * Gets tasks that depend on a task
     */
    async getDependentTasks(path: string): Promise<TaskIndex[]> {
        const dependents = this.dependencyIndex.get(path) || new Set<string>();
        return Array.from(dependents)
            .map(path => this.getTaskFromWeakRef(path))
            .filter((task): task is TaskIndex => task !== undefined);
    }

    /**
     * Gets a task by path
     */
    async getTaskByPath(path: string): Promise<TaskIndex | null> {
        return this.getTaskFromWeakRef(path) || null;
    }

    /**
     * Unindexes a task
     */
    async unindexTask(task: Task): Promise<void> {
        try {
            // Remove from task indexes
            this.taskIndexes.delete(task.path);

            // Remove from path index and patterns
            const pathSegments = task.path.split('/');
            for (let i = 1; i <= pathSegments.length; i++) {
                const prefix = pathSegments.slice(0, i).join('/');
                const paths = this.pathIndex.get(prefix);
                if (paths) {
                    paths.delete(task.path);
                    if (paths.size === 0) {
                        this.pathIndex.delete(prefix);
                    }
                }
            }

            // Remove from pattern index
            const patterns = generatePathPatterns(task.path);
            for (const pattern of patterns) {
                const paths = this.patternIndex.get(pattern);
                if (paths) {
                    paths.delete(task.path);
                    if (paths.size === 0) {
                        this.patternIndex.delete(pattern);
                        this.patternCount--;
                    }
                }
            }

            // Remove from status index
            const statusPaths = this.statusIndex.get(task.status);
            if (statusPaths) {
                statusPaths.delete(task.path);
                if (statusPaths.size === 0) {
                    this.statusIndex.delete(task.status);
                }
            }

            // Remove from parent index
            if (task.parentPath) {
                const children = this.parentIndex.get(task.parentPath);
                if (children) {
                    children.delete(task.path);
                    if (children.size === 0) {
                        this.parentIndex.delete(task.parentPath);
                    }
                }
            }

            // Remove from dependency index
            for (const depPath of task.dependencies) {
                const dependents = this.dependencyIndex.get(depPath);
                if (dependents) {
                    dependents.delete(task.path);
                    if (dependents.size === 0) {
                        this.dependencyIndex.delete(depPath);
                    }
                }
            }

            this.logger.debug('Unindexed task', { path: task.path });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error('Failed to unindex task', { error: errorMessage, task });
            throw createError(
                ErrorCodes.OPERATION_FAILED,
                'Failed to unindex task',
                errorMessage
            );
        }
    }

    /**
     * Gets index statistics
     */
    getStats(): IndexStats {
        const byStatus = {} as Record<TaskStatus, number>;
        const byDepth = {} as Record<number, number>;
        let totalDepth = 0;
        let validTaskCount = 0;

        // Only count tasks that haven't been garbage collected
        for (const [path, weakRef] of this.taskIndexes.entries()) {
            const task = weakRef.deref();
            if (task) {
                validTaskCount++;
                
                // Count by status
                byStatus[task.status] = (byStatus[task.status] || 0) + 1;

                // Count by depth
                const depth = path.split('/').length - 1;
                byDepth[depth] = (byDepth[depth] || 0) + 1;
                totalDepth += depth;
            }
        }

        return {
            totalTasks: validTaskCount,
            byStatus,
            byDepth,
            averageDepth: validTaskCount > 0 ? totalDepth / validTaskCount : 0
        };
    }

    /**
     * Cleans up old patterns to prevent unbounded growth
     */
    private cleanupPatterns(): void {
        // Remove patterns with no valid tasks
        for (const [pattern, paths] of this.patternIndex.entries()) {
            const validPaths = Array.from(paths)
                .filter(path => this.getTaskFromWeakRef(path) !== undefined);
            
            if (validPaths.length === 0) {
                this.patternIndex.delete(pattern);
                this.patternCount--;
            } else if (validPaths.length !== paths.size) {
                // Update set with only valid paths
                this.patternIndex.set(pattern, new Set(validPaths));
            }
        }
    }

    /**
     * Cleans up invalid references and empty sets
     */
    private cleanupIndexes(): void {
        // Clean up task indexes
        for (const [path, weakRef] of this.taskIndexes.entries()) {
            if (weakRef.deref() === undefined) {
                this.taskIndexes.delete(path);
            }
        }

        // Clean up empty sets in all indexes
        for (const [prefix, paths] of this.pathIndex.entries()) {
            const validPaths = Array.from(paths)
                .filter(path => this.getTaskFromWeakRef(path) !== undefined);
            
            if (validPaths.length === 0) {
                this.pathIndex.delete(prefix);
            } else if (validPaths.length !== paths.size) {
                this.pathIndex.set(prefix, new Set(validPaths));
            }
        }

        for (const [status, paths] of this.statusIndex.entries()) {
            const validPaths = Array.from(paths)
                .filter(path => this.getTaskFromWeakRef(path) !== undefined);
            
            if (validPaths.length === 0) {
                this.statusIndex.delete(status);
            } else if (validPaths.length !== paths.size) {
                this.statusIndex.set(status, new Set(validPaths));
            }
        }

        for (const [parent, children] of this.parentIndex.entries()) {
            const validPaths = Array.from(children)
                .filter(path => this.getTaskFromWeakRef(path) !== undefined);
            
            if (validPaths.length === 0) {
                this.parentIndex.delete(parent);
            } else if (validPaths.length !== children.size) {
                this.parentIndex.set(parent, new Set(validPaths));
            }
        }

        for (const [dep, dependents] of this.dependencyIndex.entries()) {
            const validPaths = Array.from(dependents)
                .filter(path => this.getTaskFromWeakRef(path) !== undefined);
            
            if (validPaths.length === 0) {
                this.dependencyIndex.delete(dep);
            } else if (validPaths.length !== dependents.size) {
                this.dependencyIndex.set(dep, new Set(validPaths));
            }
        }
    }

    /**
     * Clears all indexes
     */
    clear(): void {
        // Stop cleanup timer
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = undefined;
        }

        this.taskIndexes.clear();
        this.pathIndex.clear();
        this.patternIndex.clear();
        this.statusIndex.clear();
        this.parentIndex.clear();
        this.dependencyIndex.clear();
        this.patternCount = 0;

        // Restart cleanup timer
        this.startCleanupTimer();
        
        this.logger.debug('Cleared all indexes');
    }
}
