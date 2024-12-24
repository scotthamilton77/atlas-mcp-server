/**
 * Task validation module
 */
import { z } from 'zod';
import { TaskType, TaskStatus, CONSTRAINTS } from '../types/task.js';
import { createError, ErrorCodes } from '../errors/index.js';

/**
 * Validates a task path format and depth
 */
export function validateTaskPath(path: string): { valid: boolean; error?: string } {
    // Path must be non-empty
    if (!path) {
        return { valid: false, error: 'Path cannot be empty' };
    }

    // Path must contain only allowed characters
    if (!path.match(/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/)) {
        return { 
            valid: false, 
            error: 'Path can only contain alphanumeric characters, underscores, dots, and hyphens' 
        };
    }
    
    // Check path depth
    if (path.split('/').length > CONSTRAINTS.MAX_PATH_DEPTH) {
        return { 
            valid: false, 
            error: `Path depth cannot exceed ${CONSTRAINTS.MAX_PATH_DEPTH} levels` 
        };
    }

    return { valid: true };
}

/**
 * Validates parent-child task type relationships
 */
export function isValidTaskHierarchy(parentType: TaskType, childType: TaskType): { valid: boolean; reason?: string } {
    switch (parentType) {
        case TaskType.MILESTONE:
            // Milestones can contain tasks and groups
            return {
                valid: childType === TaskType.TASK || childType === TaskType.GROUP,
                reason: childType !== TaskType.TASK && childType !== TaskType.GROUP ?
                    `MILESTONE can only contain TASK or GROUP types, not ${childType}` : undefined
            };
        case TaskType.GROUP:
            // Groups can contain tasks
            return {
                valid: childType === TaskType.TASK,
                reason: childType !== TaskType.TASK ?
                    `GROUP can only contain TASK type, not ${childType}` : undefined
            };
        case TaskType.TASK:
            // Tasks cannot contain other tasks
            return {
                valid: false,
                reason: `TASK type cannot contain any subtasks (attempted to add ${childType})`
            };
        default:
            return {
                valid: false,
                reason: `Unknown task type: ${parentType}`
            };
    }
}

// Task metadata schema
const taskMetadataSchema = z.object({
    priority: z.enum(['low', 'medium', 'high']).optional(),
    tags: z.array(z.string().max(100)).max(100).optional(),
    reasoning: z.string().max(2000).optional(),
    toolsUsed: z.array(z.string().max(100)).max(100).optional(),
    resourcesAccessed: z.array(z.string().max(100)).max(100).optional(),
    contextUsed: z.array(z.string().max(1000)).max(100).optional(),
    created: z.number(),
    updated: z.number(),
    projectPath: z.string().max(1000),
    version: z.number().positive()
}).passthrough(); // Allow additional properties with size limits

// Base task schema
const baseTaskSchema = z.object({
    path: z.string()
        .regex(/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/)
        .refine(
            (path) => path.split('/').length <= 8,
            'Path depth cannot exceed 8 levels'
        ),
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    type: z.nativeEnum(TaskType),
    status: z.nativeEnum(TaskStatus),
    parentPath: z.string().optional(),
    notes: z.array(z.string().max(1000)).max(100).optional(),
    reasoning: z.string().max(2000).optional(),
    dependencies: z.array(z.string()).max(50),
    subtasks: z.array(z.string()).max(100),
    metadata: taskMetadataSchema
});

// Create task input schema
export const createTaskSchema = z.object({
    path: z.string()
        .regex(/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/)
        .refine(
            (path) => !path || path.split('/').length <= 8,
            'Path depth cannot exceed 8 levels'
        )
        .optional(),
    name: z.string().min(1).max(200),
    parentPath: z.string()
        .regex(/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/)
        .refine(
            (path) => path.split('/').length <= 7, // One less than max to allow for child
            'Parent path depth cannot exceed 7 levels'
        )
        .optional(),
    description: z.string().max(2000).optional(),
    type: z.nativeEnum(TaskType).optional(),
    notes: z.array(z.string().max(1000)).max(100).optional(),
    reasoning: z.string().max(2000).optional(),
    dependencies: z.array(z.string()).max(50).optional(),
    metadata: z.object({
        priority: z.enum(['low', 'medium', 'high']).optional(),
        tags: z.array(z.string().max(100)).max(100).optional(),
        reasoning: z.string().max(2000).optional(),
        toolsUsed: z.array(z.string().max(100)).max(100).optional(),
        resourcesAccessed: z.array(z.string().max(100)).max(100).optional(),
        contextUsed: z.array(z.string().max(1000)).max(100).optional(),
        dependencies: z.array(z.string()).max(50).optional() // Support legacy format
    }).partial().optional().transform(data => {
        if (data?.dependencies) {
            // Log migration of dependencies from metadata
            console.warn('Migrating dependencies from metadata to main task structure');
        }
        return data;
    })
});

