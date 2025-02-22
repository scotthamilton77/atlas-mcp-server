import { z } from "zod";
import { McpToolResponse } from '../../../types/mcp.js';
import { Project } from '../../../neo4j/projectService.js';

export const VALID_PROJECT_STATUSES = ['active', 'pending', 'completed', 'archived'] as const;

export const ProjectSchema = z.object({
  name: z.string().min(1).describe(
    "The name of the project. Must be unique and at least 1 character long."
  ),
  description: z.string().optional().describe(
    "An optional description of the project that provides additional details or context."
  ),
  status: z.enum(VALID_PROJECT_STATUSES).default("active").describe(
    "The initial status of the project. Defaults to 'active' if not specified. " +
    "Valid values include: 'active', 'pending', 'completed', 'archived'."
  )
});

const SingleProjectSchema = z.object({
  mode: z.literal("single"),
  ...ProjectSchema.shape
}).describe(
  "Creates a single project with required name and optional description/status."
);

const BulkProjectSchema = z.object({
  mode: z.literal("bulk"),
  projects: z.array(ProjectSchema).min(1).max(100).describe(
    "Array of projects to create. Each project requires a unique name. Supports 1-100 projects per request."
  )
}).describe("Efficiently create multiple projects in a single operation.");

// Schema shapes for tool registration
export const CreateProjectSchemaShape = {
  mode: z.enum(["single", "bulk"]).describe(
    "Creation mode: 'single' for one project, 'bulk' for multiple projects."
  ),
  name: z.string().min(1).optional().describe(
    "Required for single mode. Project name must be unique and non-empty."
  ),
  description: z.string().optional().describe(
    "Optional project description for additional context."
  ),
  status: z.enum(VALID_PROJECT_STATUSES).optional().describe(
    "Project status: 'active' (default), 'pending', 'completed', or 'archived'."
  ),
  projects: z.array(z.object({
    name: z.string().min(1).describe(
      "Required unique project name."
    ),
    description: z.string().optional().describe(
      "Optional project description."
    ),
    status: z.enum(VALID_PROJECT_STATUSES).optional().describe(
      "Optional project status. Defaults to 'active'."
    )
  })).min(1).max(100).optional().describe(
    "Required for bulk mode. Array of 1-100 projects, each with unique name."
  )
} as const;

// Schema for validation
export const CreateProjectSchema = z.discriminatedUnion("mode", [
  SingleProjectSchema,
  BulkProjectSchema
]);

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;
export type ProjectInput = z.infer<typeof ProjectSchema>;
export type CreateProjectResponse = McpToolResponse;