import { z } from 'zod';
import { ResourceResponse } from '../../../types/mcp.js';
import { ProjectDependency } from '../../../neo4j/projectService.js';
import { normalizeEntityId } from '../../../utils/idGenerator.js';

/**
 * Schema for validating project ID from URI parameters
 */
export const ProjectDependenciesParamsSchema = z.object({
  projectId: z.string()
    .min(1)
    .regex(/^(?:PROJ|proj)_[A-Z0-9]{6}$/i)
    .transform(normalizeEntityId)
    .describe('The unique identifier of the project to fetch dependencies for. Must be a valid project ID prefixed with "PROJ_" followed by 6 alphanumeric characters.')
}).describe('URI parameters for accessing project dependencies');

export type ProjectDependenciesParams = z.infer<typeof ProjectDependenciesParamsSchema>;

/**
 * Schema for validating query parameters
 */
export const ProjectDependenciesQuerySchema = z.object({
  type: z.enum(['requires', 'extends', 'implements', 'references'])
    .optional()
    .describe('Optional dependency type to filter by'),
  direction: z.enum(['outbound', 'inbound', 'both'])
    .optional()
    .default('both')
    .describe('Filter dependencies by direction (outbound=dependencies, inbound=dependents)'),
  depth: z.number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .default(1)
    .describe('Maximum depth to traverse dependencies (1-5, default 1)'),
  sortBy: z.enum(['type', 'createdAt', 'updatedAt'])
    .optional()
    .default('createdAt')
    .describe('Field to sort dependencies by'),
  sortOrder: z.enum(['asc', 'desc'])
    .optional()
    .default('desc')
    .describe('Sort direction (ascending or descending)')
}).describe('Query parameters for filtering and sorting project dependencies');

export type ProjectDependenciesQuery = z.infer<typeof ProjectDependenciesQuerySchema>;

/**
 * Response type for the project dependencies resource
 */
export interface ProjectDependenciesResourceResponse extends ResourceResponse {
  contents: [{
    uri: string;                   // URI identifying this resource
    text: string;                  // JSON string of ProjectDependenciesResourceData
    mimeType: "application/json";  // Always JSON for this resource
  }];
}

/**
 * Data structure for project dependencies
 */
export interface ProjectDependenciesResourceData {
  dependencies: {
    items: ProjectDependency[];    // Outbound dependencies (projects this project depends on)
    total: number;                 // Total number of outbound dependencies
    byType?: Record<string, number>; // Count of dependencies by type
  };
  dependents: {
    items: ProjectDependency[];    // Inbound dependencies (projects that depend on this project)
    total: number;                 // Total number of inbound dependencies
    byType?: Record<string, number>; // Count of dependents by type
  };
  metadata: {
    projectId: string;            // ID of the project
    types?: string[];            // Array of all dependency types used
    cyclesDetected?: boolean;    // Whether any dependency cycles were detected
    maxDepth: number;            // Maximum depth traversed
    oldestDependency?: string;   // ISO timestamp of the oldest dependency
    newestDependency?: string;   // ISO timestamp of the newest dependency
  };
  query?: {                      // Query parameters used (if any)
    type?: string;              // Type filter applied
    direction: string;          // Direction filter applied
    depth: number;              // Depth used
    sortBy: string;             // Sort field used
    sortOrder: string;          // Sort direction used
  };
  fetchedAt: string;             // ISO timestamp of when the data was fetched
}

/**
 * Template variables for the project dependencies URI
 */
export interface ProjectDependenciesTemplateVars {
  projectId: string;             // Project ID from the URI template
}