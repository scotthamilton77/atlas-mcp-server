import { Logger } from '../../logging/index.js';
import { Task, CreateTaskInput, UpdateTaskInput, TaskStatus, TaskMetadata } from '../../types/task.js';
import { StorageConfig, DEFAULT_CONFIG } from '../interfaces/config.js';
import { TaskStorage } from '../interfaces/storage.js';
import { createError, ErrorCodes } from '../../errors/index.js';

/**
 * Abstract base storage class providing common functionality
 */
export abstract class BaseStorage implements TaskStorage {
    protected readonly logger: Logger;
    protected isInitialized = false;
    protected isClosed = false;
    protected lastCheckpoint = 0;
    protected lastVacuum = 0;

    constructor(
        protected readonly config: Required<StorageConfig>
    ) {
        this.logger = Logger.getInstance().child({ 
            component: this.constructor.name 
        });
    }

    /**
     * Update parent task references when changing parent paths
     */
    protected async updateParentReferences(
        taskPath: string,
        oldParentPath: string | undefined,
        newParentPath: string | undefined
    ): Promise<void> {
        // Remove from old parent if it exists
        if (oldParentPath) {
            const oldParent = await this.getTask(oldParentPath);
            if (oldParent && Array.isArray(oldParent.subtasks)) {
                oldParent.subtasks = oldParent.subtasks.filter(s => s !== taskPath);
                await this.saveTask(oldParent);
            }
        }

        // Add to new parent if it exists
        if (newParentPath) {
            const newParent = await this.getTask(newParentPath);
            if (newParent && Array.isArray(newParent.subtasks)) {
                newParent.subtasks = [...newParent.subtasks, taskPath];
                await this.saveTask(newParent);
            }
        }
    }

    // Abstract methods that must be implemented by storage providers
    abstract initialize(): Promise<void>;
    abstract close(): Promise<void>;
    abstract beginTransaction(): Promise<void>;
    abstract commitTransaction(): Promise<void>;
    abstract rollbackTransaction(): Promise<void>;
    abstract executeInTransaction<T>(work: () => Promise<T>, retries?: number): Promise<T>;

    /**
     * Create a new task with validation and proper error handling
     */
    async createTask(input: CreateTaskInput): Promise<Task> {
        this.ensureInitialized();
        
        if (!input.path || !input.name || !input.type) {
            throw createError(
                ErrorCodes.VALIDATION_ERROR,
                'Missing required fields',
                'createTask',
                'path, name, and type are required'
            );
        }

        const now = Date.now();
        const projectPath = input.path.split('/')[0];
        
        const task: Task = {
            path: input.path,
            name: input.name,
            type: input.type,
            status: TaskStatus.PENDING,
            created: now,
            updated: now,
            version: 1,
            projectPath,
            description: input.description,
            parentPath: input.parentPath,
            notes: input.notes || [],
            reasoning: input.reasoning,
            dependencies: input.dependencies || [],
            subtasks: [],
            metadata: input.metadata || {} as TaskMetadata
        };

        await this.executeInTransaction(async () => {
            await this.saveTask(task);
            
            // Add to parent if specified
            if (task.parentPath) {
                await this.updateParentReferences(task.path, undefined, task.parentPath);
            }
        });

        return task;
    }

    /**
     * Update an existing task with proper validation
     */
    async updateTask(path: string, updates: UpdateTaskInput): Promise<Task> {
        this.ensureInitialized();
        
        return this.executeInTransaction(async () => {
            const existingTask = await this.getTask(path);
            if (!existingTask) {
                throw createError(
                    ErrorCodes.TASK_NOT_FOUND,
                    'Task not found',
                    'updateTask',
                    path
                );
            }

            const now = Date.now();
            // Create updated task with proper type handling
            // Create updated task with explicit type handling
            const updatedTask: Task = {
                ...existingTask,
                name: updates.name ?? existingTask.name,
                description: updates.description ?? existingTask.description,
                type: updates.type ?? existingTask.type,
                status: updates.status ?? existingTask.status,
                parentPath: updates.parentPath === null ? undefined : (updates.parentPath ?? existingTask.parentPath),
                notes: updates.notes ?? existingTask.notes,
                reasoning: updates.reasoning ?? existingTask.reasoning,
                dependencies: updates.dependencies ?? existingTask.dependencies,
                updated: now,
                version: existingTask.version + 1,
                subtasks: existingTask.subtasks,
                metadata: {
                    ...existingTask.metadata,
                    ...(updates.metadata ?? {})
                } as TaskMetadata
            };

            // Handle parent path changes
            if (updates.parentPath !== undefined && updates.parentPath !== existingTask.parentPath) {
                // Handle parent path updates
                await this.updateParentReferences(
                    path,
                    existingTask.parentPath,
                    updates.parentPath === null ? undefined : updates.parentPath
                );
            }

            await this.saveTask(updatedTask);
            return updatedTask;
        });
    }

