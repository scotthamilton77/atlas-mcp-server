import { z } from 'zod';
import { createTaskSchema } from './create-schema.js';
import { updateTaskSchema } from './update-schema.js';
import { PathValidator } from '../../../validation/index.js';
import { CONSTRAINTS } from '../../../types/task.js';

const pathValidator = new PathValidator({
    maxDepth: CONSTRAINTS.MAX_PATH_DEPTH,
    maxLength: 1000,
    allowedCharacters: /^[a-zA-Z0-9-_/]+$/,
    projectNamePattern: /^[a-zA-Z][a-zA-Z0-9-_]*$/,
    maxProjectNameLength: 100
});

// Schema for each operation type
const createOperationSchema = z.object({
    type: z.literal('create'),
    path: z.string().refine(
        (path) => {
            const result = pathValidator.validatePath(path);
            return result.isValid;
        },
        (path) => ({ message: pathValidator.validatePath(path).error || 'Invalid path format' })
    ),
    data: createTaskSchema
});

const updateOperationSchema = z.object({
    type: z.literal('update'),
    path: z.string().refine(
        (path) => {
            const result = pathValidator.validatePath(path);
            return result.isValid;
        },
        (path) => ({ message: pathValidator.validatePath(path).error || 'Invalid path format' })
    ),
    data: updateTaskSchema
});

const deleteOperationSchema = z.object({
    type: z.literal('delete'),
    path: z.string().refine(
        (path) => {
            const result = pathValidator.validatePath(path);
            return result.isValid;
        },
        (path) => ({ message: pathValidator.validatePath(path).error || 'Invalid path format' })
    )
});

// Combined schema for bulk operations
export const bulkOperationsSchema = z.object({
    operations: z.array(
        z.discriminatedUnion('type', [
            createOperationSchema,
            updateOperationSchema,
            deleteOperationSchema
        ])
    ).min(1).max(100)
});

export type BulkOperationInput = z.infer<typeof bulkOperationsSchema>;
