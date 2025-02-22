import { z } from "zod";
import { McpToolResponse } from '../../../types/mcp.js';
import { Project } from '../../../neo4j/projectService.js';
import { VALID_PROJECT_STATUSES } from '../createProject/types.js';

// Define the update schema shape
const ProjectUpdateShape = {
  name: z.string().min(1).describe(
    "Project name (must be unique and non-empty)."
  ),
  description: z.string().describe(
    "Project description for additional context."
  ),
  status: z.enum(VALID_PROJECT_STATUSES).describe(
    "Project status ('active', 'pending', 'completed', 'archived')."
  )
} as const;

// Single project update schema
const SingleUpdateSchema = z.object({
  mode: z.literal("single"),
  id: z.string().describe(
    "Project ID to update (must start with 'proj_')."
  ),
  updates: z.object(ProjectUpdateShape).partial().describe(
    "Fields to update - only specified fields will be modified."
  )
}).describe(
  "Update a single project by ID with partial field updates."
);

// Bulk project update schema
const BulkUpdateSchema = z.object({
  mode: z.literal("bulk"),
  projects: z.array(z.object({
    id: z.string().describe(
      "Project ID to update (must start with 'proj_')."
    ),
    updates: z.object(ProjectUpdateShape).partial().describe(
      "Fields to update for this project."
    )
  })).min(1).max(100).describe(
    "Array of project updates (1-100 projects)."
  )
}).describe(
  "Update multiple projects in a single operation."
);

// Schema shapes for tool registration
export const UpdateProjectSchemaShape = {
  mode: z.enum(["single", "bulk"]).describe(
    "'single' for one project, 'bulk' for multiple projects."
  ),
  id: z.string().optional().describe(
    "Required for single mode: Project ID to update."
  ),
  updates: z.object(ProjectUpdateShape).partial().optional().describe(
    "Required for single mode: Fields to update."
  ),
  projects: z.array(z.object({
    id: z.string().describe(
      "Project ID (must start with 'proj_')."
    ),
    updates: z.object(ProjectUpdateShape).partial().describe(
      "Fields to update for this project."
    )
  })).min(1).max(100).optional().describe(
    "Required for bulk mode: Array of 1-100 project updates."
  )
} as const;

// Schema for validation
export const UpdateProjectSchema = z.discriminatedUnion("mode", [
  SingleUpdateSchema,
  BulkUpdateSchema
]);

export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;
export type UpdateProjectResponse = McpToolResponse;