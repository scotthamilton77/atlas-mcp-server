import { z } from 'zod';
import { ResourceResponse } from '../../../types/mcp.js';
import { ProjectMember } from '../../../neo4j/projectService.js';

/**
 * Valid member roles
 */
export const VALID_MEMBER_ROLES = ['owner', 'admin', 'member', 'viewer'] as const;

/**
 * Schema for validating project ID from URI parameters
 */
export const ProjectMembersParamsSchema = z.object({
  projectId: z.string()
    .min(1)
    .regex(/^(?:PROJ|proj)_[A-Z0-9]{6}$/)
    .describe('The unique identifier of the project to fetch members for. Must be a valid project ID prefixed with "PROJ_" followed by 6 uppercase alphanumeric characters.')
}).describe('URI parameters for accessing project members');

export type ProjectMembersParams = z.infer<typeof ProjectMembersParamsSchema>;

/**
 * Schema for validating query parameters
 */
export const ProjectMembersQuerySchema = z.object({
  role: z.enum(VALID_MEMBER_ROLES)
    .optional()
    .describe('Optional role to filter members by'),
  userId: z.string()
    .optional()
    .describe('Optional user ID to filter members by'),
  sortBy: z.enum(['role', 'joinedAt', 'updatedAt'])
    .optional()
    .default('joinedAt')
    .describe('Field to sort members by'),
  sortOrder: z.enum(['asc', 'desc'])
    .optional()
    .default('asc')
    .describe('Sort direction (ascending or descending)'),
  limit: z.number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(50)
    .describe('Maximum number of members to return (1-100, default 50)')
}).describe('Query parameters for filtering and sorting project members');

export type ProjectMembersQuery = z.infer<typeof ProjectMembersQuerySchema>;

/**
 * Response type for the project members resource
 */
export interface ProjectMembersResourceResponse extends ResourceResponse {
  contents: [{
    uri: string;                   // URI identifying this resource
    text: string;                  // JSON string of ProjectMembersResourceData
    mimeType: "application/json";  // Always JSON for this resource
  }];
}

/**
 * Data structure for project members
 */
export interface ProjectMembersResourceData {
  members: {
    items: ProjectMember[];        // Array of members matching the query
    total: number;                 // Total number of members (before filtering)
    filtered: number;              // Number of members after filtering
  };
  metadata: {
    projectId: string;            // ID of the project
    roles: {                      // Count of members by role
      owner: number;
      admin: number;
      member: number;
      viewer: number;
    };
    activeMembers: number;        // Number of members who have accessed recently
    oldestMember?: string;        // ISO timestamp of the oldest member
    newestMember?: string;        // ISO timestamp of the newest member
  };
  query?: {                       // Query parameters used (if any)
    role?: string;               // Role filter applied
    userId?: string;             // User ID filter applied
    sortBy: string;              // Sort field used
    sortOrder: string;           // Sort direction used
    limit: number;               // Limit used
  };
  fetchedAt: string;              // ISO timestamp of when the data was fetched
}

/**
 * Template variables for the project members URI
 */
export interface ProjectMembersTemplateVars {
  projectId: string;              // Project ID from the URI template
}

// Export valid roles for use in other files
export const ValidMemberRoles = VALID_MEMBER_ROLES;