    /**
     * Delete a task and its subtasks recursively
     */
    async deleteTask(path: string): Promise<void> {
        this.ensureInitialized();

        await this.executeInTransaction(async () => {
            const task = await this.getTask(path);
            if (!task) return;

            // Remove from parent if exists
            if (task.parentPath) {
                await this.updateParentReferences(path, task.parentPath, undefined);
            }

            const subtasks = await this.getSubtasks(path);
            for (const subtask of subtasks) {
                await this.deleteTask(subtask.path);
            }

            await this.deleteTasks([path]);
        });
    }

    /**
     * Ensure the storage is initialized before operations
     */
    protected ensureInitialized(): void {
        if (!this.isInitialized) {
            throw createError(
                ErrorCodes.STORAGE_ERROR,
                'Storage not initialized',
                'ensureInitialized'
            );
        }
        if (this.isClosed) {
            throw createError(
                ErrorCodes.STORAGE_ERROR,
                'Storage is closed',
                'ensureInitialized'
            );
        }
    }

    /**
     * Check if maintenance operations are needed
     */
    protected async checkMaintenance(): Promise<void> {
        const now = Date.now();
        // Get maintenance intervals with type assertion since we know DEFAULT_CONFIG provides fallbacks
        const checkpointInterval = (this.config.performance?.checkpointInterval ?? DEFAULT_CONFIG.performance.checkpointInterval) as number;
        const vacuumInterval = (this.config.performance?.vacuumInterval ?? DEFAULT_CONFIG.performance.vacuumInterval) as number;

        if (now - this.lastCheckpoint >= checkpointInterval) {
            try {
                await this.checkpoint();
                this.lastCheckpoint = now;
            } catch (error) {
                this.logger.warn('Checkpoint failed during maintenance', { error });
            }
        }

        if (now - this.lastVacuum >= vacuumInterval) {
            try {
                await this.vacuum();
                this.lastVacuum = now;
            } catch (error) {
                this.logger.warn('Vacuum failed during maintenance', { error });
            }
        }
    }

    // Abstract methods that must be implemented by storage providers
    abstract getTask(path: string): Promise<Task | null>;
    abstract getTasks(paths: string[]): Promise<Task[]>;
    abstract getTasksByPattern(pattern: string): Promise<Task[]>;
    abstract getTasksByStatus(status: TaskStatus): Promise<Task[]>;
    abstract getSubtasks(parentPath: string): Promise<Task[]>;
    abstract deleteTasks(paths: string[]): Promise<void>;
    abstract hasChildren(path: string): Promise<boolean>;
    abstract getDependentTasks(path: string): Promise<Task[]>;
    abstract saveTask(task: Task): Promise<void>;
    abstract saveTasks(tasks: Task[]): Promise<void>;
    abstract clearAllTasks(): Promise<void>;
    abstract vacuum(): Promise<void>;
    abstract analyze(): Promise<void>;
    abstract checkpoint(): Promise<void>;
    abstract repairRelationships(dryRun?: boolean): Promise<{ fixed: number, issues: string[] }>;
    abstract clearCache(): Promise<void>;
    abstract verifyIntegrity(): Promise<boolean>;
    abstract getStats(): Promise<{
        size: number;
        walSize: number;
        pageCount: number;
        pageSize: number;
        journalMode: string;
    }>;
    abstract getMetrics(): Promise<{
        tasks: {
            total: number;
            byStatus: Record<string, number>;
            noteCount: number;
            dependencyCount: number;
        };
        storage: {
            totalSize: number;
            pageSize: number;
            pageCount: number;
            walSize: number;
            cache: {
                hitRate: number;
                memoryUsage: number;
                entryCount: number;
            };
        };
    }>;
}
