import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import {
    Task,
    TaskStatus,
    CreateTaskInput,
    BulkCreateTaskInput,
    UpdateTaskInput,
    BulkUpdateTasksInput,
    TaskValidationError,
    TaskNotFoundError,
    DependencyError,
    TaskResponse,
    sanitizeTaskInput,
    getRootId,
    isRootTask,
} from './types.js';

// Load environment variables
dotenv.config();

export class TaskManager {
    private tasks: Map<string, Task>;
    private storageDir: string;
    private sessionId: string;

    constructor() {
        this.tasks = new Map();
        this.sessionId = uuidv4();
        
        const baseDir = process.env.TASK_STORAGE_DIR;
        if (!baseDir) {
            throw new Error('TASK_STORAGE_DIR environment variable must be set');
        }

        this.storageDir = path.join(baseDir, 'sessions');
        fs.mkdirSync(this.storageDir, { recursive: true });
        this.loadTasks();
    }

    private getSessionFile(): string {
        return path.join(this.storageDir, `${this.sessionId}.json`);
    }

    private async loadTasks(): Promise<void> {
        const sessionFile = this.getSessionFile();
        try {
            if (fs.existsSync(sessionFile)) {
                const data = await fs.promises.readFile(sessionFile, 'utf-8');
                const tasksArray = JSON.parse(data);
                // Convert any old content field to notes
                tasksArray.forEach((task: any) => {
                    if (task.content && !task.notes) {
                        task.notes = task.content;
                        delete task.content;
                    }
                });
                this.tasks = new Map(tasksArray.map((task: Task) => [task.id, task]));
            }
        } catch (error) {
            console.error('Error loading tasks:', error);
            this.tasks = new Map();
        }
    }

    private async saveTasks(): Promise<void> {
        const sessionFile = this.getSessionFile();
        const rootTasks = Array.from(this.tasks.values())
            .filter(task => isRootTask(task.parentId));
        const tempFile = `${sessionFile}.temp`;

        try {
            await fs.promises.writeFile(
                tempFile,
                JSON.stringify(rootTasks, null, 2)
            );
            await fs.promises.rename(tempFile, sessionFile);
        } catch (error) {
            console.error('Error saving tasks:', error);
            if (fs.existsSync(tempFile)) {
                try {
                    await fs.promises.unlink(tempFile);
                } catch (cleanupError) {
                    console.error('Error cleaning up temp file:', cleanupError);
                }
            }
            throw error;
        }
    }

    private findTask(taskId: string): Task | undefined {
        const task = this.tasks.get(taskId);
        if (task) return task;

        for (const rootTask of this.tasks.values()) {
            const found = this.findTaskInSubtasks(rootTask.subtasks, taskId);
            if (found) return found;
        }
        return undefined;
    }

    private findTaskInSubtasks(subtasks: Task[], taskId: string): Task | undefined {
        for (const task of subtasks) {
            if (task.id === taskId) return task;
            const found = this.findTaskInSubtasks(task.subtasks, taskId);
            if (found) return found;
        }
        return undefined;
    }

    private validateDependencies(taskId: string, dependencies: string[]): void {
        // Check for self-dependency
        if (dependencies.includes(taskId)) {
            throw new DependencyError(
                'Task cannot depend on itself',
                dependencies
            );
        }

        // Check for existence of all dependencies
        const missingDeps = dependencies.filter(depId => !this.findTask(depId));
        if (missingDeps.length > 0) {
            throw new DependencyError(
                `Dependencies not found: ${missingDeps.join(', ')}`,
                missingDeps
            );
        }

        // Check for circular dependencies
        const visited = new Set<string>();
        const recursionStack = new Set<string>();

        const detectCircular = (currentId: string): void => {
            visited.add(currentId);
            recursionStack.add(currentId);

            const task = this.findTask(currentId);
            if (task) {
                for (const depId of task.dependencies) {
                    if (!visited.has(depId)) {
                        detectCircular(depId);
                    } else if (recursionStack.has(depId)) {
                        throw new DependencyError(
                            `Circular dependency detected: ${depId}`,
                            [depId]
                        );
                    }
                }
            }

            recursionStack.delete(currentId);
        };

        for (const depId of dependencies) {
            if (!visited.has(depId)) {
                detectCircular(depId);
            }
        }
    }

