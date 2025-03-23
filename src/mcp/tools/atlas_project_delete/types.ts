import { z } from "zod";
import { McpToolResponse } from '../../../types/mcp.js';

// Schema for single project deletion
const SingleProjectSchema = z.object({
  mode: z.literal("single"),
  id: z.string().describe(
    "Project ID to delete"
  )
}).describe(
  "Delete a single project by ID"
);

// Schema for bulk project deletion
const BulkProjectSchema = z.object({
  mode: z.literal("bulk"),
  projectIds: z.array(z.string()).min(1).describe(
    "Array of project IDs to delete"
  )
}).describe(
  "Delete multiple projects by their IDs"
);

// Schema shapes for tool registration
export const AtlasProjectDeleteSchemaShape = {
  mode: z.enum(["single", "bulk"]).describe(
    "Operation mode - 'single' for one project, 'bulk' for multiple projects"
  ),
  id: z.string().optional().describe(
    "Project ID to delete (required for mode='single')"
  ),
  projectIds: z.array(z.string()).optional().describe(
    "Array of project IDs to delete (required for mode='bulk')"
  )
} as const;

// Schema for validation
export const AtlasProjectDeleteSchema = z.discriminatedUnion("mode", [
  SingleProjectSchema,
  BulkProjectSchema
]);

export type AtlasProjectDeleteInput = z.infer<typeof AtlasProjectDeleteSchema>;
export type AtlasProjectDeleteResponse = McpToolResponse;
