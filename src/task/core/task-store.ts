/**
 * Path-based task storage with caching, indexing, and transaction support
 */
import { Task, TaskStatus, getParentPath } from '../../types/task.js';
import { isValidTaskHierarchy } from '../validation/index.js';
import { PathValidator } from '../../validation/index.js';
import { TaskStorage } from '../../types/storage.js';
import { Logger } from '../../logging/index.js';
import { TaskIndexManager } from './indexing/index-manager.js';
import { CacheManager } from './cache/cache-manager.js';
import { ErrorCodes, createError } from '../../errors/index.js';
import { TransactionManager } from './transactions/transaction-manager.js';

const BATCH_SIZE = 50; // Maximum number of tasks to process in parallel

export class TaskStore {
    private readonly logger: Logger;
    private readonly indexManager: TaskIndexManager;
    private readonly cacheManager: CacheManager;
    private readonly pathValidator: PathValidator;
    private nodes: Map<string, {
        path: string;
        dependencies: Set<string>;
        dependents: Set<string>;
        visited: boolean;
        inPath: boolean;
        ref: WeakRef<object>;
    }>;
    private readonly transactionManager: TransactionManager;
    private readonly HIGH_MEMORY_THRESHOLD = 0.7; // 70% memory pressure threshold
    private readonly MEMORY_CHECK_INTERVAL = 10000; // 10 seconds
    private memoryCheckInterval?: NodeJS.Timeout;

    constructor(private readonly storage: TaskStorage) {
        this.logger = Logger.getInstance().child({ component: 'TaskStore' });
        this.indexManager = new TaskIndexManager();
        this.pathValidator = new PathValidator();
        this.cacheManager = new CacheManager({
            maxSize: 500, // Reduced from 1000
            ttl: 30000, // Reduced from 60000
            maxTTL: 60000, // Reduced from 300000
            cleanupInterval: 15000 // Reduced from 30000
        });
        this.nodes = new Map();
        this.transactionManager = TransactionManager.getInstance(storage);

        // Start memory monitoring
        this.startMemoryMonitoring();
    }

    private startMemoryMonitoring(): void {
        this.memoryCheckInterval = setInterval(() => {
            const memoryUsage = process.memoryUsage();
            const heapUsed = memoryUsage.heapUsed / memoryUsage.heapTotal;

            this.logger.debug('Memory usage', {
                heapUsed: `${(heapUsed * 100).toFixed(1)}%`,
                heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
                rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
                external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
                arrayBuffers: `${Math.round(memoryUsage.arrayBuffers / 1024 / 1024)}MB`,
                nodeCount: this.nodes.size,
                activeNodes: Array.from(this.nodes.keys()).length
            });

            if (heapUsed > this.HIGH_MEMORY_THRESHOLD) {
                this.logger.warn('High memory usage detected in TaskStore', {
                    heapUsed: `${(heapUsed * 100).toFixed(1)}%`
                });
                
                // Force cleanup
                this.cleanupResources(true);
                
                // Force GC if available
                if (global.gc) {
                    global.gc();
                }
            }
        }, this.MEMORY_CHECK_INTERVAL);

        // Ensure cleanup on process exit
        process.once('beforeExit', () => {
            if (this.memoryCheckInterval) {
                clearInterval(this.memoryCheckInterval);
                this.memoryCheckInterval = undefined;
            }
        });
    }

    private async cleanupResources(force: boolean = false): Promise<void> {
        try {
            const startTime = Date.now();
            let cleanedCount = 0;

            // Clean up nodes whose refs have been collected
            for (const [path, node] of this.nodes.entries()) {
                if (!node.ref.deref() || force) {
                    this.nodes.delete(path);
                    cleanedCount++;
                }
            }

            // Force garbage collection if needed
            if (global.gc && (force || cleanedCount > 0)) {
                global.gc();
            }

            const endTime = Date.now();
            this.logger.info('Resource cleanup completed', {
                duration: endTime - startTime,
                cleanedCount,
                remainingNodes: this.nodes.size,
                memoryUsage: this.getMemoryMetrics()
            });
        } catch (error) {
            this.logger.error('Error during resource cleanup', { error });
        }
    }

    private getMemoryMetrics(): Record<string, string> {
        const memoryUsage = process.memoryUsage();
        return {
            heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
            heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
            rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
            external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
            arrayBuffers: `${Math.round(memoryUsage.arrayBuffers / 1024 / 1024)}MB`,
            heapUsedPercentage: `${((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100).toFixed(1)}%`
        };
    }

