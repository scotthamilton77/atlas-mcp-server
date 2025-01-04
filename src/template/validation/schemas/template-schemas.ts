import { z } from 'zod';
import { VALIDATION_CONSTRAINTS } from '../../../types/task-core.js';
import { PathUtils } from '../../../utils/path-utils.js';

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
 * Template path validation - allows variables in paths
 */
const isValidTemplatePath = (path: string): boolean => {
  // Allow template variables ${name}
  const templateVarPattern = /\${[a-zA-Z][a-zA-Z0-9_]*}/g;

  // Replace template variables with placeholder to check format
  const normalizedPath = path.replace(templateVarPattern, 'x');

  // Check basic path structure
  if (!normalizedPath.match(/^[a-zA-Z0-9x][a-zA-Z0-9x\-_/]*$/)) {
    return false;
  }

  // Check path depth
  if (normalizedPath.split('/').length > VALIDATION_CONSTRAINTS.MAX_PATH_DEPTH) {
    return false;
  }

  // Check segment length, accounting for variables
  const segments = path.split('/');
  return !segments.some(segment => {
    // Replace variables with reasonable length placeholder
    const normalizedSegment = segment.replace(templateVarPattern, 'placeholder');
    return normalizedSegment.length > VALIDATION_CONSTRAINTS.MAX_SEGMENT_LENGTH;
  });
};

/**
 * Template task validation schema with enhanced path validation
 */
export const templateTaskSchema = z.object({
  path: z.string().min(1).max(1000).refine(isValidTemplatePath, {
    message:
      'Invalid template path format. Must use forward slashes, valid characters, template variables, and respect length limits.',
  }),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  type: z.enum(['TASK', 'MILESTONE']),
  metadata: templateTaskMetadataSchema.optional(),
  dependencies: z.array(z.string()).max(50).optional(),
});

/**
 * Complete template validation schema with hierarchy validation
 */
export const taskTemplateSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  description: z.string().max(2000),
  version: z.string().min(1).max(50),
  author: z.string().max(100).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  variables: z.array(templateVariableSchema).max(50),
  tasks: z
    .array(templateTaskSchema)
    .min(1)
    .max(100)
    .refine(
      tasks => {
        // Build set of all task paths
        const paths = new Set(tasks.map(t => t.path));

        // For template validation, we only check basic path uniqueness
        // Full path validation happens after variable interpolation
        return paths.size === tasks.length;
      },
      {
        message: 'Task paths must be unique within the template.',
      }
    )
    .refine(
      tasks => {
        // Check dependencies exist
        for (const task of tasks) {
          if (task.dependencies) {
            for (const dep of task.dependencies) {
              if (!tasks.some(t => t.path === dep)) {
                return false;
              }
            }
          }
        }
        return true;
      },
      {
        message:
          'Invalid dependencies. All dependencies must reference existing tasks within the template.',
      }
    )
    .refine(
      tasks => {
        // Check for circular dependencies
        const visited = new Set<string>();
        const recursionStack = new Set<string>();

        const hasCycle = (path: string): boolean => {
          if (recursionStack.has(path)) {
            return true;
          }
          if (visited.has(path)) {
            return false;
          }

          visited.add(path);
          recursionStack.add(path);

          const task = tasks.find(t => t.path === path);
          if (task?.dependencies) {
            for (const dep of task.dependencies) {
              if (hasCycle(dep)) {
                return true;
              }
            }
          }

          recursionStack.delete(path);
          return false;
        };

        for (const task of tasks) {
          if (hasCycle(task.path)) {
            return false;
          }
        }

        return true;
      },
      {
        message: 'Invalid dependencies. Circular dependencies detected.',
      }
    ),
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