    private async updateParentStatus(taskId: string): Promise<void> {
        const task = this.findTask(taskId);
        if (!task || isRootTask(task.parentId)) return;

        const parent = this.findTask(task.parentId);
        if (!parent) return;

        const siblings = parent.subtasks;
        const allCompleted = siblings.every(t => t.status === 'completed');
        const anyFailed = siblings.some(t => t.status === 'failed');
        const anyBlocked = siblings.some(t => t.status === 'blocked');
        const anyInProgress = siblings.some(t => t.status === 'in_progress');

        const oldStatus = parent.status;
        let newStatus: TaskStatus = 'pending';

        if (allCompleted) {
            newStatus = 'completed';
        } else if (anyFailed) {
            newStatus = 'failed';
        } else if (anyBlocked) {
            newStatus = 'blocked';
        } else if (anyInProgress) {
            newStatus = 'in_progress';
        }

        if (oldStatus !== newStatus) {
            parent.status = newStatus;
            parent.metadata.updated = new Date().toISOString();
            if (isRootTask(parent.parentId)) {
                this.tasks.set(parent.id, parent);
            }
            await this.saveTasks();

            if (!isRootTask(parent.parentId)) {
                await this.updateParentStatus(parent.id);
            }
        }
    }

    private async createTaskWithSubtasks(
        parentId: string,
        taskData: CreateTaskInput,
        affectedTasks: string[] = []
    ): Promise<Task> {
        sanitizeTaskInput(taskData);

        const id = uuidv4();
        const dependencies = taskData.dependencies || [];
        this.validateDependencies(id, dependencies);

        const now = new Date().toISOString();
        const newTask: Task = {
            id,
            name: taskData.name,
            description: taskData.description,
            notes: taskData.notes,
            reasoning: taskData.reasoning,
            type: taskData.type || 'task',
            status: 'pending',
            dependencies,
            subtasks: [],
            metadata: {
                created: now,
                updated: now,
                sessionId: this.sessionId,
                ...taskData.metadata,
            },
            parentId
        };

        affectedTasks.push(id);

        // Recursively create subtasks if any
        if (taskData.subtasks && taskData.subtasks.length > 0) {
            for (const subtaskData of taskData.subtasks) {
                const subtask = await this.createTaskWithSubtasks(id, subtaskData, affectedTasks);
                newTask.subtasks.push(subtask);
            }
        }

        return newTask;
    }

    async createTask(parentId: string | null, taskData: CreateTaskInput): Promise<TaskResponse<Task>> {
        try {
            const affectedTasks: string[] = [];
            const effectiveParentId = parentId ? parentId : getRootId(this.sessionId);

            const newTask = await this.createTaskWithSubtasks(effectiveParentId, taskData, affectedTasks);

            if (parentId) {
                const parentTask = this.findTask(parentId);
                if (!parentTask) {
                    throw new TaskNotFoundError(parentId);
                }
                parentTask.subtasks.push(newTask);
                parentTask.metadata.updated = newTask.metadata.created;
                if (isRootTask(parentTask.parentId)) {
                    this.tasks.set(parentId, parentTask);
                }
                affectedTasks.push(parentId);
            } else {
                this.tasks.set(newTask.id, newTask);
            }

            await this.saveTasks();

            return {
                success: true,
                data: newTask,
                metadata: {
                    timestamp: newTask.metadata.created,
                    requestId: uuidv4(),
                    sessionId: this.sessionId,
                    affectedTasks
                }
            };
        } catch (error) {
            return this.handleError(error);
        }
    }

    async bulkCreateTasks(input: BulkCreateTaskInput): Promise<TaskResponse<Task[]>> {
        try {
            const affectedTasks: string[] = [];
            const createdTasks: Task[] = [];
            const effectiveParentId = input.parentId ? input.parentId : getRootId(this.sessionId);

            for (const taskData of input.tasks) {
                const newTask = await this.createTaskWithSubtasks(effectiveParentId, taskData, affectedTasks);
                createdTasks.push(newTask);

                if (input.parentId) {
                    const parentTask = this.findTask(input.parentId);
                    if (!parentTask) {
                        throw new TaskNotFoundError(input.parentId);
                    }
                    parentTask.subtasks.push(newTask);
                    parentTask.metadata.updated = newTask.metadata.created;
                    if (isRootTask(parentTask.parentId)) {
                        this.tasks.set(input.parentId, parentTask);
                    }
                    affectedTasks.push(input.parentId);
                } else {
                    this.tasks.set(newTask.id, newTask);
                }
            }

            await this.saveTasks();

            return {
                success: true,
                data: createdTasks,
                metadata: {
                    timestamp: new Date().toISOString(),
                    requestId: uuidv4(),
                    sessionId: this.sessionId,
                    affectedTasks
                }
            };
        } catch (error) {
            return this.handleError(error);
        }
    }

