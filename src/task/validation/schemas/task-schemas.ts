/**
 * Task validation schemas using Zod
 */
import { z } from 'zod';
import { TaskType } from '../../../types/task-types.js';
import { TaskStatus, VALIDATION_CONSTRAINTS } from '../../../types/task-core.js';
import { pathSchema } from '../../../validation/core/index.js';

/**
 * Note validation schemas
 */
export const noteSchema = z.string().max(VALIDATION_CONSTRAINTS.NOTE_MAX_LENGTH);

export const notesSchema = z.object({
  planningNotes: z.array(noteSchema).max(VALIDATION_CONSTRAINTS.MAX_NOTES_PER_CATEGORY),
  progressNotes: z.array(noteSchema).max(VALIDATION_CONSTRAINTS.MAX_NOTES_PER_CATEGORY),
  completionNotes: z.array(noteSchema).max(VALIDATION_CONSTRAINTS.MAX_NOTES_PER_CATEGORY),
  troubleshootingNotes: z.array(noteSchema).max(VALIDATION_CONSTRAINTS.MAX_NOTES_PER_CATEGORY),
});

/**
 * Technical requirements schema - fully flexible
 */
export const technicalRequirementsSchema = z.record(z.unknown());

/**
 * Progress tracking schema
 */
export const progressSchema = z.object({
  percentage: z.number().min(0).max(100).optional(),
  milestones: z.array(z.string()).optional(),
  lastUpdated: z.number().optional(),
  estimatedCompletion: z.number().optional(),
});

/**
 * Resource tracking schema
 */
export const resourcesSchema = z.object({
  toolsUsed: z.array(z.string()).optional(),
  resourcesAccessed: z.array(z.string()).optional(),
  contextUsed: z.array(z.string()).optional(),
});

/**
 * Block information schema
 */
export const blockInfoSchema = z.object({
  blockedBy: z.string().optional(),
  blockReason: z.string().max(500).optional(),
  blockTimestamp: z.number().optional(),
  unblockTimestamp: z.number().optional(),
  resolution: z.string().max(500).optional(),
});

/**
 * Version control schema
 */
export const versionControlSchema = z.object({
  version: z.number().optional(),
  branch: z.string().optional(),
  commit: z.string().optional(),
  previousVersions: z.array(z.number()).optional(),
});

/**
 * Metadata validation schema - fully flexible with size limit
 */
export const metadataSchema = z.record(z.unknown()).refine(
  data => {
    const size = JSON.stringify(data).length;
    return size <= VALIDATION_CONSTRAINTS.MAX_METADATA_SIZE;
  },
  {
    message: `Metadata size exceeds ${VALIDATION_CONSTRAINTS.MAX_METADATA_SIZE} bytes limit`,
  }
);

/**
 * Status metadata validation schema
 */
export const statusMetadataSchema = z.object({
  // IN_PROGRESS
  assignee: z.string().optional(),
  progress_indicators: z.array(z.string()).optional(),

  // COMPLETED
  completedBy: z.string().optional(),
  verificationStatus: z.enum(['passed', 'failed']).optional(),
  completionChecks: z.array(z.string()).optional(),

  // FAILED
  errorType: z.string().optional(),
  errorDetails: z.string().optional(),
  recoveryAttempts: z.number().min(0).optional(),

  // BLOCKED
  blockedBy: z.array(z.string()).optional(),
  blockedReason: z.string().optional(),
});

/**
 * Task creation schema
 */
export const createTaskSchema = z
  .object({
    path: pathSchema,
    name: z.string().min(1).max(VALIDATION_CONSTRAINTS.NAME_MAX_LENGTH),
    type: z.nativeEnum(TaskType),
    description: z.string().max(VALIDATION_CONSTRAINTS.DESCRIPTION_MAX_LENGTH).optional(),
    notes: z
      .never({
        invalid_type_error:
          "Generic 'notes' field is not supported. Please use specific note categories: planningNotes, progressNotes, completionNotes, or troubleshootingNotes",
      })
      .optional(),
    reasoning: z.string().max(VALIDATION_CONSTRAINTS.REASONING_MAX_LENGTH).optional(),
    parentPath: pathSchema.optional(),
    dependencies: z.array(pathSchema).max(VALIDATION_CONSTRAINTS.MAX_DEPENDENCIES).optional(),
    metadata: metadataSchema.optional(),
    statusMetadata: statusMetadataSchema.optional(),
    planningNotes: z
      .array(noteSchema)
      .max(VALIDATION_CONSTRAINTS.MAX_NOTES_PER_CATEGORY)
      .optional(),
    progressNotes: z
      .array(noteSchema)
      .max(VALIDATION_CONSTRAINTS.MAX_NOTES_PER_CATEGORY)
      .optional(),
    completionNotes: z
      .array(noteSchema)
      .max(VALIDATION_CONSTRAINTS.MAX_NOTES_PER_CATEGORY)
      .optional(),
    troubleshootingNotes: z
      .array(noteSchema)
      .max(VALIDATION_CONSTRAINTS.MAX_NOTES_PER_CATEGORY)
      .optional(),
  })
  .strict();

/**
 * Task update schema
 */
export const updateTaskSchema = z
  .object({
    name: z.string().min(1).max(VALIDATION_CONSTRAINTS.NAME_MAX_LENGTH).optional(),
    type: z.nativeEnum(TaskType).optional(),
    status: z.nativeEnum(TaskStatus).optional(),
    description: z.string().max(VALIDATION_CONSTRAINTS.DESCRIPTION_MAX_LENGTH).optional(),
    notes: z
      .never({
        invalid_type_error:
          "Generic 'notes' field is not supported. Please use specific note categories: planningNotes, progressNotes, completionNotes, or troubleshootingNotes",
      })
      .optional(),
    reasoning: z.string().max(VALIDATION_CONSTRAINTS.REASONING_MAX_LENGTH).optional(),
    parentPath: pathSchema.optional(),
    dependencies: z.array(pathSchema).max(VALIDATION_CONSTRAINTS.MAX_DEPENDENCIES).optional(),
    metadata: metadataSchema.optional(),
    statusMetadata: statusMetadataSchema.optional(),
    planningNotes: z
      .array(noteSchema)
      .max(VALIDATION_CONSTRAINTS.MAX_NOTES_PER_CATEGORY)
      .optional(),
    progressNotes: z
      .array(noteSchema)
      .max(VALIDATION_CONSTRAINTS.MAX_NOTES_PER_CATEGORY)
      .optional(),
    completionNotes: z
      .array(noteSchema)
      .max(VALIDATION_CONSTRAINTS.MAX_NOTES_PER_CATEGORY)
      .optional(),
    troubleshootingNotes: z
      .array(noteSchema)
      .max(VALIDATION_CONSTRAINTS.MAX_NOTES_PER_CATEGORY)
      .optional(),
  })
  .strict();

/**
 * Task response schema
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

export type CreateTaskSchema = z.infer<typeof createTaskSchema>;
export type UpdateTaskSchema = z.infer<typeof updateTaskSchema>;
export type TaskResponseSchema = z.infer<typeof taskResponseSchema>;
export type TaskMetadataSchema = z.infer<typeof metadataSchema>;
