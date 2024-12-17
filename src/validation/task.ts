/**
 * Task validation schemas using Zod
 */
import { z } from 'zod';
import { TaskTypes, TaskStatuses, NoteTypes, CreateTaskInput } from '../types/task.js';

/**
 * Task note validation schema
 */
export const taskNoteSchema = z.object({
    type: z.enum([NoteTypes.TEXT, NoteTypes.CODE, NoteTypes.JSON, NoteTypes.MARKDOWN], {
        required_error: "Note type is required",
        invalid_type_error: "Invalid note type. Must be one of: text, code, json, markdown"
    }),
    content: z.string({
        required_error: "Note content is required",
        invalid_type_error: "Note content must be a string"
    }).min(1, 'Content cannot be empty'),
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
    message: "Invalid note format. Code notes require a language, and JSON notes must contain valid JSON",
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
    created: z.string().datetime({
        message: "Created date must be a valid ISO datetime string"
    }),
    updated: z.string().datetime({
        message: "Updated date must be a valid ISO datetime string"
    }),
    sessionId: z.string().uuid({
        message: "Session ID must be a valid UUID"
    }),
    context: z.string().optional(),
    tags: z.array(z.string()).optional()
}).catchall(z.unknown());

/**
 * Base task validation schema
 */
const baseTaskSchema = z.object({
    name: z.string({
        required_error: "Task name is required",
        invalid_type_error: "Task name must be a string"
    })
        .min(1, 'Task name cannot be empty')
        .max(200, 'Task name cannot exceed 200 characters')
        .describe('The name of the task (required)'),
    description: z.string({
        invalid_type_error: "Description must be a string"
    })
        .max(2000, 'Description cannot exceed 2000 characters')
        .optional(),
    notes: z.array(taskNoteSchema).optional(),
    reasoning: taskReasoningSchema.optional(),
    type: z.enum([TaskTypes.TASK, TaskTypes.MILESTONE, TaskTypes.GROUP], {
        invalid_type_error: "Invalid task type. Must be one of: task, milestone, group"
    }).optional()
});

/**
 * Task creation input validation schema
 */
export const createTaskSchema: z.ZodType<CreateTaskInput> = baseTaskSchema.extend({
    parentId: z.string().uuid({
        message: "Parent ID must be a valid UUID"
    }).nullable().optional(),
    dependencies: z.array(z.string().uuid({
        message: "Dependencies must be valid task UUIDs"
    })).optional(),
    metadata: z.object({
        context: z.string().optional(),
        tags: z.array(z.string()).optional()
    }).catchall(z.unknown()).optional(),
    subtasks: z.array(z.lazy(() => createTaskSchema)).optional()
}).strict({
    message: "Invalid task properties provided. Check the schema for allowed fields."
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
    ], {
        invalid_type_error: "Invalid status. Must be one of: pending, in_progress, completed, failed, blocked"
    }).optional(),
    dependencies: z.array(z.string().uuid({
        message: "Dependencies must be valid task UUIDs"
    })).optional(),
    metadata: z.object({
        context: z.string().optional(),
        tags: z.array(z.string()).optional()
    }).catchall(z.unknown()).optional()
}).strict();

/**
 * Complete task validation schema
 */
export const taskSchema = baseTaskSchema.extend({
    id: z.string().uuid({
        message: "Task ID must be a valid UUID"
    }),
    status: z.enum([
        TaskStatuses.PENDING,
        TaskStatuses.IN_PROGRESS,
        TaskStatuses.COMPLETED,
        TaskStatuses.FAILED,
        TaskStatuses.BLOCKED
    ], {
        invalid_type_error: "Invalid status. Must be one of: pending, in_progress, completed, failed, blocked"
    }),
    dependencies: z.array(z.string().uuid()),
    subtasks: z.array(z.string().uuid()),
    metadata: taskMetadataSchema,
    parentId: z.string(),
    error: z.object({
        code: z.string(),
        message: z.string(),
        details: z.unknown().optional()
    }).optional()
}).strict();

/**
 * Bulk operations validation schemas
 */
export const bulkCreateTaskSchema = z.object({
    parentId: z.string().uuid().nullable(),
    tasks: z.array(createTaskSchema)
}).strict();

export const bulkUpdateTaskSchema = z.object({
    updates: z.array(z.object({
        taskId: z.string().uuid(),
        updates: updateTaskSchema
    }))
}).strict();

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
