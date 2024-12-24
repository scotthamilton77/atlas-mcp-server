import { Logger } from '../../logging/index.js';
import { TaskStorage } from '../../types/storage.js';
import { CreateTaskInput, UpdateTaskInput, TaskType, TaskStatus, CONSTRAINTS, Task } from '../../types/task.js';
import { ErrorCodes, createError } from '../../errors/index.js';
import { z } from 'zod';

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
}).passthrough();

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
        dependencies: z.array(z.string()).max(50).optional()
    }).partial().optional()
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
        dependencies: z.array(z.string()).max(50).optional()
    }).partial().optional()
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

export function validateTaskResponse(response: unknown) {
    return taskResponseSchema.parse(response);
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
            `Cannot transition from ${task.status} to ${newStatus}`,
            'validateTaskStatusTransition',
            undefined,
            {
                taskPath: task.path,
                currentStatus: task.status,
                newStatus
            }
        );
    }

    // Check dependencies for COMPLETED status
    if (newStatus === TaskStatus.COMPLETED) {
        for (const depPath of task.dependencies) {
            const depTask = await getTaskByPath(depPath);
            if (!depTask || depTask.status !== TaskStatus.COMPLETED) {
                throw createError(
                    ErrorCodes.TASK_DEPENDENCY,
                    `Cannot complete task: dependency ${depPath} is not completed`,
                    'validateTaskStatusTransition',
                    undefined,
                    {
                        taskPath: task.path,
                        dependencyPath: depPath,
                        dependencyStatus: depTask?.status
                    }
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
                'Cannot start task: blocked by incomplete dependencies',
                'validateTaskStatusTransition',
                undefined,
                {
                    taskPath: task.path,
                    dependencies: task.dependencies
                }
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

export class TaskValidator {
  private readonly logger: Logger;

  constructor(private readonly storage: TaskStorage) {
    this.logger = Logger.getInstance().child({ component: 'TaskValidator' });
  }

  async validateCreate(input: CreateTaskInput): Promise<void> {
    try {
      // Validate required fields
      if (!input.name) {
        throw createError(
          ErrorCodes.INVALID_INPUT,
          'Task name is required'
        );
      }

      // Validate task type
      if (input.type && !Object.values(TaskType).includes(input.type)) {
        throw createError(
          ErrorCodes.INVALID_INPUT,
          `Invalid task type: ${input.type}`
        );
      }

      // Validate parent path if provided
      if (input.parentPath) {
        const parent = await this.storage.getTask(input.parentPath);
        if (!parent) {
          throw createError(
            ErrorCodes.INVALID_INPUT,
            `Parent task not found: ${input.parentPath}`
          );
        }

        // Validate parent-child relationship
        if (parent.type === TaskType.TASK) {
          throw createError(
            ErrorCodes.INVALID_INPUT,
            'TASK type cannot have child tasks'
          );
        }

        if (parent.type === TaskType.GROUP && input.type === TaskType.MILESTONE) {
          throw createError(
            ErrorCodes.INVALID_INPUT,
            'GROUP type cannot contain MILESTONE tasks'
          );
        }
      }

      // Validate dependencies if provided
      if (input.dependencies?.length) {
        await this.validateDependencies(input.dependencies);
      }

      // Validate metadata if provided
      if (input.metadata) {
        this.validateMetadata(input.metadata);
      }
    } catch (error) {
      this.logger.error('Task creation validation failed', {
        error,
        input
      });
      throw error;
    }
  }

  async validateUpdate(path: string, updates: UpdateTaskInput): Promise<void> {
    try {
      const existingTask = await this.storage.getTask(path);
      if (!existingTask) {
        throw createError(
          ErrorCodes.TASK_NOT_FOUND,
          `Task not found: ${path}`
        );
      }

      // Validate task type change
      if (updates.type && updates.type !== existingTask.type) {
        // Check if task has children when changing to TASK type
        if (updates.type === TaskType.TASK) {
          const hasChildren = await this.storage.hasChildren(path);
          if (hasChildren) {
            throw createError(
              ErrorCodes.INVALID_INPUT,
              'Cannot change to TASK type when task has children'
            );
          }
        }
      }

      // Validate status value and change
      if (updates.status) {
        // Validate status enum value
        if (!Object.values(TaskStatus).includes(updates.status)) {
          throw createError(
            ErrorCodes.INVALID_INPUT,
            `Invalid status value: ${updates.status}`
          );
        }
        await this.validateStatusChange(updates.status, path);
      }

      // Validate dependencies change and check for cycles
      if (updates.dependencies) {
        await this.validateDependencies(updates.dependencies);
        const hasCycle = await detectDependencyCycle(
          existingTask,
          updates.dependencies,
          this.storage.getTask.bind(this.storage)
        );
        if (hasCycle) {
          throw createError(
            ErrorCodes.TASK_CYCLE,
            'Circular dependencies detected in task relationships'
          );
        }
      }

      // Validate metadata updates with schema
      if (updates.metadata) {
        try {
          taskMetadataSchema.parse(updates.metadata);
        } catch (error) {
          throw createError(
            ErrorCodes.INVALID_INPUT,
            `Invalid metadata: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    } catch (error) {
      this.logger.error('Task update validation failed', {
        error,
        path,
        updates
      });
      throw error;
    }
  }

  private async validateDependencies(dependencies: string[]): Promise<void> {
    // Check for missing dependencies
    const missingDeps: string[] = [];
    for (const depPath of dependencies) {
      const depTask = await this.storage.getTask(depPath);
      if (!depTask) {
        missingDeps.push(depPath);
      }
    }

    if (missingDeps.length > 0) {
      throw createError(
        ErrorCodes.INVALID_INPUT,
        `Missing dependencies: ${missingDeps.join(', ')}`
      );
    }

    // Check for circular dependencies using shared utility
    const dummyTask: Task = {
      path: 'temp',
      name: 'Temporary Task',
      type: TaskType.TASK,
      status: TaskStatus.PENDING,
      dependencies: [],
      subtasks: [],
      metadata: {
        version: 1,
        created: Date.now(),
        updated: Date.now(),
        projectPath: 'temp'
      }
    };

    const hasCycle = await detectDependencyCycle(
      dummyTask,
      dependencies,
      this.storage.getTask.bind(this.storage)
    );

    if (hasCycle) {
      throw createError(
        ErrorCodes.TASK_CYCLE,
        'Circular dependencies detected in task relationships'
      );
    }
  }

  private async validateStatusChange(
    newStatus: TaskStatus,
    path: string
  ): Promise<void> {
    // Clear cache before validation
    if ('clearCache' in this.storage) {
      await (this.storage as any).clearCache();
    }

    const task = await this.storage.getTask(path);
    if (!task) {
      throw createError(
        ErrorCodes.TASK_NOT_FOUND,
        `Task not found: ${path}`
      );
    }

    // Validate version hasn't changed
    const currentTask = await this.storage.getTask(path);
    if (currentTask && currentTask.metadata.version !== task.metadata.version) {
      throw createError(
        ErrorCodes.CONCURRENT_MODIFICATION,
        'Task has been modified by another process'
      );
    }

    // Use shared validation utility
    await validateTaskStatusTransition(
      task,
      newStatus,
      this.storage.getTask.bind(this.storage)
    );

    // Check parent task constraints
    if (task.parentPath) {
      const parent = await this.storage.getTask(task.parentPath);
      if (parent) {
        const siblings = await this.storage.getSubtasks(parent.path);
        
        // Cannot complete if siblings are blocked
        if (newStatus === TaskStatus.COMPLETED && 
            siblings.some(s => s.status === TaskStatus.BLOCKED)) {
          throw createError(
            ErrorCodes.TASK_STATUS,
            'Cannot complete task while sibling tasks are blocked'
          );
        }

        // Cannot start if siblings have failed
        if (newStatus === TaskStatus.IN_PROGRESS && 
            siblings.some(s => s.status === TaskStatus.FAILED)) {
          throw createError(
            ErrorCodes.TASK_STATUS,
            'Cannot start task while sibling tasks have failed'
          );
        }
      }
    }
  }

  private validateMetadata(metadata: Record<string, unknown>): void {
    // Add any specific metadata validation rules here
    // For now, just ensure it's an object
    if (typeof metadata !== 'object' || metadata === null) {
      throw createError(
        ErrorCodes.INVALID_INPUT,
        'Metadata must be an object'
      );
    }
  }

}
