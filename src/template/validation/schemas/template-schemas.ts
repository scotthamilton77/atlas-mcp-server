import { z } from 'zod';
import { VALIDATION_CONSTRAINTS } from '../../../types/task-core.js';

/**
 * Template variable validation schema
 */
export const templateVariableSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  type: z.enum(['string', 'number', 'boolean', 'array']),
  required: z.boolean(),
  default: z.unknown().optional(),
});

/**
 * Template reference validation schema
 */
export const templateRefSchema = z.object({
  template: z.string(),
  variables: z.record(z.unknown()),
});

/**
 * Template task metadata schema - more permissive than regular task metadata
 */
export const templateTaskMetadataSchema = z
  .object({})
  .catchall(z.unknown())
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
 * Template task validation schema
 */
export const templateTaskSchema = z.object({
  path: z.string().min(1).max(1000),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  type: z.enum(['TASK', 'MILESTONE']),
  metadata: templateTaskMetadataSchema.optional(),
  dependencies: z.array(z.string()).max(50).optional(),
});

/**
 * Complete template validation schema
 */
export const taskTemplateSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  description: z.string().max(2000),
  version: z.string().min(1).max(50),
  author: z.string().max(100).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  variables: z.array(templateVariableSchema).max(50),
  tasks: z.array(templateTaskSchema).min(1).max(100),
});

/**
 * Template instantiation options validation schema
 */
export const templateInstantiationSchema = z.object({
  templateId: z.string(),
  variables: z.record(z.unknown()),
  parentPath: z.string().optional(),
});

/**
 * Export types for use in other modules
 */
export type TemplateVariable = z.infer<typeof templateVariableSchema>;
export type TemplateRef = z.infer<typeof templateRefSchema>;
export type TemplateTaskMetadata = z.infer<typeof templateTaskMetadataSchema>;
export type TemplateTask = z.infer<typeof templateTaskSchema>;
export type TaskTemplate = z.infer<typeof taskTemplateSchema>;
export type TemplateInstantiationOptions = z.infer<typeof templateInstantiationSchema>;
