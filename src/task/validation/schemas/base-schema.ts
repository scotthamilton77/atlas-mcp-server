import { z } from 'zod';
import { PathValidator } from '../../../validation/index.js';
import { taskMetadataSchema } from './metadata-schema.js';
import { TaskType, TaskStatus } from '../../../types/task.js';

// Constants for validation
const VALIDATION_CONSTRAINTS = {
    MAX_PATH_DEPTH: 10,
    MAX_PATH_LENGTH: 1000,
    MAX_PROJECT_NAME_LENGTH: 100,
    MAX_NAME_LENGTH: 200,
    MAX_DESCRIPTION_LENGTH: 2000,
    MAX_NOTE_LENGTH: 1000,
    MAX_NOTES: 100,
    MAX_DEPENDENCIES: 50,
    MAX_SUBTASKS: 100,
    MAX_REASONING_LENGTH: 2000
} as const;

// Initialize path validator for schema validation
const pathValidator = new PathValidator({
    maxDepth: VALIDATION_CONSTRAINTS.MAX_PATH_DEPTH,
    maxLength: VALIDATION_CONSTRAINTS.MAX_PATH_LENGTH,
    allowedCharacters: /^[a-zA-Z0-9-_/]+$/,
    projectNamePattern: /^[a-zA-Z][a-zA-Z0-9-_]*$/,
    maxProjectNameLength: VALIDATION_CONSTRAINTS.MAX_PROJECT_NAME_LENGTH
});

// Create enums for zod that match our TaskType and TaskStatus
const TaskTypeEnum = z.enum([TaskType.TASK, TaskType.MILESTONE]);
const TaskStatusEnum = z.enum([
    TaskStatus.PENDING,
    TaskStatus.IN_PROGRESS,
    TaskStatus.COMPLETED,
    TaskStatus.FAILED,
    TaskStatus.BLOCKED
]);

/**
 * Base task schema with system fields at root level
 */
export const baseTaskSchema = z.object({
    // System fields
    path: z.string()
        .refine(
            (path) => {
                const result = pathValidator.validatePath(path);
                return result.isValid;
            },
            (path) => ({ message: pathValidator.validatePath(path).error || 'Invalid path format' })
        ),
    name: z.string().min(1).max(VALIDATION_CONSTRAINTS.MAX_NAME_LENGTH),
    type: TaskTypeEnum,
    status: TaskStatusEnum,
    created: z.number(),
    updated: z.number(),
    version: z.number().positive(),
    projectPath: z.string().max(VALIDATION_CONSTRAINTS.MAX_PATH_LENGTH),

    // Optional fields
    description: z.string().max(VALIDATION_CONSTRAINTS.MAX_DESCRIPTION_LENGTH).optional(),
    parentPath: z.string().optional(),
    notes: z.array(z.string().max(VALIDATION_CONSTRAINTS.MAX_NOTE_LENGTH))
        .max(VALIDATION_CONSTRAINTS.MAX_NOTES)
        .optional(),
    reasoning: z.string().max(VALIDATION_CONSTRAINTS.MAX_REASONING_LENGTH).optional(),
    dependencies: z.array(z.string()).max(VALIDATION_CONSTRAINTS.MAX_DEPENDENCIES),
    subtasks: z.array(z.string()).max(VALIDATION_CONSTRAINTS.MAX_SUBTASKS),

    // User-defined metadata
    metadata: taskMetadataSchema
});

export type BaseTask = z.infer<typeof baseTaskSchema>;

/**
 * Task response schema for API responses
 */
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

export type TaskResponse = z.infer<typeof taskResponseSchema>;
