import { z } from 'zod';
import { createTaskSchema } from './create-schema.js';
import { updateTaskSchema } from './update-schema.js';
import { ValidationConstants, pathSchema } from '../../../validation/core/index.js';

// Schema for each operation type
const createOperationSchema = z.object({
  type: z.literal('create'),
  path: pathSchema,
  data: createTaskSchema,
});

const updateOperationSchema = z.object({
  type: z.literal('update'),
  path: pathSchema,
  data: updateTaskSchema,
});

const deleteOperationSchema = z.object({
  type: z.literal('delete'),
  path: pathSchema,
});

// Combined schema for bulk operations
export const bulkOperationsSchema = z.object({
  operations: z
    .array(
      z.discriminatedUnion('type', [
        createOperationSchema,
        updateOperationSchema,
        deleteOperationSchema,
      ])
    )
    .min(1)
    .max(ValidationConstants.metadata.maxArrayItems),
  reasoning: z.string().max(ValidationConstants.task.descriptionMaxLength).optional(),
});

export type BulkOperationInput = z.infer<typeof bulkOperationsSchema>;
