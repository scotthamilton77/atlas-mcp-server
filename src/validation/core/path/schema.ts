import { z } from 'zod';
import { ValidationConstants, type ValidationResult } from '../constants.js';

/**
 * Core path validation schema with comprehensive validation rules
 */
export const pathSchema = z
  .string()
  .min(1, 'Path cannot be empty')
  .max(
    ValidationConstants.path.maxLength,
    `Path cannot exceed ${ValidationConstants.path.maxLength} characters`
  )
  .regex(ValidationConstants.path.patterns.allowed, 'Path contains invalid characters')
  .refine(path => !path.includes('..'), 'Path cannot contain parent directory traversal (..)')
  .refine(path => {
    const segments = path.split('/').filter(Boolean);
    return segments.length <= ValidationConstants.path.maxDepth;
  }, `Path depth cannot exceed ${ValidationConstants.path.maxDepth} levels`)
  .refine(path => {
    const segments = path.split('/').filter(Boolean);
    return segments.every(
      segment =>
        segment.length <= ValidationConstants.path.maxSegmentLength &&
        ValidationConstants.path.patterns.segment.test(segment)
    );
  }, 'Each path segment must start with a letter and contain only letters, numbers, dash, or underscore')
  .transform(path => {
    // Normalize path
    return path
      .replace(/\\/g, '/') // Convert backslashes to forward slashes
      .replace(/\/+/g, '/') // Remove duplicate slashes
      .replace(/^\/+|\/+$/g, ''); // Remove leading/trailing slashes
  });

/**
 * Validate a task path with its parent path
 */
export function validateTaskPath(path: string, parentPath?: string): ValidationResult<string> {
  try {
    // First validate the path itself
    const pathResult = pathSchema.safeParse(path);
    if (!pathResult.success) {
      return {
        success: false,
        errors: pathResult.error.errors.map(e => e.message),
      };
    }

    // If no parent path, we're done
    if (!parentPath) {
      return {
        success: true,
        data: pathResult.data,
      };
    }

    // Validate parent path
    const parentResult = pathSchema.safeParse(parentPath);
    if (!parentResult.success) {
      return {
        success: false,
        errors: [
          `Invalid parent path: ${parentResult.error.errors.map(e => e.message).join(', ')}`,
        ],
      };
    }

    const sanitizedPath = pathResult.data;
    const sanitizedParent = parentResult.data;

    // Ensure task is actually a child of the parent
    if (!sanitizedPath.startsWith(`${sanitizedParent}/`)) {
      return {
        success: false,
        errors: [`Task path ${sanitizedPath} is not a child of parent path ${sanitizedParent}`],
      };
    }

    // Ensure only one level of nesting from parent
    const pathDepth = sanitizedPath.split('/').length;
    const parentDepth = sanitizedParent.split('/').length;
    if (pathDepth !== parentDepth + 1) {
      return {
        success: false,
        errors: [
          `Task must be direct child of parent. Path ${sanitizedPath} is nested too deeply under ${sanitizedParent}`,
        ],
      };
    }

    return {
      success: true,
      data: sanitizedPath,
    };
  } catch (error) {
    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Unknown validation error'],
    };
  }
}

/**
 * Validate a project name (first path segment)
 */
export function validateProjectName(name: string): ValidationResult<string> {
  if (!name) {
    return {
      success: false,
      errors: ['Project name cannot be empty'],
    };
  }

  if (name.length > ValidationConstants.path.maxSegmentLength) {
    return {
      success: false,
      errors: [
        `Project name cannot exceed ${ValidationConstants.path.maxSegmentLength} characters`,
      ],
    };
  }

  if (!ValidationConstants.path.patterns.segment.test(name)) {
    return {
      success: false,
      errors: [
        'Project name must start with a letter and contain only letters, numbers, dash, or underscore',
      ],
    };
  }

  return {
    success: true,
    data: name,
  };
}

// Export a type for the validated path
export type ValidatedPath = z.infer<typeof pathSchema>;
