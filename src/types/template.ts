import { z } from 'zod';

/**
 * Represents a variable in a task template
 */
export interface TemplateVariable {
  name: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'array';
  required: boolean;
  default?: unknown;
}

/**
 * Template reference in task metadata
 */
export interface TemplateRef {
  template: string;
  variables: Record<string, unknown>;
}

/**
 * Task metadata in template
 */
export interface TemplateTaskMetadata {
  [key: string]: unknown;
  templateRef?: TemplateRef;
}

/**
 * Represents a task definition in a template
 */
export interface TemplateTask {
  path: string;
  title: string;
  description?: string;
  type: 'TASK' | 'MILESTONE';
  metadata?: TemplateTaskMetadata;
  dependencies?: string[];
}

/**
 * Template metadata
 */
export interface TemplateMetadata {
  created?: string;
  version?: string;
  [key: string]: unknown;
}

/**
 * Represents a complete task template
 */
export interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  tags?: string[];
  variables: TemplateVariable[];
  tasks: TemplateTask[];
  metadata?: TemplateMetadata;
}

/**
 * Type guard for template object
 */
export function isTemplateObject(obj: unknown): obj is Record<string, unknown> {
  return typeof obj === 'object' && obj !== null;
}

/**
 * Summary information about a template
 */
export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  tags?: string[];
  variableCount: number;
  taskCount: number;
}

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
 * Metadata validation schema
 */
export const metadataSchema = z.object({}).catchall(z.unknown());

/**
 * Template task validation schema
 */
export const templateTaskSchema = z.object({
  path: z.string().min(1).max(1000),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  type: z.enum(['TASK', 'MILESTONE']),
  metadata: metadataSchema.optional(),
  dependencies: z.array(z.string()).max(50).optional(),
});

/**
 * Template metadata validation schema
 */
export const templateMetadataSchema = z
  .object({
    created: z.string().optional(),
    version: z.string().optional(),
  })
  .catchall(z.unknown());

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
  metadata: templateMetadataSchema.optional(),
});

/**
 * Template instantiation options
 */
export interface TemplateInstantiationOptions {
  templateId: string;
  variables: Record<string, unknown>;
  parentPath?: string;
}
