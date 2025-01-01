/**
 * Path validation schemas using Zod
 */
import { z } from 'zod';
import { VALIDATION_CONSTRAINTS } from '../../../types/task-core.js';

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
 * Path segment validation schema
 */
export const pathSegmentSchema = z
  .string()
  .max(VALIDATION_CONSTRAINTS.MAX_SEGMENT_LENGTH)
  .regex(VALIDATION_CONSTRAINTS.PATH_SEGMENT_PATTERN);

/**
 * Project path validation schema
 */
export const projectPathSchema = pathSegmentSchema.describe('Project path segment');

/**
 * Optional path validation schema
 */
export const optionalPathSchema = pathValidationSchema.optional();

/**
 * Array of paths validation schema
 */
export const pathArraySchema = z.array(pathValidationSchema);