    /**
     * Processes tasks in batches with memory-efficient processing
     */
    private async processBatch<T>(
        items: T[],
        processor: (item: T) => Promise<void>
    ): Promise<void> {
        // Process in smaller chunks to avoid memory spikes
        const chunkSize = Math.min(BATCH_SIZE, 10);
        for (let i = 0; i < items.length; i += chunkSize) {
            const chunk = items.slice(i, i + chunkSize);
            
            // Process items sequentially in chunk to reduce memory pressure
            for (const item of chunk) {
                await processor(item);
            }

            // Allow GC between chunks
            if (i > 0 && i % (chunkSize * 5) === 0) {
                if (global.gc) {
                    global.gc();
                }
            }
        }
    }

    /**
     * Gets a task by path, checking cache first
     */
    private async getTaskByPath(path: string): Promise<Task | null> {
        const pathResult = this.pathValidator.validatePath(path);
        if (!pathResult.isValid) {
            throw createError(
                ErrorCodes.TASK_INVALID_PATH,
                pathResult.error || `Invalid task path: ${path}`
            );
        }

        // Check cache first
        const cachedTask = await this.cacheManager.get<Task>(path);
        if (cachedTask) {
            return cachedTask;
        }

        // Check index
        const indexedTask = await this.indexManager.getTaskByPath(path);
        if (indexedTask) {
            await this.cacheManager.set(path, indexedTask);
            return indexedTask;
        }

        // Load from storage
        const task = await this.storage.getTask(path);
        if (task) {
            await this.cacheManager.set(path, task);
            await this.indexManager.indexTask(task);
        }

        return task;
    }

    /**
     * Updates dependent task statuses
     */
    private async updateDependentStatuses(task: Task): Promise<void> {
        const dependentTasks = await this.indexManager.getDependentTasks(task.path);
        
        for (const depTask of dependentTasks) {
            const taskPath = depTask.path;
            const updatedTask = await this.getTaskByPath(taskPath);
            if (!updatedTask) continue;

            // If a dependency fails or is blocked, block the dependent task
            if (task.status === TaskStatus.FAILED || task.status === TaskStatus.BLOCKED) {
                updatedTask.status = TaskStatus.BLOCKED;
                await this.saveTasks([updatedTask]);
            }
            // If all dependencies are complete, unblock the dependent task
            else if (task.status === TaskStatus.COMPLETED) {
                const allDepsCompleted = await this.checkAllDependenciesCompleted(updatedTask);
                if (allDepsCompleted) {
                    updatedTask.status = TaskStatus.PENDING;
                    await this.saveTasks([updatedTask]);
                }
            }
        }
    }

    /**
     * Checks if all dependencies are completed
     */
    private async checkAllDependenciesCompleted(task: Task): Promise<boolean> {
        for (const depPath of task.dependencies) {
            const depTask = await this.getTaskByPath(depPath);
            if (!depTask || depTask.status !== TaskStatus.COMPLETED) {
                return false;
            }
        }
        return true;
    }

