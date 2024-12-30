/**
 * Task validation schemas using Zod
 */
import { z } from 'zod';
import { TaskType } from '../types/task-types.js';
import { TaskStatus, VALIDATION_CONSTRAINTS } from '../types/task-core.js';

/**
 * Path validation schema
 */
export const pathValidationSchema = z
  .string()
  .max(VALIDATION_CONSTRAINTS.PATH_MAX_LENGTH)
  .regex(VALIDATION_CONSTRAINTS.PATH_ALLOWED_CHARS)
  .refine(
    path => {
      const segments = path.split('/');
      return (
        segments.length <= VALIDATION_CONSTRAINTS.MAX_PATH_DEPTH &&
        segments.every(
          segment =>
            segment.length <= VALIDATION_CONSTRAINTS.MAX_SEGMENT_LENGTH &&
            VALIDATION_CONSTRAINTS.PATH_SEGMENT_PATTERN.test(segment)
        )
      );
    },
    {
      message: 'Invalid path format or depth',
    }
  );

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
 * Metadata validation schemas
 */
export const metadataSchema = z
  .object({
    // Classification
    category: z.string().optional(),
    component: z.string().optional(),
    platform: z.string().optional(),
    scope: z.string().optional(),
    tags: z.array(z.string()).max(VALIDATION_CONSTRAINTS.MAX_TAGS).optional(),

    // Priority
    priority: z.enum(['low', 'medium', 'high']).optional(),
    criticality: z.string().optional(),
    impact: z.string().optional(),

    // Technical
    language: z.string().optional(),
    framework: z.string().optional(),
    tools: z.array(z.string()).max(VALIDATION_CONSTRAINTS.MAX_ARRAY_ITEMS).optional(),
    requirements: z.array(z.string()).max(VALIDATION_CONSTRAINTS.MAX_ARRAY_ITEMS).optional(),

    // Quality
    testingRequirements: z.array(z.string()).max(VALIDATION_CONSTRAINTS.MAX_ARRAY_ITEMS).optional(),
    qualityMetrics: z
      .object({
        coverage: z.number().min(0).max(100).optional(),
        complexity: z.number().min(0).optional(),
        performance: z.array(z.string()).max(VALIDATION_CONSTRAINTS.MAX_ARRAY_ITEMS).optional(),
      })
      .optional(),
  })
  .refine(
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
export const createTaskSchema = z.object({
  path: pathValidationSchema,
  name: z.string().min(1).max(VALIDATION_CONSTRAINTS.NAME_MAX_LENGTH),
  type: z.nativeEnum(TaskType),
  description: z.string().max(VALIDATION_CONSTRAINTS.DESCRIPTION_MAX_LENGTH).optional(),
  reasoning: z.string().max(VALIDATION_CONSTRAINTS.REASONING_MAX_LENGTH).optional(),
  parentPath: pathValidationSchema.optional(),

  notes: z
    .object({
      planning: z.array(noteSchema).max(VALIDATION_CONSTRAINTS.MAX_NOTES_PER_CATEGORY).optional(),
      progress: z.array(noteSchema).max(VALIDATION_CONSTRAINTS.MAX_NOTES_PER_CATEGORY).optional(),
      completion: z.array(noteSchema).max(VALIDATION_CONSTRAINTS.MAX_NOTES_PER_CATEGORY).optional(),
      troubleshooting: z
        .array(noteSchema)
        .max(VALIDATION_CONSTRAINTS.MAX_NOTES_PER_CATEGORY)
        .optional(),
    })
    .optional(),

  dependencies: z
    .array(pathValidationSchema)
    .max(VALIDATION_CONSTRAINTS.MAX_DEPENDENCIES)
    .optional(),
  metadata: metadataSchema.optional(),
});

/**
 * Task update schema
 */
export const updateTaskSchema = z.object({
  name: z.string().min(1).max(VALIDATION_CONSTRAINTS.NAME_MAX_LENGTH).optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  statusMetadata: statusMetadataSchema.optional(),
  description: z.string().max(VALIDATION_CONSTRAINTS.DESCRIPTION_MAX_LENGTH).optional(),
  reasoning: z.string().max(VALIDATION_CONSTRAINTS.REASONING_MAX_LENGTH).optional(),

  notes: z
    .object({
      planning: z.array(noteSchema).max(VALIDATION_CONSTRAINTS.MAX_NOTES_PER_CATEGORY).optional(),
      progress: z.array(noteSchema).max(VALIDATION_CONSTRAINTS.MAX_NOTES_PER_CATEGORY).optional(),
      completion: z.array(noteSchema).max(VALIDATION_CONSTRAINTS.MAX_NOTES_PER_CATEGORY).optional(),
      troubleshooting: z
        .array(noteSchema)
        .max(VALIDATION_CONSTRAINTS.MAX_NOTES_PER_CATEGORY)
        .optional(),
    })
    .optional(),

  dependencies: z
    .array(pathValidationSchema)
    .max(VALIDATION_CONSTRAINTS.MAX_DEPENDENCIES)
    .optional(),
  metadata: z
    .object({
      // Classification
      category: z.string().optional(),
      component: z.string().optional(),
      platform: z.string().optional(),
      scope: z.string().optional(),
      tags: z.array(z.string()).max(VALIDATION_CONSTRAINTS.MAX_TAGS).optional(),

      // Priority
      priority: z.enum(['low', 'medium', 'high']).optional(),
      criticality: z.string().optional(),
      impact: z.string().optional(),

      // Technical
      language: z.string().optional(),
      framework: z.string().optional(),
      tools: z.array(z.string()).max(VALIDATION_CONSTRAINTS.MAX_ARRAY_ITEMS).optional(),
      requirements: z.array(z.string()).max(VALIDATION_CONSTRAINTS.MAX_ARRAY_ITEMS).optional(),

      // Quality
      testingRequirements: z
        .array(z.string())
        .max(VALIDATION_CONSTRAINTS.MAX_ARRAY_ITEMS)
        .optional(),
      qualityMetrics: z
        .object({
          coverage: z.number().min(0).max(100).optional(),
          complexity: z.number().min(0).optional(),
          performance: z.array(z.string()).max(VALIDATION_CONSTRAINTS.MAX_ARRAY_ITEMS).optional(),
        })
        .optional(),
    })
    .optional()
    .refine(
      data => {
        if (!data) return true;
        const size = JSON.stringify(data).length;
        return size <= VALIDATION_CONSTRAINTS.MAX_METADATA_SIZE;
      },
      {
        message: `Metadata size exceeds ${VALIDATION_CONSTRAINTS.MAX_METADATA_SIZE} bytes limit`,
      }
    ),
});

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
