import { z } from 'zod';

/**
 * Enhanced task metadata schema with strict validation
 */

// Define sub-schemas for better organization
const timeSchema = z.number().int().min(0).optional();
const statusSchema = z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'CANCELLED']);

// Technical requirements schema
const technicalRequirementsSchema = z
  .object({
    language: z.string().optional(),
    framework: z.string().optional(),
    dependencies: z.array(z.string()).max(50).optional(),
    environment: z.string().optional(),
    performance: z
      .object({
        memory: z.string().optional(),
        cpu: z.string().optional(),
        storage: z.string().optional(),
      })
      .optional(),
  })
  .optional();

// Acceptance criteria schema
const acceptanceCriteriaSchema = z
  .object({
    criteria: z.array(z.string().max(500)).max(20),
    testCases: z.array(z.string().max(500)).max(20).optional(),
    reviewers: z.array(z.string()).max(10).optional(),
  })
  .optional();

// Progress tracking schema
const progressTrackingSchema = z
  .object({
    percentage: z.number().min(0).max(100).optional(),
    milestones: z.array(z.string()).max(20).optional(),
    lastUpdated: timeSchema,
    estimatedCompletion: timeSchema,
  })
  .optional();

// Resource tracking schema
const resourceTrackingSchema = z
  .object({
    toolsUsed: z.array(z.string().max(100)).max(100).optional(),
    resourcesAccessed: z.array(z.string().max(100)).max(100).optional(),
    contextUsed: z.array(z.string().max(1000)).max(100).optional(),
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
    previousVersions: z.array(z.number()).max(10).optional(),
  })
  .optional();

/**
 * Main metadata schema with comprehensive validation
 */
export const taskMetadataSchema = z
  .object({
    // Core metadata
    priority: z.enum(['low', 'medium', 'high']).optional(),
    tags: z.array(z.string().max(100)).max(100).optional(),
    reasoning: z.string().max(2000).optional(),

    // Status tracking
    status: statusSchema.optional(),
    statusUpdatedAt: timeSchema,
    previousStatus: statusSchema.optional(),

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

    // Custom fields (with validation)
    customFields: z.record(z.string(), z.unknown()).optional(),
  })
  .strict() // Prevent additional properties
  .refine(
    data => {
      // Custom validation logic
      if (data.blockInfo?.blockedBy && !data.blockInfo.blockReason) {
        return false;
      }
      return true;
    },
    {
      message: 'Block reason is required when task is blocked',
    }
  );

export type TaskMetadata = z.infer<typeof taskMetadataSchema>;

// Export sub-types for specific use cases
export type TechnicalRequirements = z.infer<typeof technicalRequirementsSchema>;
export type AcceptanceCriteria = z.infer<typeof acceptanceCriteriaSchema>;
export type ProgressTracking = z.infer<typeof progressTrackingSchema>;
export type ResourceTracking = z.infer<typeof resourceTrackingSchema>;
export type BlockInfo = z.infer<typeof blockInfoSchema>;
export type VersionControl = z.infer<typeof versionControlSchema>;