    /**
     * Saves tasks with validation, indexing, and transaction support
     */
    async saveTasks(tasks: Task[]): Promise<void> {
        // Validate paths and collect parent updates
        for (const task of tasks) {
            const pathResult = this.pathValidator.validatePath(task.path);
            if (!pathResult.isValid) {
                throw createError(
                    ErrorCodes.TASK_INVALID_PATH,
                    pathResult.error || `Invalid task path: ${task.path}`
                );
            }
        }

        const transaction = await this.transactionManager.begin();

        try {
            // First pass: validate all tasks and collect parent paths
            const parentPaths = new Set<string>();
            const tasksToSave = new Map<string, Task>();

            for (const task of tasks) {
                // Ensure task has required arrays
                if (!task.subtasks) task.subtasks = [];
                if (!task.dependencies) task.dependencies = [];

                // Get and validate parent path
                const parentPath = task.parentPath || getParentPath(task.path);
                if (parentPath) {
                    task.parentPath = parentPath;
                    parentPaths.add(parentPath);
                }

                tasksToSave.set(task.path, task);
            }

            // Second pass: load and validate all parents
            const parentUpdates = new Map<string, Task>();
            for (const parentPath of parentPaths) {
                const parent = await this.getTaskByPath(parentPath);
                if (!parent) {
                    throw createError(
                        ErrorCodes.TASK_PARENT_NOT_FOUND,
                        `Parent task not found: ${parentPath}. Parent tasks must be created before their children.`
                    );
                }
                parentUpdates.set(parentPath, parent);
            }

            // Third pass: validate relationships and update parent subtasks
            for (const task of tasksToSave.values()) {
                // Get the original task to check if parentPath has changed
                const originalTask = await this.getTaskByPath(task.path);
                
                // If task exists and parentPath has changed, remove from old parent
                if (originalTask && originalTask.parentPath && originalTask.parentPath !== task.parentPath) {
                    const oldParent = await this.getTaskByPath(originalTask.parentPath);
                    if (oldParent) {
                        oldParent.subtasks = oldParent.subtasks.filter(p => p !== task.path);
                        parentUpdates.set(oldParent.path, oldParent);
                        
                        // Update old parent's index
                        await this.indexManager.unindexTask(oldParent);
                        await this.indexManager.indexTask(oldParent);
                    }
                }

                // Handle new parent relationship
                if (task.parentPath) {
                    const parent = parentUpdates.get(task.parentPath) || await this.getTaskByPath(task.parentPath);
                    if (!parent) {
                        throw createError(
                            ErrorCodes.TASK_PARENT_NOT_FOUND,
                            `Parent task not found: ${task.parentPath}. Parent tasks must be created before their children.`
                        );
                    }

                    // Validate task type hierarchy
                    if (!isValidTaskHierarchy(parent.type, task.type)) {
                        throw createError(
                            ErrorCodes.TASK_PARENT_TYPE,
                            `Invalid parent-child relationship: ${parent.type} cannot contain ${task.type}`
                        );
                    }

                    // Update and index parent's subtasks if needed
                    if (!parent.subtasks.includes(task.path)) {
                        parent.subtasks = [...parent.subtasks, task.path];
                        parentUpdates.set(parent.path, parent);
                        
                        // Ensure parent-child relationship is indexed
                        await this.indexManager.unindexTask(parent);
                        await this.indexManager.indexTask(parent);
                    }
                }
            }

            // Prepare final task list with updated relationships
            const allTasks = [...parentUpdates.values(), ...tasksToSave.values()];
            await this.storage.saveTasks(allTasks);

            // Clear cache for all affected tasks
            await Promise.all(allTasks.map(task => this.cacheManager.delete(task.path)));

            // Reindex all tasks to ensure relationships are properly established
            for (const task of allTasks) {
                await this.indexManager.indexTask(task);
                await this.cacheManager.set(task.path, task);
            }

            // Validate dependencies for original tasks
            for (const task of tasks) {
                await this.validateDependencies(task.path, task.dependencies);
            }

            // Propagate status changes
            await this.processBatch(tasks, async task => {
                await this.updateDependentStatuses(task);
            });

            await this.transactionManager.commit(transaction);

            this.logger.debug('Tasks saved successfully', {
                count: tasks.length,
                paths: tasks.map(t => t.path)
            });
        } catch (error) {
            // Rollback transaction
            await this.transactionManager.rollback(transaction);

            // Rollback cache and indexes
            await this.processBatch(tasks, async task => {
                await this.indexManager.unindexTask(task);
                await this.cacheManager.delete(task.path);
            });

            this.logger.error('Failed to save tasks', { error, tasks });
            throw error;
        }
    }

    /**
     * Gets tasks by path pattern with efficient caching
     */
    async getTasksByPattern(pattern: string): Promise<Task[]> {
        try {
            // Get indexed tasks first
            const indexedTasks = await this.indexManager.getProjectTasks(pattern);
            
            // Batch process cache checks
            const tasks: Task[] = [];
            const missingPaths: string[] = [];

            await this.processBatch(indexedTasks, async indexedTask => {
                const cachedTask = await this.cacheManager.get<Task>(indexedTask.path);
                if (cachedTask) {
                    tasks.push(cachedTask);
                } else {
                    missingPaths.push(indexedTask.path);
                }
            });

            // If all tasks were cached, return them
            if (missingPaths.length === 0) {
                return tasks;
            }

            // Load missing tasks from storage
            const storageTasks = await this.storage.getTasksByPattern(pattern);

            // Update cache and indexes for missing tasks
            await this.processBatch(storageTasks, async task => {
                await this.indexManager.indexTask(task);
                await this.cacheManager.set(task.path, task);
                tasks.push(task);
            });

            return tasks;
        } catch (error) {
            this.logger.error('Failed to get tasks by pattern', { error, pattern });
            throw error;
        }
    }

