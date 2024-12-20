/**
 * Task validation schemas using Zod
 */
import { z } from 'zod';
import {
    TaskType,
    TaskStatus,
    NoteType,
    CreateTaskInput,
    UpdateTaskInput,
    TaskNote,
    TaskReasoning,
    TaskMetadata,
    Task
} from '../types/task.js';
import { ErrorCodes, createError } from '../errors/index.js';
import { 
    taskIdSchema, 
    sessionIdSchema, 
    idArraySchema, 
    optionalIdSchema 
} from './id-schema.js';

/**
 * Validation functions for individual task components
 */
export function validateTaskNotes(notes: TaskNote[]): void {
    for (const note of notes) {
        if (!Object.values(NoteType).includes(note.type)) {
            throw createError(ErrorCodes.TASK_VALIDATION, `Invalid note type: ${note.type}`);
        }
        if (note.type === NoteType.CODE && !note.language) {
            throw createError(ErrorCodes.TASK_VALIDATION, 'Language must be specified for code notes');
        }
        if (note.type === NoteType.JSON) {
            try {
                JSON.parse(note.content);
            } catch {
                throw createError(ErrorCodes.TASK_VALIDATION, 'Invalid JSON content in note');
            }
        }
    }
}

export function validateTaskReasoning(reasoning: TaskReasoning): void {
    if (reasoning.assumptions && !Array.isArray(reasoning.assumptions)) {
        throw createError(ErrorCodes.TASK_VALIDATION, 'Assumptions must be an array of strings');
    }
    if (reasoning.alternatives && !Array.isArray(reasoning.alternatives)) {
        throw createError(ErrorCodes.TASK_VALIDATION, 'Alternatives must be an array of strings');
    }
    if (reasoning.risks && !Array.isArray(reasoning.risks)) {
        throw createError(ErrorCodes.TASK_VALIDATION, 'Risks must be an array of strings');
    }
    if (reasoning.tradeoffs && !Array.isArray(reasoning.tradeoffs)) {
        throw createError(ErrorCodes.TASK_VALIDATION, 'Tradeoffs must be an array of strings');
    }
    if (reasoning.constraints && !Array.isArray(reasoning.constraints)) {
        throw createError(ErrorCodes.TASK_VALIDATION, 'Constraints must be an array of strings');
    }
    if (reasoning.dependencies_rationale && !Array.isArray(reasoning.dependencies_rationale)) {
        throw createError(ErrorCodes.TASK_VALIDATION, 'Dependencies rationale must be an array of strings');
    }
    if (reasoning.impact_analysis && !Array.isArray(reasoning.impact_analysis)) {
        throw createError(ErrorCodes.TASK_VALIDATION, 'Impact analysis must be an array of strings');
    }
}

export function validateTaskMetadata(metadata: Record<string, unknown>): void {
    if (!metadata.created || typeof metadata.created !== 'string') {
        throw createError(ErrorCodes.TASK_VALIDATION, 'Created timestamp is required and must be a string');
    }
    if (!metadata.updated || typeof metadata.updated !== 'string') {
        throw createError(ErrorCodes.TASK_VALIDATION, 'Updated timestamp is required and must be a string');
    }
    if (!metadata.sessionId || typeof metadata.sessionId !== 'string') {
        throw createError(ErrorCodes.TASK_VALIDATION, 'Session ID is required and must be a string');
    }
    if (metadata.tags !== undefined) {
        if (!Array.isArray(metadata.tags)) {
            throw createError(ErrorCodes.TASK_VALIDATION, 'Tags must be an array of strings');
        }
        if (metadata.tags.some(tag => typeof tag !== 'string')) {
            throw createError(ErrorCodes.TASK_VALIDATION, 'All tags must be strings');
        }
    }
    if (metadata.context !== undefined && typeof metadata.context !== 'string') {
        throw createError(ErrorCodes.TASK_VALIDATION, 'Context must be a string');
    }
}