// Update task input schema
export const updateTaskSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    type: z.nativeEnum(TaskType).optional(),
    status: z.nativeEnum(TaskStatus).optional(),
    notes: z.array(z.string().max(1000)).max(100).optional(),
    reasoning: z.string().max(2000).optional(),
    dependencies: z.array(z.string()).max(50).optional(),
    metadata: z.object({
        priority: z.enum(['low', 'medium', 'high']).optional(),
        tags: z.array(z.string().max(100)).max(100).optional(),
        reasoning: z.string().max(2000).optional(),
        toolsUsed: z.array(z.string().max(100)).max(100).optional(),
        resourcesAccessed: z.array(z.string().max(100)).max(100).optional(),
        contextUsed: z.array(z.string().max(1000)).max(100).optional(),
        dependencies: z.array(z.string()).max(50).optional() // Support legacy format
    }).partial().optional().transform(data => {
        if (data?.dependencies) {
            // Log migration of dependencies from metadata
            console.warn('Migrating dependencies from metadata to main task structure');
        }
        const { dependencies: _, ...rest } = data || {};
        return rest;
    })
});

// Task response schema
export const taskResponseSchema = z.object({
    success: z.boolean(),
    data: z.unknown().optional(),
    error: z.object({
        code: z.string(),
        message: z.string()
    }).optional(),
    metadata: z.object({
        timestamp: z.number(),
        requestId: z.string(),
        projectPath: z.string(),
        affectedPaths: z.array(z.string())
    })
});

// Export type-safe validation functions
export function validateTask(task: unknown) {
    return baseTaskSchema.parse(task);
}

export function validateCreateTaskInput(input: unknown) {
    return createTaskSchema.parse(input);
}

export function validateUpdateTaskInput(input: unknown) {
    return updateTaskSchema.parse(input);
}

/**
 * Validates task status transitions and dependencies
 */
export async function validateTaskStatusTransition(
    task: z.infer<typeof baseTaskSchema>,
    newStatus: TaskStatus,
    getTaskByPath: (path: string) => Promise<z.infer<typeof baseTaskSchema> | null>
): Promise<void> {
    // Cannot transition from COMPLETED/FAILED back to IN_PROGRESS
    if ((task.status === TaskStatus.COMPLETED || task.status === TaskStatus.FAILED) &&
        newStatus === TaskStatus.IN_PROGRESS) {
        throw createError(
            ErrorCodes.TASK_STATUS,
            {
                taskPath: task.path,
                currentStatus: task.status,
                newStatus
            },
            `Cannot transition from ${task.status} to ${newStatus}`
        );
    }

    // Check dependencies for COMPLETED status
    if (newStatus === TaskStatus.COMPLETED) {
        for (const depPath of task.dependencies) {
            const depTask = await getTaskByPath(depPath);
            if (!depTask || depTask.status !== TaskStatus.COMPLETED) {
                throw createError(
                    ErrorCodes.TASK_DEPENDENCY,
                    {
                        taskPath: task.path,
                        dependencyPath: depPath,
                        dependencyStatus: depTask?.status
                    },
                    `Cannot complete task: dependency ${depPath} is not completed`
                );
            }
        }
    }

    // Check dependencies for IN_PROGRESS status
    if (newStatus === TaskStatus.IN_PROGRESS) {
        const blockedByDeps = await isBlockedByDependencies(task, getTaskByPath);
        if (blockedByDeps) {
            throw createError(
                ErrorCodes.TASK_DEPENDENCY,
                {
                    taskPath: task.path,
                    dependencies: task.dependencies
                },
                'Cannot start task: blocked by incomplete dependencies'
            );
        }
    }
}

/**
 * Checks if a task is blocked by its dependencies
 */
async function isBlockedByDependencies(
    task: z.infer<typeof baseTaskSchema>,
    getTaskByPath: (path: string) => Promise<z.infer<typeof baseTaskSchema> | null>
): Promise<boolean> {
    for (const depPath of task.dependencies) {
        const depTask = await getTaskByPath(depPath);
        if (!depTask || depTask.status === TaskStatus.FAILED || 
            depTask.status === TaskStatus.BLOCKED || 
            depTask.status === TaskStatus.PENDING) {
            return true;
        }
    }
    return false;
}

/**
 * Detects circular dependencies in task relationships
 */
export async function detectDependencyCycle(
    task: z.infer<typeof baseTaskSchema>,
    newDeps: string[],
    getTaskByPath: (path: string) => Promise<z.infer<typeof baseTaskSchema> | null>
): Promise<boolean> {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    async function dfs(currentPath: string): Promise<boolean> {
        if (recursionStack.has(currentPath)) return true;
        if (visited.has(currentPath)) return false;

        visited.add(currentPath);
        recursionStack.add(currentPath);

        const current = await getTaskByPath(currentPath);
        if (!current) return false;

        // Check both existing and new dependencies
        const allDeps = currentPath === task.path ? newDeps : current.dependencies;
        for (const depPath of allDeps) {
            if (await dfs(depPath)) return true;
        }

        recursionStack.delete(currentPath);
        return false;
    }

    return await dfs(task.path);
}

export function validateTaskResponse(response: unknown) {
    return taskResponseSchema.parse(response);
}

// Export schemas for use in other modules
export const schemas = {
    task: baseTaskSchema,
    createTask: createTaskSchema,
    updateTask: updateTaskSchema,
    taskResponse: taskResponseSchema,
    taskMetadata: taskMetadataSchema
};