    /**
     * Gets tasks by status with efficient caching
     */
    async getTasksByStatus(status: TaskStatus): Promise<Task[]> {
        try {
            // Get indexed tasks first
            const indexedTasks = await this.indexManager.getTasksByStatus(status, '');
            
            // Batch process cache checks
            const tasks: Task[] = [];
            const missingPaths: string[] = [];

            await this.processBatch(indexedTasks, async indexedTask => {
                const cachedTask = await this.cacheManager.get<Task>(indexedTask.path);
                if (cachedTask) {
                    tasks.push(cachedTask);
                } else {
                    missingPaths.push(indexedTask.path);
                }
            });

            // If all tasks were cached, return them
            if (missingPaths.length === 0) {
                return tasks;
            }

            // Load missing tasks from storage
            const storageTasks = await this.storage.getTasksByStatus(status);

            // Update cache and indexes for missing tasks
            await this.processBatch(storageTasks, async task => {
                await this.indexManager.indexTask(task);
                await this.cacheManager.set(task.path, task);
                tasks.push(task);
            });

            return tasks;
        } catch (error) {
            this.logger.error('Failed to get tasks by status', { error, status });
            throw error;
        }
    }

    /**
     * Gets subtasks of a task with efficient caching
     */
    async getSubtasks(parentPath: string): Promise<Task[]> {
        const pathResult = this.pathValidator.validatePath(parentPath);
        if (!pathResult.isValid) {
            throw createError(
                ErrorCodes.TASK_INVALID_PATH,
                pathResult.error || `Invalid parent path: ${parentPath}`
            );
        }

        try {
            // Get indexed tasks first
            const indexedTasks = await this.indexManager.getTasksByParent(parentPath);
            
            // Batch process cache checks
            const tasks: Task[] = [];
            const missingPaths: string[] = [];

            await this.processBatch(indexedTasks, async indexedTask => {
                const cachedTask = await this.cacheManager.get<Task>(indexedTask.path);
                if (cachedTask) {
                    tasks.push(cachedTask);
                } else {
                    missingPaths.push(indexedTask.path);
                }
            });

            // If all tasks were cached, return them
            if (missingPaths.length === 0) {
                return tasks;
            }

            // Load missing tasks from storage
            const storageTasks = await this.storage.getSubtasks(parentPath);

            // Update cache and indexes for missing tasks
            await this.processBatch(storageTasks, async task => {
                await this.indexManager.indexTask(task);
                await this.cacheManager.set(task.path, task);
                tasks.push(task);
            });

            return tasks;
        } catch (error) {
            this.logger.error('Failed to get subtasks', { error, parentPath });
            throw error;
        }
    }

    /**
     * Deletes a task and its subtasks with transaction support
     */
    async deleteTask(path: string): Promise<void> {
        const pathResult = this.pathValidator.validatePath(path);
        if (!pathResult.isValid) {
            throw createError(
                ErrorCodes.TASK_INVALID_PATH,
                pathResult.error || `Invalid task path: ${path}`
            );
        }

        const transaction = await this.transactionManager.begin();

        try {
            // Get task and subtasks
            const task = await this.storage.getTask(path);
            if (!task) {
                throw createError(
                    ErrorCodes.TASK_NOT_FOUND,
                    `Task not found: ${path}`
                );
            }

            const subtasks = await this.storage.getSubtasks(path);
            const allTasks = [task, ...subtasks];
            const allPaths = allTasks.map(t => t.path);

            // Add delete operation to transaction
            for (const taskPath of allPaths) {
                transaction.operations.push({
                    id: `delete-${Date.now()}-${Math.random()}`,
                    type: 'delete',
                    timestamp: Date.now(),
                    path: taskPath,
                    tasks: allTasks
                });
            }

            // Delete from storage
            await this.storage.deleteTasks(allPaths);

            // Update cache and indexes
            await this.processBatch(allTasks, async task => {
                await this.indexManager.unindexTask(task);
                await this.cacheManager.delete(task.path);
            });

            // Update dependent tasks
            await this.processBatch(allTasks, async task => {
                await this.updateDependentStatuses(task);
            });

            await this.transactionManager.commit(transaction);

            this.logger.debug('Task and subtasks deleted', {
                path,
                subtaskCount: subtasks.length
            });
        } catch (error) {
            await this.transactionManager.rollback(transaction);
            this.logger.error('Failed to delete task', { error, path });
            throw error;
        }
    }

