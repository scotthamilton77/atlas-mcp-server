/**
 * Core ID validation schemas using Zod
 */

import { z } from 'zod';
import { ID_CONSTANTS } from '../../../utils/id-generator.js';
import { ValidationConstants } from '../constants.js';

// Legacy UUID pattern for backward compatibility
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Base ID schema for reuse across different entity types
 */
export const baseIdSchema = z
  .string()
  .regex(
    ID_CONSTANTS.PATTERN,
    `ID must be exactly ${ID_CONSTANTS.LENGTH} characters long and contain only alphanumeric characters [${ID_CONSTANTS.ALPHABET}]. Example: "xK7cPq2Z"`
  );

/**
 * Helper function to validate ID format
 */
export function validateId(id: string, context: string = 'ID'): ValidationResult<string> {
  if (!ID_CONSTANTS.PATTERN.test(id)) {
    return {
      success: false,
      errors: [
        `Invalid ${context}: Must be exactly ${ID_CONSTANTS.LENGTH} characters long and contain only alphanumeric characters [${ID_CONSTANTS.ALPHABET}]. ` +
          `Received: "${id}". Example valid ID: "xK7cPq2Z"`,
      ],
    };
  }
  return {
    success: true,
    data: id,
  };
}

/**
 * Transitional schema that accepts both short IDs and UUIDs
 */
export const transitionalIdSchema = z
  .string()
  .refine(
    val => ID_CONSTANTS.PATTERN.test(val) || UUID_PATTERN.test(val),
    `ID must be either ${ID_CONSTANTS.LENGTH} characters long containing only [${ID_CONSTANTS.ALPHABET}] or a valid UUID`
  );

// Entity-specific ID schemas with descriptive error messages
export const taskIdSchema = baseIdSchema.describe('Task ID');
export const sessionIdSchema = transitionalIdSchema.describe('Session ID');
export const taskListIdSchema = baseIdSchema.describe('Task List ID');

// Array of IDs schema for dependencies, subtasks, etc.
export const idArraySchema = z.array(baseIdSchema).max(ValidationConstants.metadata.maxArrayItems);

// Optional ID schema for nullable fields
export const optionalIdSchema = baseIdSchema.optional();

// Reference schemas for entities
export const taskReferenceSchema = z.object({
  id: taskIdSchema,
  parentId: optionalIdSchema,
  dependencies: idArraySchema.default([]),
  subtasks: idArraySchema.default([]),
});

export const sessionReferenceSchema = z.object({
  id: sessionIdSchema,
  activeTaskListId: optionalIdSchema,
  taskListIds: idArraySchema.default([]),
});

// Export types for use in other modules
export type TaskReference = z.infer<typeof taskReferenceSchema>;
export type SessionReference = z.infer<typeof sessionReferenceSchema>;
export type ValidatedId = z.infer<typeof baseIdSchema>;

// Import ValidationResult type
import type { ValidationResult } from '../constants.js';