/**
 * Input sanitization and validation
 */
export function sanitizeTaskInput(input: CreateTaskInput | UpdateTaskInput): void {
    // Sanitize name
    if ('name' in input && input.name) {
        // Remove any HTML/script tags
        input.name = input.name
            .replace(/<[^>]*>/g, '')
            .replace(/[<>]/g, '')
            .trim();
        
        if (input.name.length === 0) {
            throw createError(ErrorCodes.TASK_VALIDATION, 'Task name cannot be empty');
        }
        if (input.name.length > 200) {
            throw createError(ErrorCodes.TASK_VALIDATION, 'Task name too long (max 200 characters)');
        }
        
        // Prevent path traversal
        if (input.name.includes('..') || input.name.includes('/') || input.name.includes('\\')) {
            throw createError(ErrorCodes.TASK_VALIDATION, 'Task name contains invalid characters');
        }
    }

    // Sanitize description
    if (input.description) {
        input.description = input.description.trim();
        if (input.description.length > 2000) {
            throw createError(ErrorCodes.TASK_VALIDATION, 'Description too long (max 2000 characters)');
        }
    }

    // Validate notes if present
    if (input.notes) {
        validateTaskNotes(input.notes);
    }

    // Validate reasoning if present
    if (input.reasoning) {
        validateTaskReasoning(input.reasoning);
    }

    // Validate metadata if present
    if (input.metadata) {
        validateTaskMetadata(input.metadata);
    }

    // Validate dependencies
    if (input.dependencies) {
        if (!Array.isArray(input.dependencies)) {
            throw createError(ErrorCodes.TASK_VALIDATION, 'Dependencies must be an array');
        }
        if (new Set(input.dependencies).size !== input.dependencies.length) {
            throw createError(ErrorCodes.TASK_VALIDATION, 'Duplicate dependencies are not allowed');
        }
    }

    // Validate subtasks if present
    if ('subtasks' in input && input.subtasks) {
        if (!Array.isArray(input.subtasks)) {
            throw createError(ErrorCodes.TASK_VALIDATION, 'Subtasks must be an array');
        }
        input.subtasks.forEach(subtask => sanitizeTaskInput(subtask));
    }
}

/**
 * Task note validation schema
 */
export const taskNoteSchema = z.object({
    type: z.nativeEnum(NoteType, {
        required_error: "Note type is required",
        invalid_type_error: "Invalid note type. Must be one of: text, code, json, markdown"
    }),
    content: z.string({
        required_error: "Note content is required",
        invalid_type_error: "Note content must be a string"
    }).min(1, 'Content cannot be empty'),
    language: z.string().optional(),
    metadata: z.record(z.unknown()).optional()
}).superRefine((data, ctx) => {
    // More flexible validation with better error messages
    if (data.type === NoteType.CODE && !data.language) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Code note requires a language field. Supported languages include: javascript, typescript, python, java, etc.`,
            path: ["language"]
        });
    }
    if (data.type === NoteType.JSON && data.content) {
        try {
            JSON.parse(data.content);
        } catch (e) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Invalid JSON content: ${e instanceof Error ? e.message : 'Parse error'}. Please provide valid JSON.`,
                path: ["content"]
            });
        }
    }
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
    sessionId: sessionIdSchema,
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
    type: z.nativeEnum(TaskType, {
        invalid_type_error: "Invalid task type. Must be one of: task, milestone, group"
    }).optional()
});

/**
 * Task creation input validation schema
 */
// Maximum allowed depth for task hierarchies
const MAX_HIERARCHY_DEPTH = 5;

// Helper to calculate task depth
const calculateTaskDepth = (task: any): number => {
    if (!task.subtasks?.length) {
        return 1;
    }
    const maxSubtaskDepth = Math.max(...task.subtasks.map(calculateTaskDepth));
    return 1 + maxSubtaskDepth;
};

