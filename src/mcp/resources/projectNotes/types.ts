import { z } from 'zod';
import { ResourceResponse } from '../../../types/mcp.js';
import { ProjectNote } from '../../../neo4j/projectService.js';
import { normalizeEntityId } from '../../../utils/idGenerator.js';

/**
 * Schema for validating project ID from URI parameters
 */
export const ProjectNotesParamsSchema = z.object({
  projectId: z.string()
    .min(1)
    .regex(/^(?:PROJ|proj)_[A-Z0-9]{6}$/i)
    .transform(normalizeEntityId)
    .describe('The unique identifier of the project to fetch notes for. Must be a valid project ID prefixed with "PROJ_" followed by 6 alphanumeric characters.')
}).describe('URI parameters for accessing project notes');

export type ProjectNotesParams = z.infer<typeof ProjectNotesParamsSchema>;

/**
 * Schema for validating query parameters
 */
export const ProjectNotesQuerySchema = z.object({
  tag: z.string()
    .optional()
    .describe('Optional tag to filter notes by'),
  since: z.string()
    .datetime()
    .optional()
    .describe('Optional ISO datetime to fetch notes created after this time'),
  limit: z.number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(50)
    .describe('Maximum number of notes to return (1-100, default 50)'),
  sortBy: z.enum(['createdAt', 'updatedAt'])
    .optional()
    .default('createdAt')
    .describe('Field to sort notes by'),
  sortOrder: z.enum(['asc', 'desc'])
    .optional()
    .default('desc')
    .describe('Sort direction (ascending or descending)')
}).describe('Query parameters for filtering and sorting project notes');

export type ProjectNotesQuery = z.infer<typeof ProjectNotesQuerySchema>;

/**
 * Response type for the project notes resource
 */
export interface ProjectNotesResourceResponse extends ResourceResponse {
  contents: [{
    uri: string;                   // URI identifying this resource
    text: string;                  // JSON string of ProjectNotesResourceData
    mimeType: "application/json";  // Always JSON for this resource
  }];
}

/**
 * Data structure for project notes
 */
export interface ProjectNotesResourceData {
  notes: {
    items: ProjectNote[];          // Array of notes matching the query
    total: number;                 // Total number of notes (before filtering)
    filtered: number;              // Number of notes after filtering
  };
  metadata: {
    projectId: string;            // ID of the project these notes belong to
    tags?: string[];              // Array of all tags used in the project's notes
    oldestNote?: string;          // ISO timestamp of the oldest note
    newestNote?: string;          // ISO timestamp of the newest note
  };
  query?: {                       // Query parameters used (if any)
    tag?: string;                 // Tag filter applied
    since?: string;               // Time filter applied
    limit: number;                // Limit used
    sortBy: string;               // Sort field used
    sortOrder: string;            // Sort direction used
  };
  fetchedAt: string;              // ISO timestamp of when the data was fetched
}

/**
 * Template variables for the project notes URI
 */
export interface ProjectNotesTemplateVars {
  projectId: string;              // Project ID from the URI template
}