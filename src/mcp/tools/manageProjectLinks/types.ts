import { z } from "zod";
import { McpToolResponse } from '../../../types/mcp.js';
import { ProjectLink } from '../../../neo4j/projectService.js';

/**
 * Enhanced URL validation with protocol and format checks
 */
const urlSchema = z.string()
  .url()
  .refine(
    (url) => {
      try {
        const parsed = new URL(url);
        // Require https for most URLs, allow http for localhost/development
        return parsed.protocol === 'https:' || 
               (parsed.protocol === 'http:' && 
                (parsed.hostname === 'localhost' || parsed.hostname.includes('.local')));
      } catch {
        return false;
      }
    },
    {
      message: "URL must use HTTPS (except for localhost/development URLs)",
    }
  )
  .describe("Valid URL with HTTPS protocol (HTTP allowed for localhost).");

// Base link schema shape for reuse
const LinkSchemaShape = {
  title: z.string().min(1).describe(
    "Link title (concise, informative)."
  ),
  url: urlSchema.describe(
    "Valid URL with HTTPS protocol (HTTP allowed for localhost)."
  ),
  description: z.string().optional().describe(
    "Optional context about the resource."
  ),
  category: z.string().optional().describe(
    "Optional grouping category (e.g., 'documentation', 'design')."
  )
} as const;

// Single link schema
const SingleLinkSchema = z.object({
  mode: z.literal("single"),
  projectId: z.string(),
  ...LinkSchemaShape
}).describe(
  "Add a single link to a project."
);

// Bulk link schema
const BulkLinkSchema = z.object({
  mode: z.literal("bulk"),
  projectId: z.string(),
  links: z.array(z.object(LinkSchemaShape)).min(1).max(100)
}).describe(
  "Add multiple links to a project in a single operation."
);

// Single update schema
const SingleUpdateSchema = z.object({
  mode: z.literal("single"),
  linkId: z.string().describe(
    "Link ID to update (must start with 'link_')."
  ),
  updates: z.object(LinkSchemaShape).partial().describe(
    "Fields to update - only specified fields will be modified."
  )
}).describe(
  "Update a single link by ID."
);

// Bulk update schema
const BulkUpdateSchema = z.object({
  mode: z.literal("bulk"),
  links: z.array(z.object({
    linkId: z.string().describe(
      "Link ID to update (must start with 'link_')."
    ),
    updates: z.object(LinkSchemaShape).partial().describe(
      "Fields to update for this link."
    )
  })).min(1).max(100).describe(
    "Array of link updates (1-100 links)."
  )
}).describe(
  "Update multiple links in a single operation."
);

// Single deletion schema
const SingleDeletionSchema = z.object({
  mode: z.literal("single"),
  linkId: z.string().describe(
    "Link ID to delete (must start with 'link_')."
  )
}).describe(
  "Delete a single link by ID."
);

// Bulk deletion schema
const BulkDeletionSchema = z.object({
  mode: z.literal("bulk"),
  linkIds: z.array(z.string()).min(1).max(100).describe(
    "Array of link IDs to delete (1-100 links, must start with 'link_')."
  )
}).describe(
  "Delete multiple links in a single operation."
);

// Schema shapes for tool registration
export const AddProjectLinkSchemaShape = {
  mode: z.enum(["single", "bulk"]).describe(
    "'single' for one link, 'bulk' for multiple links."
  ),
  projectId: z.string().describe(
    "Project ID to add links to (must start with 'proj_')."
  ),
  title: z.string().min(1).optional().describe(
    "Required for single mode: Link title."
  ),
  url: urlSchema.optional().describe(
    "Required for single mode: Valid URL with HTTPS protocol."
  ),
  description: z.string().optional().describe(
    "Optional context about the resource."
  ),
  category: z.string().optional().describe(
    "Optional grouping category."
  ),
  links: z.array(z.object(LinkSchemaShape)).min(1).max(100).optional().describe(
    "Required for bulk mode: Array of 1-100 links with title and URL."
  )
} as const;

export const UpdateProjectLinkSchemaShape = {
  mode: z.enum(["single", "bulk"]).describe(
    "'single' for one link, 'bulk' for multiple links."
  ),
  linkId: z.string().optional().describe(
    "Required for single mode: Link ID to update."
  ),
  updates: z.object(LinkSchemaShape).partial().optional().describe(
    "Required for single mode: Fields to update."
  ),
  links: z.array(z.object({
    linkId: z.string().describe(
      "Link ID (must start with 'link_')."
    ),
    updates: z.object(LinkSchemaShape).partial().describe(
      "Fields to update for this link."
    )
  })).min(1).max(100).optional().describe(
    "Required for bulk mode: Array of 1-100 link updates."
  )
} as const;

export const DeleteProjectLinkSchemaShape = {
  mode: z.enum(["single", "bulk"]).describe(
    "'single' for one link, 'bulk' for multiple links."
  ),
  linkId: z.string().optional().describe(
    "Required for single mode: Link ID to delete."
  ),
  linkIds: z.array(z.string()).min(1).max(100).optional().describe(
    "Required for bulk mode: Array of 1-100 link IDs to delete."
  )
} as const;

// Schemas for validation
export const AddProjectLinkSchema = z.discriminatedUnion("mode", [
  SingleLinkSchema,
  BulkLinkSchema
]);

export const UpdateProjectLinkSchema = z.discriminatedUnion("mode", [
  SingleUpdateSchema,
  BulkUpdateSchema
]);

export const DeleteProjectLinkSchema = z.discriminatedUnion("mode", [
  SingleDeletionSchema,
  BulkDeletionSchema
]);

// Input types
export type AddProjectLinkInput = z.infer<typeof AddProjectLinkSchema>;
export type UpdateProjectLinkInput = z.infer<typeof UpdateProjectLinkSchema>;
export type DeleteProjectLinkInput = z.infer<typeof DeleteProjectLinkSchema>;

// Response types
export type AddProjectLinkResponse = McpToolResponse;
export type UpdateProjectLinkResponse = McpToolResponse;
export type DeleteProjectLinkResponse = McpToolResponse;