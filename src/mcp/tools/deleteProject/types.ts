import { z } from "zod";
import { McpToolResponse } from '../../../types/mcp.js';

// Single project deletion schema
const SingleDeletionSchema = z.object({
  mode: z.literal("single"),
  projectId: z.string().describe(
    "Project ID to delete (must start with 'proj_')."
  )
}).describe(
  "Delete a single project by ID."
);

// Bulk project deletion schema
const BulkDeletionSchema = z.object({
  mode: z.literal("bulk"),
  projectIds: z.array(z.string()).min(1).max(100).describe(
    "Array of project IDs to delete (1-100 projects, must start with 'proj_')."
  )
}).describe(
  "Delete multiple projects in a single operation."
);

// Schema shapes for tool registration
export const DeleteProjectSchemaShape = {
  mode: z.enum(["single", "bulk"]).describe(
    "'single' for one project, 'bulk' for multiple projects."
  ),
  projectId: z.string().optional().describe(
    "Required for single mode: Project ID to delete (must start with 'proj_')."
  ),
  projectIds: z.array(z.string()).min(1).max(100).optional().describe(
    "Required for bulk mode: Array of 1-100 project IDs to delete."
  )
} as const;

// Schema for validation
export const DeleteProjectSchema = z.discriminatedUnion("mode", [
  SingleDeletionSchema,
  BulkDeletionSchema
]);

export type DeleteProjectInput = z.infer<typeof DeleteProjectSchema>;
export type DeleteProjectResponse = McpToolResponse;