    /**
     * Clears all tasks and resets indexes
     */
    async clearAllTasks(confirm: boolean): Promise<void> {
        if (!confirm) {
            throw createError(
                ErrorCodes.OPERATION_FAILED,
                'Must explicitly confirm task deletion'
            );
        }

        const transaction = await this.transactionManager.begin();

        try {
            // Clear all tasks from storage
            await this.storage.clearAllTasks();
            
            // Clear cache and indexes
            await Promise.all([
                this.indexManager.clear(),
                this.cacheManager.clear()
            ]);

            await this.transactionManager.commit(transaction);
            this.logger.info('All tasks and indexes cleared');
        } catch (error) {
            await this.transactionManager.rollback(transaction);
            this.logger.error('Failed to clear tasks', { error });
            throw error;
        }
    }

    /**
     * Optimizes database storage and performance
     */
    async vacuumDatabase(analyze: boolean = true): Promise<void> {
        try {
            await this.storage.vacuum();
            if (analyze) {
                await this.storage.analyze();
            }
            await this.storage.checkpoint();
            this.logger.info('Database optimized', { analyzed: analyze });
        } catch (error) {
            this.logger.error('Failed to optimize database', { error });
            throw error;
        }
    }

    /**
     * Repairs parent-child relationships and fixes inconsistencies
     */
    async repairRelationships(dryRun: boolean = false, pathPattern?: string): Promise<{ fixed: number, issues: string[] }> {
        const transaction = await this.transactionManager.begin();

        try {
            // Get tasks to repair
            const tasks = pathPattern ? 
                await this.getTasksByPattern(pathPattern) :
                await this.storage.getTasks([]);

            // Clear cache for affected tasks
            await Promise.all(tasks.map(task => this.cacheManager.delete(task.path)));

            // Repair relationships
            const result = await this.storage.repairRelationships(dryRun);

            if (!dryRun) {
                // Reindex all tasks after repair
                await Promise.all(tasks.map(task => this.indexManager.indexTask(task)));
            }

            await this.transactionManager.commit(transaction);
            return result;
        } catch (error) {
            await this.transactionManager.rollback(transaction);
            this.logger.error('Failed to repair relationships', { error });
            throw error;
        }
    }

    /**
     * Clears cache and indexes
     */
    async clearCache(): Promise<void> {
        const transaction = await this.transactionManager.begin();

        try {
            await Promise.all([
                this.indexManager.clear(),
                this.cacheManager.clear()
            ]);

            await this.transactionManager.commit(transaction);
            this.logger.debug('Cache cleared');
        } catch (error) {
            await this.transactionManager.rollback(transaction);
            this.logger.error('Failed to clear cache', { error });
            throw error;
        }
    }

    /**
     * Validates task dependencies
     */
    private async validateDependencies(taskPath: string, dependencies: string[]): Promise<void> {
        try {
            // Pre-validate dependencies exist
            await this.preValidateDependencies(dependencies);

            // Reset validation state
            this.nodes.clear();

            // Build dependency graph
            await this.buildDependencyGraph(taskPath, dependencies);

            // Check for cycles
            this.detectCycles(taskPath);

            // Validate dependency statuses
            await this.validateDependencyStatuses();

            this.logger.debug('Dependencies validated successfully', {
                taskPath,
                dependencies,
                validationSteps: [
                    'pre-validation',
                    'graph-building',
                    'cycle-detection',
                    'status-validation'
                ]
            });
        } catch (error) {
            this.logger.error('Dependency validation failed', {
                taskPath,
                dependencies,
                error
            });
            throw error;
        }
    }

    /**
     * Pre-validates all dependencies exist before building the graph
     */
    private async preValidateDependencies(dependencies: string[]): Promise<void> {
        const missingDeps: string[] = [];
        
        for (const depPath of dependencies) {
            const depTask = await this.getTaskByPath(depPath);
            if (!depTask) {
                missingDeps.push(depPath);
            }
        }

        if (missingDeps.length > 0) {
            throw createError(
                ErrorCodes.TASK_NOT_FOUND,
                'One or more dependency tasks not found',
                'preValidateDependencies',
                'Ensure all dependency tasks exist before creating relationships',
                {
                    missingDependencies: missingDeps,
                    totalDependencies: dependencies.length
                }
            );
        }
    }

