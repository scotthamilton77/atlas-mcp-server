import { z } from 'zod';
import { ValidationConstants, pathSchema } from '../../../validation/core/index.js';
import { taskMetadataSchema } from './metadata-schema.js';
import { TaskType } from '../../../types/task.js';

/**
 * Schema for task creation input
 */
export const createTaskSchema = z.object({
  path: pathSchema,
  name: z.string().min(1).max(ValidationConstants.task.nameMaxLength),
  parentPath: pathSchema.optional(),
  description: z.string().max(ValidationConstants.task.descriptionMaxLength).optional(),
  type: z.nativeEnum(TaskType).optional(),
  notes: z
    .never({
      invalid_type_error:
        "Generic 'notes' field is not supported. Please use specific note categories: planningNotes, progressNotes, completionNotes, or troubleshootingNotes",
    })
    .optional(),
  reasoning: z.string().max(ValidationConstants.task.descriptionMaxLength).optional(),
  dependencies: z.array(pathSchema).max(ValidationConstants.task.maxDependencies).optional(),
  metadata: taskMetadataSchema.optional(),
  // Status-specific metadata
  statusMetadata: z
    .object({
      assignee: z.string().optional(),
      progress_indicators: z.array(z.string()).optional(),
      completedBy: z.string().optional(),
      verificationStatus: z.enum(['passed', 'failed']).optional(),
      completionChecks: z.array(z.string()).optional(),
      errorType: z.string().optional(),
      errorDetails: z.string().optional(),
      recoveryAttempts: z.number().optional(),
      blockedBy: z.array(z.string()).optional(),
      blockedReason: z.string().optional(),
    })
    .optional(),
  // Note categories with consistent constraints
  planningNotes: z
    .array(z.string().max(ValidationConstants.task.descriptionMaxLength))
    .max(ValidationConstants.metadata.maxNotes)
    .optional(),
  progressNotes: z
    .array(z.string().max(ValidationConstants.task.descriptionMaxLength))
    .max(ValidationConstants.metadata.maxNotes)
    .optional(),
  completionNotes: z
    .array(z.string().max(ValidationConstants.task.descriptionMaxLength))
    .max(ValidationConstants.metadata.maxNotes)
    .optional(),
  troubleshootingNotes: z
    .array(z.string().max(ValidationConstants.task.descriptionMaxLength))
    .max(ValidationConstants.metadata.maxNotes)
    .optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
