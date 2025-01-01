import { z } from 'zod';
import { TaskStatus } from '../../../types/task-core.js';

/**
 * Enhanced task metadata schema with flexible validation
 */

// Define sub-schemas for better organization
const timeSchema = z.number().int().min(0).optional();

// Array or object schema helper
const arrayOrObjectSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.union([
    z.array(itemSchema),
    z.object({
      items: z.array(itemSchema),
    }),
  ]);

// Technical requirements schema
const technicalRequirementsSchema = z
  .object({
    language: z.string().optional(),
    framework: z.string().optional(),
    dependencies: arrayOrObjectSchema(z.string()).optional(),
    environment: z.string().optional(),
    performance: z
      .object({
        memory: z.string().optional(),
        cpu: z.string().optional(),
        storage: z.string().optional(),
      })
      .optional(),
    requirements: arrayOrObjectSchema(z.string()).optional(),
  })
  .optional();

// Acceptance criteria schema
const acceptanceCriteriaSchema = z
  .union([
    z.array(z.string()),
    z.object({
      items: z.array(z.string()),
      criteria: z.array(z.string().max(500)).max(20).optional(),
      testCases: z.array(z.string().max(500)).max(20).optional(),
      reviewers: z.array(z.string()).max(10).optional(),
    }),
  ])
  .optional();

// Progress tracking schema
const progressTrackingSchema = z
  .object({
    percentage: z.number().min(0).max(100).optional(),
    milestones: arrayOrObjectSchema(z.string()).optional(),
    lastUpdated: timeSchema,
    estimatedCompletion: timeSchema,
  })
  .optional();

// Resource tracking schema
const resourceTrackingSchema = z
  .object({
    toolsUsed: arrayOrObjectSchema(z.string().max(100)).optional(),
    resourcesAccessed: arrayOrObjectSchema(z.string().max(100)).optional(),
    contextUsed: arrayOrObjectSchema(z.string().max(1000)).optional(),
  })
  .optional();

// Block information schema
const blockInfoSchema = z
  .object({
    blockedBy: z.string().optional(),
    blockReason: z.string().max(500).optional(),
    blockTimestamp: timeSchema,
    unblockTimestamp: timeSchema,
    resolution: z.string().max(500).optional(),
  })
  .optional();

// Version control schema
const versionControlSchema = z
  .object({
    version: z.number().optional(),
    branch: z.string().optional(),
    commit: z.string().optional(),
    previousVersions: arrayOrObjectSchema(z.number()).optional(),
  })
  .optional();

// Deliverables schema
const deliverablesSchema = arrayOrObjectSchema(z.string()).optional();

/**
 * Main metadata schema with flexible validation
 */
export const taskMetadataSchema = z
  .object({
    // Core metadata
    priority: z.enum(['low', 'medium', 'high']).optional(),
    tags: arrayOrObjectSchema(z.string().max(100)).optional(),
    reasoning: z.string().max(2000).optional(),

    // Status tracking
    status: z.nativeEnum(TaskStatus).optional(),
    statusUpdatedAt: timeSchema,
    previousStatus: z.nativeEnum(TaskStatus).optional(),

    // Technical details
    technicalRequirements: technicalRequirementsSchema,
    acceptanceCriteria: acceptanceCriteriaSchema,

    // Progress and resources
    progress: progressTrackingSchema,
    resources: resourceTrackingSchema,

    // Block information
    blockInfo: blockInfoSchema,

    // Version control
    versionControl: versionControlSchema,

    // Deliverables
    deliverables: deliverablesSchema,

    // Custom fields (with validation)
    customFields: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough(); // Allow additional properties

export type TaskMetadata = z.infer<typeof taskMetadataSchema>;

// Export sub-types for specific use cases
export type TechnicalRequirements = z.infer<typeof technicalRequirementsSchema>;
export type AcceptanceCriteria = z.infer<typeof acceptanceCriteriaSchema>;
export type ProgressTracking = z.infer<typeof progressTrackingSchema>;
export type ResourceTracking = z.infer<typeof resourceTrackingSchema>;
export type BlockInfo = z.infer<typeof blockInfoSchema>;
export type VersionControl = z.infer<typeof versionControlSchema>;
