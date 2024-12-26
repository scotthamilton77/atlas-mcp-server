import { z } from 'zod';
import { PathValidator } from '../../../validation/index.js';
import { CONSTRAINTS } from '../../../types/task.js';
import { taskMetadataSchema } from './metadata-schema.js';
import { TaskType, TaskStatus } from '../../../types/task.js';

// Initialize path validator for schema validation
const pathValidator = new PathValidator({
    maxDepth: CONSTRAINTS.MAX_PATH_DEPTH,
    maxLength: 1000,
    allowedCharacters: /^[a-zA-Z0-9-_/]+$/,
    projectNamePattern: /^[a-zA-Z][a-zA-Z0-9-_]*$/,
    maxProjectNameLength: 100
});

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
    name: z.string().min(1).max(200),
    type: z.nativeEnum(TaskType),
    status: z.nativeEnum(TaskStatus),
    created: z.number(),
    updated: z.number(),
    version: z.number().positive(),
    projectPath: z.string().max(1000),

    // Optional fields
    description: z.string().max(2000).optional(),
    parentPath: z.string().optional(),
    notes: z.array(z.string().max(1000)).max(100).optional(),
    reasoning: z.string().max(2000).optional(),
    dependencies: z.array(z.string()).max(50),
    subtasks: z.array(z.string()).max(100),

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
