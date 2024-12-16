/**
 * Task validation schemas using Zod
 */
import { z } from 'zod';
import { TaskTypes, TaskStatuses, NoteTypes, CreateTaskInput } from '../types/task.js';

/**
 * Task note validation schema
 */
export const taskNoteSchema = z.object({
    type: z.enum([NoteTypes.TEXT, NoteTypes.CODE, NoteTypes.JSON, NoteTypes.MARKDOWN]),
    content: z.string().min(1, 'Content cannot be empty'),
    language: z.string().optional(),
    metadata: z.record(z.unknown()).optional()
}).refine(data => {
    if (data.type === NoteTypes.CODE && !data.language) {
        return false;
    }
    if (data.type === NoteTypes.JSON) {
        try {
            JSON.parse(data.content);
            return true;
        } catch {
            return false;
        }
    }
    return true;
}, {
    message: "Invalid note format",
    path: ["content"]
});

/**
 * Task reasoning validation schema
 */
export const taskReasoningSchema = z.object({
    approach: z.string().optional(),
    assumptions: z.array(z.string()).optional(),
    alternatives: z.array(z.string()).optional(),
    risks: z.array(z.string()).optional(),
    tradeoffs: z.array(z.string()).optional(),
    constraints: z.array(z.string()).optional(),
    dependencies_rationale: z.array(z.string()).optional(),
    impact_analysis: z.array(z.string()).optional()
}).catchall(z.unknown());

/**
 * Task metadata validation schema
 */
export const taskMetadataSchema = z.object({
    created: z.string().datetime(),
    updated: z.string().datetime(),
    sessionId: z.string().uuid(),
    context: z.string().optional(),
    tags: z.array(z.string()).optional()
}).catchall(z.unknown());

/**
 * Base task validation schema
 */
const baseTaskSchema = z.object({
    name: z.string()
        .min(1, 'Task name cannot be empty')
        .max(200, 'Task name cannot exceed 200 characters'),
    description: z.string()
        .max(2000, 'Description cannot exceed 2000 characters')
        .optional(),
    notes: z.array(taskNoteSchema).optional(),
    reasoning: taskReasoningSchema.optional(),
    type: z.enum([TaskTypes.TASK, TaskTypes.MILESTONE, TaskTypes.GROUP])
});

/**
 * Task creation input validation schema
 */
export const createTaskSchema: z.ZodType<CreateTaskInput> = baseTaskSchema.extend({
    dependencies: z.array(z.string().uuid()).optional(),
    metadata: z.object({
        context: z.string().optional(),
        tags: z.array(z.string()).optional()
    }).catchall(z.unknown()).optional(),
    subtasks: z.array(z.lazy(() => createTaskSchema)).optional()
});

/**
 * Task update input validation schema
 */
export const updateTaskSchema = baseTaskSchema.partial().extend({
    status: z.enum([
        TaskStatuses.PENDING,
        TaskStatuses.IN_PROGRESS,
        TaskStatuses.COMPLETED,
        TaskStatuses.FAILED,
        TaskStatuses.BLOCKED
    ]).optional(),
    dependencies: z.array(z.string().uuid()).optional(),
    metadata: z.object({
        context: z.string().optional(),
        tags: z.array(z.string()).optional()
    }).catchall(z.unknown()).optional()
});

/**
 * Complete task validation schema
 */
export const taskSchema = baseTaskSchema.extend({
    id: z.string().uuid(),
    status: z.enum([
        TaskStatuses.PENDING,
        TaskStatuses.IN_PROGRESS,
        TaskStatuses.COMPLETED,
        TaskStatuses.FAILED,
        TaskStatuses.BLOCKED
    ]),
    dependencies: z.array(z.string().uuid()),
    subtasks: z.array(z.string().uuid()),
    metadata: taskMetadataSchema,
    parentId: z.string(),
    error: z.object({
        code: z.string(),
        message: z.string(),
        details: z.unknown().optional()
    }).optional()
});

/**
 * Bulk operations validation schemas
 */
export const bulkCreateTaskSchema = z.object({
    parentId: z.string().uuid().nullable(),
    tasks: z.array(createTaskSchema)
});

export const bulkUpdateTaskSchema = z.object({
    updates: z.array(z.object({
        taskId: z.string().uuid(),
        updates: updateTaskSchema
    }))
});

/**
 * Task validation functions with explicit return types
 */
export const validateTask = (task: unknown): z.infer<typeof taskSchema> => 
    taskSchema.parse(task);

export const validateCreateTask = (input: unknown): z.infer<typeof createTaskSchema> => 
    createTaskSchema.parse(input);

export const validateUpdateTask = (input: unknown): z.infer<typeof updateTaskSchema> => 
    updateTaskSchema.parse(input);

export const validateBulkCreateTask = (input: unknown): z.infer<typeof bulkCreateTaskSchema> => 
    bulkCreateTaskSchema.parse(input);

export const validateBulkUpdateTask = (input: unknown): z.infer<typeof bulkUpdateTaskSchema> => 
    bulkUpdateTaskSchema.parse(input);

/**
 * Safe validation functions (returns result object instead of throwing)
 */
export const safeValidateTask = (task: unknown): z.SafeParseReturnType<unknown, z.infer<typeof taskSchema>> => 
    taskSchema.safeParse(task);

export const safeValidateCreateTask = (input: unknown): z.SafeParseReturnType<unknown, z.infer<typeof createTaskSchema>> => 
    createTaskSchema.safeParse(input);

export const safeValidateUpdateTask = (input: unknown): z.SafeParseReturnType<unknown, z.infer<typeof updateTaskSchema>> => 
    updateTaskSchema.safeParse(input);

export const safeValidateBulkCreateTask = (input: unknown): z.SafeParseReturnType<unknown, z.infer<typeof bulkCreateTaskSchema>> => 
    bulkCreateTaskSchema.safeParse(input);

export const safeValidateBulkUpdateTask = (input: unknown): z.SafeParseReturnType<unknown, z.infer<typeof bulkUpdateTaskSchema>> => 
    bulkUpdateTaskSchema.safeParse(input);
