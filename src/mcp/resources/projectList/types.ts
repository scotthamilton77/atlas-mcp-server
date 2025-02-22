import { z } from 'zod';
import { ResourceResponse } from '../../../types/mcp.js';
import { Project } from '../../../neo4j/projectService.js';

/**
 * Schema for validating project list query parameters
 */
export const ProjectListQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional()
    .describe('Page number for pagination (starts at 1)'),
  limit: z.string().regex(/^\d+$/).transform(Number).optional()
    .describe('Number of items per page (default: 10, max: 100)')
}).describe(
  'Query parameters for paginating the project list.\n' +
  'URI Format: projects://list?page=1&limit=10'
);

export type ProjectListQuery = z.infer<typeof ProjectListQuerySchema>;

/**
 * Response type for the project list resource
 */
export interface ProjectListResponse extends ResourceResponse {
  contents: [{
    uri: string;                   // URI identifying this resource
    text: string;                  // JSON string of ProjectListData
    mimeType: "application/json";  // Always JSON for this resource
  }];
}

/**
 * Data structure for the project list
 */
export interface ProjectListData {
  items: Project[];              // Array of projects matching the query
  total: number;                 // Total number of projects (before pagination)
  page: number;                  // Current page number
  limit: number;                 // Items per page
}