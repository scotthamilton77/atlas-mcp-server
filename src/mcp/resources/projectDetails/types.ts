import { z } from 'zod';
import { ResourceResponse } from '../../../types/mcp.js';
import { Project } from '../../../neo4j/projectService.js';
import { ReadResourceTemplateCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { normalizeEntityId } from '../../../utils/idGenerator.js';

/**
 * Schema for validating project ID from URI parameters
 */
export const ProjectDetailsParamsSchema = z.object({
  projectId: z.string()
    .min(1)
    .regex(/^(?:PROJ|proj)_[A-Z0-9]{6}$/i)
    .transform(normalizeEntityId)
    .describe('The unique identifier of the project to fetch details for. Must be a valid project ID prefixed with "PROJ_" followed by 6 alphanumeric characters.')
}).describe('URI parameters for accessing project details');

export type ProjectDetailsParams = z.infer<typeof ProjectDetailsParamsSchema>;

/**
 * Schema for validating query parameters
 */
export const ProjectDetailsQuerySchema = z.object({
  include: z.array(z.enum(['notes', 'links', 'dependencies', 'members']))
    .optional()
    .describe('Optional array of related data to include in the response'),
  version: z.string()
    .optional()
    .describe('Optional version identifier to fetch a specific version of the project details')
}).describe('Query parameters for customizing the project details response');

export type ProjectDetailsQuery = z.infer<typeof ProjectDetailsQuerySchema>;

/**
 * Response type for the project details resource
 */
export interface ProjectDetailsResourceResponse extends ResourceResponse {
  contents: [{
    uri: string;                   // URI identifying this resource
    text: string;                  // JSON string of ProjectDetailsResourceData
    mimeType: "application/json";  // Always JSON for this resource
  }];
}

/**
 * Data structure for project details
 */
export interface ProjectDetailsResourceData {
  project: Project;                // Core project data
  included?: {                     // Optional included related data
    notes?: {                      // Project notes if requested
      count: number;
      latest: Array<{
        id: string;
        text: string;
        createdAt: string;
      }>;
    };
    links?: {                      // Project links if requested
      count: number;
      items: Array<{
        id: string;
        title: string;
        url: string;
      }>;
    };
    dependencies?: {               // Project dependencies if requested
      inbound: number;
      outbound: number;
    };
    members?: {                    // Project members if requested
      count: number;
      roles: Record<string, number>;
    };
  };
  version?: string;                // Version identifier if specified
  fetchedAt: string;              // ISO timestamp of when the data was fetched
}

/**
 * Handler type for reading project details
 */
export type ProjectDetailsHandler = ReadResourceTemplateCallback;