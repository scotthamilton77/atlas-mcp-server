import { z } from 'zod';
import { ValidationConstants, pathSchema } from '../../../validation/core/index.js';
import { taskMetadataSchema } from './metadata-schema.js';
import { TaskType, TaskStatus } from '../../../types/task.js';

// Create enums for zod that match our TaskType and TaskStatus
const TaskTypeEnum = z.enum([TaskType.TASK, TaskType.MILESTONE]);
const TaskStatusEnum = z.enum([
  TaskStatus.PENDING,
  TaskStatus.IN_PROGRESS,
  TaskStatus.COMPLETED,
  TaskStatus.CANCELLED,
  TaskStatus.BLOCKED,
]);

/**
 * Base task schema with system fields at root level
 */
export const baseTaskSchema = z.object({
  // System fields
  path: pathSchema,
  name: z.string().min(1).max(ValidationConstants.task.nameMaxLength),
  type: TaskTypeEnum,
  status: TaskStatusEnum,
  created: z.number(),
  updated: z.number(),
  version: z.number().positive(),
  projectPath: z.string().max(ValidationConstants.path.maxLength),

  // Optional fields
  description: z.string().max(ValidationConstants.task.descriptionMaxLength).optional(),
  parentPath: pathSchema.optional(),
  notes: z
    .array(z.string().max(ValidationConstants.metadata.maxStringLength))
    .max(ValidationConstants.metadata.maxNotes)
    .optional(),
  reasoning: z.string().max(ValidationConstants.task.descriptionMaxLength).optional(),
  dependencies: z.array(pathSchema).max(ValidationConstants.task.maxDependencies),

  // User-defined metadata
  metadata: taskMetadataSchema,
});

export type BaseTask = z.infer<typeof baseTaskSchema>;

/**
 * Task response schema for API responses
 */
export const taskResponseSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
  metadata: z.object({
    timestamp: z.number(),
    requestId: z.string(),
    projectPath: z.string(),
    affectedPaths: z.array(z.string()),
  }),
});

export type TaskResponse = z.infer<typeof taskResponseSchema>;