// Helper to validate task hierarchy
const validateTaskHierarchy = (task: any): boolean => {
    const depth = calculateTaskDepth(task);
    if (depth > MAX_HIERARCHY_DEPTH) {
        return false;
    }
    if (task.subtasks?.length) {
        return task.subtasks.every(validateTaskHierarchy);
    }
    return true;
};

export const createTaskSchema: z.ZodType<CreateTaskInput> = baseTaskSchema.extend({
    parentId: optionalIdSchema,
    dependencies: idArraySchema.default([]),
    metadata: z.object({
        context: z.string().optional(),
        tags: z.array(z.string()).optional()
    }).strict().optional()
        .describe('Optional metadata for the task. If provided, must contain only context and/or tags'),
    subtasks: z.array(z.lazy(() => createTaskSchema)).optional()
}).strict()
.superRefine((task, ctx) => {
    // Validate hierarchy depth
    const depth = calculateTaskDepth(task);
    if (depth > MAX_HIERARCHY_DEPTH) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Task hierarchy cannot exceed ${MAX_HIERARCHY_DEPTH} levels deep`,
            path: ['subtasks']
        });
    }
});

/**
 * Task update input validation schema
 */
export const updateTaskSchema = baseTaskSchema.partial().extend({
    status: z.nativeEnum(TaskStatus, {
        invalid_type_error: "Invalid status. Must be one of: pending, in_progress, completed, failed, blocked"
    }).optional(),
    dependencies: idArraySchema.optional(),
    metadata: z.object({
        context: z.string().optional(),
        tags: z.array(z.string()).optional()
    }).strict().optional()
}).strict()
.superRefine((updates, ctx) => {
    if (updates.status === TaskStatus.COMPLETED && updates.dependencies?.length) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Cannot complete task with dependencies until all dependencies are completed",
            path: ["status"]
        });
    }
});

/**
 * Complete task validation schema
 */
export const taskSchema = baseTaskSchema.extend({
    id: taskIdSchema,
    status: z.nativeEnum(TaskStatus, {
        invalid_type_error: "Invalid status. Must be one of: pending, in_progress, completed, failed, blocked"
    }),
    dependencies: idArraySchema,
    subtasks: idArraySchema,
    metadata: taskMetadataSchema,
    parentId: optionalIdSchema,
    error: z.object({
        code: z.string(),
        message: z.string(),
        details: z.unknown().optional()
    }).optional()
}).strict();

/**
 * Bulk operations validation schemas with improved flexibility
 */
export const bulkCreateTaskSchema = z.object({
    parentId: optionalIdSchema
        .describe('Default parent ID for tasks. Individual task parentIds take precedence'),
    tasks: z.array(createTaskSchema)
        .min(1, "Must provide at least one task to create")
}).strict()
.superRefine((data, ctx) => {
    if (data.tasks.length > 50) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Batch size cannot exceed 50 tasks",
            path: ["tasks"]
        });
    }

    // Validate parent IDs in bulk creation
    const parentIds = new Set<string>();
    data.tasks.forEach((task, index) => {
        if (task.parentId) {
            if (task.parentId === data.parentId) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'Task cannot specify the same parentId as the bulk operation',
                    path: ['tasks', index, 'parentId']
                });
            }
            parentIds.add(task.parentId);
        }
    });
});

export const bulkUpdateTaskSchema = z.object({
    updates: z.array(z.object({
        taskId: taskIdSchema,
        updates: updateTaskSchema
    }).strict())
    .min(1, "Must provide at least one update")
}).strict()
.superRefine((data, ctx) => {
    if (data.updates.length > 50) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Batch size cannot exceed 50 tasks",
            path: ["updates"]
        });
    }

    const taskIds = new Set();
    data.updates.forEach((update, index) => {
        if (taskIds.has(update.taskId)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Duplicate task IDs are not allowed",
                path: ["updates", index, "taskId"]
            });
        }
        taskIds.add(update.taskId);
    });
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