    async getTask(taskId: string): Promise<TaskResponse<Task>> {
        try {
            const task = this.findTask(taskId);
            if (!task) {
                throw new TaskNotFoundError(taskId);
            }

            return {
                success: true,
                data: task,
                metadata: {
                    timestamp: new Date().toISOString(),
                    requestId: uuidv4(),
                    sessionId: this.sessionId
                }
            };
        } catch (error) {
            return this.handleError(error);
        }
    }

    async updateTask(taskId: string, updates: UpdateTaskInput): Promise<TaskResponse<Task>> {
        try {
            const task = this.findTask(taskId);
            if (!task) {
                throw new TaskNotFoundError(taskId);
            }

            sanitizeTaskInput(updates);

            if (updates.dependencies) {
                this.validateDependencies(taskId, updates.dependencies);
                task.dependencies = updates.dependencies;
            }

            const now = new Date().toISOString();
            Object.assign(task, {
                name: updates.name ?? task.name,
                description: updates.description ?? task.description,
                notes: updates.notes ?? task.notes,
                reasoning: updates.reasoning ?? task.reasoning,
                type: updates.type ?? task.type,
                status: updates.status ?? task.status,
                metadata: {
                    ...task.metadata,
                    ...updates.metadata,
                    updated: now,
                    sessionId: this.sessionId
                }
            });

            if (isRootTask(task.parentId)) {
                this.tasks.set(taskId, task);
            }
            await this.saveTasks();

            if (updates.status && !isRootTask(task.parentId)) {
                await this.updateParentStatus(taskId);
            }

            return {
                success: true,
                data: task,
                metadata: {
                    timestamp: now,
                    requestId: uuidv4(),
                    sessionId: this.sessionId,
                    affectedTasks: [taskId, ...(isRootTask(task.parentId) ? [] : [task.parentId])]
                }
            };
        } catch (error) {
            return this.handleError(error);
        }
    }

    async bulkUpdateTasks(input: BulkUpdateTasksInput): Promise<TaskResponse<Task[]>> {
        try {
            const affectedTasks = new Set<string>();
            const updatedTasks: Task[] = [];
            const now = new Date().toISOString();

            // First validate all updates
            for (const { taskId, updates } of input.updates) {
                const task = this.findTask(taskId);
                if (!task) {
                    throw new TaskNotFoundError(taskId);
                }
                sanitizeTaskInput(updates);
                if (updates.dependencies) {
                    this.validateDependencies(taskId, updates.dependencies);
                }
            }

            // Then apply all updates
            for (const { taskId, updates } of input.updates) {
                const task = this.findTask(taskId)!; // Safe because we validated above

                if (updates.dependencies) {
                    task.dependencies = updates.dependencies;
                }

                Object.assign(task, {
                    name: updates.name ?? task.name,
                    description: updates.description ?? task.description,
                    notes: updates.notes ?? task.notes,
                    reasoning: updates.reasoning ?? task.reasoning,
                    type: updates.type ?? task.type,
                    status: updates.status ?? task.status,
                    metadata: {
                        ...task.metadata,
                        ...updates.metadata,
                        updated: now,
                        sessionId: this.sessionId
                    }
                });

                if (isRootTask(task.parentId)) {
                    this.tasks.set(taskId, task);
                }

                affectedTasks.add(taskId);
                if (!isRootTask(task.parentId)) {
                    affectedTasks.add(task.parentId);
                }

                updatedTasks.push(task);
            }

            await this.saveTasks();

            // Update parent statuses after all tasks are updated
            for (const { taskId, updates } of input.updates) {
                if (updates.status && !isRootTask(this.findTask(taskId)!.parentId)) {
                    await this.updateParentStatus(taskId);
                }
            }

            return {
                success: true,
                data: updatedTasks,
                metadata: {
                    timestamp: now,
                    requestId: uuidv4(),
                    sessionId: this.sessionId,
                    affectedTasks: Array.from(affectedTasks)
                }
            };
        } catch (error) {
            return this.handleError(error);
        }
    }

