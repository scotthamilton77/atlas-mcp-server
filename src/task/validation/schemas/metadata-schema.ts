import { z } from 'zod';

/**
 * Task metadata schema (user-defined fields only)
 */
export const taskMetadataSchema = z.object({
    priority: z.enum(['low', 'medium', 'high']).optional(),
    tags: z.array(z.string().max(100)).max(100).optional(),
    reasoning: z.string().max(2000).optional(),
    toolsUsed: z.array(z.string().max(100)).max(100).optional(),
    resourcesAccessed: z.array(z.string().max(100)).max(100).optional(),
    contextUsed: z.array(z.string().max(1000)).max(100).optional(),
    version: z.number().optional(),
    statusUpdatedAt: z.number().optional(),
    previousStatus: z.string().optional(),
    blockedBy: z.string().optional(),
    blockReason: z.string().optional(),
    blockTimestamp: z.number().optional(),
    unblockTimestamp: z.number().optional()
}).passthrough();

export type TaskMetadata = z.infer<typeof taskMetadataSchema>;
