import { z } from 'zod';
import { ResourceResponse } from '../../../types/mcp.js';
import { ProjectLink } from '../../../neo4j/projectService.js';
import { normalizeEntityId } from '../../../utils/idGenerator.js';

/**
 * Schema for validating project ID from URI parameters
 */
export const ProjectLinksParamsSchema = z.object({
  projectId: z.string()
    .min(1)
    .regex(/^(?:PROJ|proj)_[A-Z0-9]{6}$/i)
    .transform(normalizeEntityId)
    .describe('The unique identifier of the project to fetch links for. Must be a valid project ID prefixed with "PROJ_" followed by 6 alphanumeric characters.')
}).describe('URI parameters for accessing project links');

export type ProjectLinksParams = z.infer<typeof ProjectLinksParamsSchema>;

/**
 * Schema for validating query parameters
 */
export const ProjectLinksQuerySchema = z.object({
  category: z.string()
    .optional()
    .describe('Optional category to filter links by'),
  search: z.string()
    .optional()
    .describe('Optional search term to filter links by title or description'),
  sortBy: z.enum(['title', 'createdAt', 'updatedAt'])
    .optional()
    .default('createdAt')
    .describe('Field to sort links by'),
  sortOrder: z.enum(['asc', 'desc'])
    .optional()
    .default('desc')
    .describe('Sort direction (ascending or descending)'),
  limit: z.number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(50)
    .describe('Maximum number of links to return (1-100, default 50)')
}).describe('Query parameters for filtering and sorting project links');

export type ProjectLinksQuery = z.infer<typeof ProjectLinksQuerySchema>;

/**
 * Response type for the project links resource
 */
export interface ProjectLinksResourceResponse extends ResourceResponse {
  contents: [{
    uri: string;                   // URI identifying this resource
    text: string;                  // JSON string of ProjectLinksResourceData
    mimeType: "application/json";  // Always JSON for this resource
  }];
}

/**
 * Data structure for project links
 */
export interface ProjectLinksResourceData {
  links: {
    items: ProjectLink[];          // Array of links matching the query
    total: number;                 // Total number of links (before filtering)
    filtered: number;              // Number of links after filtering
  };
  metadata: {
    projectId: string;            // ID of the project these links belong to
    categories?: string[];        // Array of all categories used in the project's links
    domains?: string[];          // Array of unique domains from all links
    oldestLink?: string;         // ISO timestamp of the oldest link
    newestLink?: string;         // ISO timestamp of the newest link
  };
  query?: {                       // Query parameters used (if any)
    category?: string;           // Category filter applied
    search?: string;             // Search term applied
    sortBy: string;              // Sort field used
    sortOrder: string;           // Sort direction used
    limit: number;               // Limit used
  };
  fetchedAt: string;              // ISO timestamp of when the data was fetched
}

/**
 * Template variables for the project links URI
 */
export interface ProjectLinksTemplateVars {
  projectId: string;              // Project ID from the URI template
}