    /**
     * Builds the dependency graph
     */
    private async buildDependencyGraph(taskPath: string, dependencies: string[]): Promise<void> {
        try {
            // Create node for current task
            const node = this.getOrCreateNode(taskPath);

            // Process each dependency
            for (const depPath of dependencies) {
                const depTask = await this.getTaskByPath(depPath);
                if (!depTask) {
                    // This shouldn't happen due to pre-validation, but handle just in case
                    throw createError(
                        ErrorCodes.TASK_NOT_FOUND,
                        'Dependency task not found during graph building',
                        'buildDependencyGraph',
                        undefined,
                        {
                            taskPath,
                            dependencyPath: depPath,
                            graphState: this.getGraphState()
                        }
                    );
                }

                // Add dependency relationship
                node.dependencies.add(depPath);
                const depNode = this.getOrCreateNode(depPath);
                depNode.dependents.add(taskPath);

                // Process transitive dependencies
                await this.buildDependencyGraph(depPath, depTask.dependencies);
            }
        } catch (error) {
            this.logger.error('Error building dependency graph', {
                taskPath,
                dependencies,
                error,
                graphState: this.getGraphState()
            });
            throw error;
        }
    }

    /**
     * Detects cycles in the dependency graph
     */
    private detectCycles(startPath: string): void {
        const node = this.nodes.get(startPath);
        if (!node) {
            return;
        }

        node.visited = true;
        node.inPath = true;

        for (const depPath of node.dependencies) {
            const depNode = this.nodes.get(depPath);
            if (!depNode) {
                continue;
            }

            if (!depNode.visited) {
                this.detectCycles(depPath);
            } else if (depNode.inPath) {
                const cyclePath = this.getCyclePath(depPath);
                throw createError(
                    ErrorCodes.TASK_CYCLE,
                    'Circular dependency detected in task graph',
                    'detectCycles',
                    'Remove one of the dependencies to break the cycle',
                    {
                        cyclePath,
                        startPath,
                        affectedTasks: Array.from(this.nodes.keys()),
                        graphState: this.getGraphState()
                    }
                );
            }
        }

        node.inPath = false;
    }

    /**
     * Gets the path of a dependency cycle
     */
    private getCyclePath(startPath: string): string {
        const cycle: string[] = [startPath];
        let current = startPath;

        while (true) {
            const node = this.nodes.get(current);
            if (!node) {
                break;
            }

            for (const depPath of node.dependencies) {
                const depNode = this.nodes.get(depPath);
                if (depNode?.inPath) {
                    cycle.push(depPath);
                    if (depPath === startPath) {
                        return cycle.join(' -> ');
                    }
                    current = depPath;
                    break;
                }
            }
        }

        return cycle.join(' -> ');
    }

    /**
     * Validates dependency task statuses
     */
    private async validateDependencyStatuses(): Promise<void> {
        const statusIssues: Array<{ path: string; status: TaskStatus; issue: string }> = [];

        for (const [path] of this.nodes) {
            const task = await this.getTaskByPath(path);
            if (!task) {
                continue;
            }

            if (task.status === TaskStatus.FAILED) {
                statusIssues.push({
                    path,
                    status: task.status,
                    issue: 'Task has failed'
                });
            }

            if (task.status === TaskStatus.BLOCKED) {
                statusIssues.push({
                    path,
                    status: task.status,
                    issue: 'Task is blocked'
                });
            }
        }

        if (statusIssues.length > 0) {
            throw createError(
                ErrorCodes.TASK_DEPENDENCY,
                'Dependency status validation failed',
                'validateDependencyStatuses',
                'Ensure all dependencies are in a valid state before proceeding',
                {
                    statusIssues,
                    graphState: this.getGraphState()
                }
            );
        }
    }

    /**
     * Gets or creates a dependency node
     */
    private getOrCreateNode(path: string): {
        path: string;
        dependencies: Set<string>;
        dependents: Set<string>;
        visited: boolean;
        inPath: boolean;
        ref: WeakRef<object>;
    } {
        let node = this.nodes.get(path);
        if (!node) {
            const obj = { path }; // Create object to track via WeakRef
            node = {
                path,
                dependencies: new Set(),
                dependents: new Set(),
                visited: false,
                inPath: false,
                ref: new WeakRef(obj)
            };
            this.nodes.set(path, node);
        }
        return node;
    }

    /**
     * Gets the current state of the dependency graph for debugging
     */
    private getGraphState(): Record<string, unknown> {
        return Object.fromEntries(
            Array.from(this.nodes.entries()).map(([path, node]) => [
                path,
                {
                    dependencies: Array.from(node.dependencies),
                    dependents: Array.from(node.dependents),
                    visited: node.visited,
                    inPath: node.inPath,
                    hasRef: node.ref.deref() !== undefined
                }
            ])
        );
    }
}