    async deleteTask(taskId: string): Promise<TaskResponse<void>> {
        try {
            const task = this.findTask(taskId);
            if (!task) {
                throw new TaskNotFoundError(taskId);
            }

            const affectedTasks = [taskId];

            if (!isRootTask(task.parentId)) {
                const parent = this.findTask(task.parentId);
                if (parent) {
                    parent.subtasks = parent.subtasks.filter(t => t.id !== taskId);
                    parent.metadata.updated = new Date().toISOString();
                    if (isRootTask(parent.parentId)) {
                        this.tasks.set(parent.id, parent);
                    }
                    affectedTasks.push(parent.id);
                }
            }

            const hasDependent = (tasks: Task[]): boolean => {
                for (const t of tasks) {
                    if (t.dependencies.includes(taskId)) return true;
                    if (hasDependent(t.subtasks)) return true;
                }
                return false;
            };

            if (hasDependent(Array.from(this.tasks.values()))) {
                throw new DependencyError(
                    `Cannot delete task: other tasks depend on it`,
                    [taskId]
                );
            }

            const deleteSubtasks = (subtasks: Task[]): void => {
                for (const subtask of subtasks) {
                    affectedTasks.push(subtask.id);
                    deleteSubtasks(subtask.subtasks);
                }
            };

            deleteSubtasks(task.subtasks);

            if (isRootTask(task.parentId)) {
                this.tasks.delete(taskId);
            }
            await this.saveTasks();

            return {
                success: true,
                metadata: {
                    timestamp: new Date().toISOString(),
                    requestId: uuidv4(),
                    sessionId: this.sessionId,
                    affectedTasks
                }
            };
        } catch (error) {
            return this.handleError(error);
        }
    }

    async getSubtasks(taskId: string): Promise<TaskResponse<Task[]>> {
        try {
            const task = this.findTask(taskId);
            if (!task) {
                throw new TaskNotFoundError(taskId);
            }

            return {
                success: true,
                data: task.subtasks,
                metadata: {
                    timestamp: new Date().toISOString(),
                    requestId: uuidv4(),
                    sessionId: this.sessionId
                }
            };
        } catch (error) {
            return this.handleError(error);
        }
    }

    async getTasksByStatus(status: TaskStatus): Promise<TaskResponse<Task[]>> {
        try {
            const getTasksWithStatus = (tasks: Task[]): Task[] => {
                const result: Task[] = [];
                for (const task of tasks) {
                    if (task.status === status) {
                        result.push(task);
                    }
                    result.push(...getTasksWithStatus(task.subtasks));
                }
                return result;
            };

            const tasks = getTasksWithStatus(Array.from(this.tasks.values()));

            return {
                success: true,
                data: tasks,
                metadata: {
                    timestamp: new Date().toISOString(),
                    requestId: uuidv4(),
                    sessionId: this.sessionId
                }
            };
        } catch (error) {
            return this.handleError(error);
        }
    }

    async getTaskTree(): Promise<TaskResponse<Task[]>> {
        try {
            const rootTasks = Array.from(this.tasks.values())
                .filter(task => isRootTask(task.parentId));

            return {
                success: true,
                data: rootTasks,
                metadata: {
                    timestamp: new Date().toISOString(),
                    requestId: uuidv4(),
                    sessionId: this.sessionId
                }
            };
        } catch (error) {
            return this.handleError(error);
        }
    }

    private handleError(error: unknown): TaskResponse<never> {
        const now = new Date().toISOString();
        const metadata = {
            timestamp: now,
            requestId: uuidv4(),
            sessionId: this.sessionId
        };

        if (error instanceof TaskValidationError) {
            return {
                success: false,
                error: {
                    code: error.code,
                    message: error.message,
                    details: error.details
                },
                metadata
            };
        }

        if (error instanceof TaskNotFoundError) {
            return {
                success: false,
                error: {
                    code: 'TASK_NOT_FOUND',
                    message: error.message
                },
                metadata
            };
        }

        if (error instanceof DependencyError) {
            return {
                success: false,
                error: {
                    code: 'DEPENDENCY_ERROR',
                    message: error.message,
                    details: { dependencies: error.dependencies }
                },
                metadata
            };
        }

        console.error('Unexpected error:', error);
        return {
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: error instanceof Error ? error.message : 'An unexpected error occurred',
                details: error instanceof Error ? error.stack : undefined
            },
            metadata
        };
    }
}
