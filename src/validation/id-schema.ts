/**
 * Shared ID validation schemas using the new short ID format
 */

import { z } from 'zod';
import { ID_CONSTANTS } from '../utils/id-generator.js';

// Base ID schema for reuse across different entity types
export const baseIdSchema = z.string().regex(
    ID_CONSTANTS.PATTERN,
    `ID must be ${ID_CONSTANTS.LENGTH} characters long and contain only [${ID_CONSTANTS.ALPHABET}]`
);

// Specific entity ID schemas with custom error messages
export const taskIdSchema = baseIdSchema.describe('Task ID');
export const sessionIdSchema = baseIdSchema.describe('Session ID');
export const taskListIdSchema = baseIdSchema.describe('Task List ID');

// Array of IDs schema for dependencies, subtasks, etc.
export const idArraySchema = z.array(baseIdSchema);

// Optional ID schema for nullable fields
export const optionalIdSchema = baseIdSchema.optional();

// Example usage in a task schema:
export const taskReferenceSchema = z.object({
    id: taskIdSchema,
    parentId: optionalIdSchema,
    dependencies: idArraySchema.default([]),
    subtasks: idArraySchema.default([])
});

// Example usage in a session schema:
export const sessionReferenceSchema = z.object({
    id: sessionIdSchema,
    activeTaskListId: optionalIdSchema,
    taskListIds: idArraySchema.default([])
});

// Export types for use in other modules
export type TaskReference = z.infer<typeof taskReferenceSchema>;
export type SessionReference = z.infer<typeof sessionReferenceSchema>;
