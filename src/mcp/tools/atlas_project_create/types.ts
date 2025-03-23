import { z } from "zod";
import {
  McpToolResponse,
  ProjectStatus,
  TaskType
} from '../../../types/mcp.js';

export const ProjectSchema = z.object({
  id: z.string().optional().describe(
    "Optional client-generated project ID or identifier"
  ),
  name: z.string().min(1).max(100).describe(
    "Clear, descriptive project name (1-100 characters)"
  ),
  description: z.string().describe(
    "Comprehensive project overview with scope, goals, and implementation details"
  ),
  status: z.enum([ProjectStatus.ACTIVE, ProjectStatus.PENDING, ProjectStatus.COMPLETED, ProjectStatus.ARCHIVED]).default(ProjectStatus.ACTIVE).describe(
    "Current project state for tracking progress (Default: active)"
  ),
  urls: z.array(
    z.object({
      title: z.string(),
      url: z.string()
    })
  ).optional().describe(
    "Links to relevant documentation, specifications, and resources (e.g., 'https://example.com' or 'file://path/to/index.ts')"
  ),
  completionRequirements: z.string().describe(
    "Clear definition of done with measurable success criteria"
  ),
  dependencies: z.array(z.string()).optional().describe(
    "Project IDs that must be completed before this project can begin"
  ),
  outputFormat: z.string().describe(
    "Required format and structure for project deliverables"
  ),
  taskType: z.enum([TaskType.RESEARCH, TaskType.GENERATION, TaskType.ANALYSIS, TaskType.INTEGRATION]).or(z.string()).describe(
    "Classification of project purpose for organization and workflow"
  )
});

const SingleProjectSchema = z.object({
  mode: z.literal("single"),
  id: z.string().optional(),
  name: z.string().min(1).max(100),
  description: z.string(),
  status: z.enum([ProjectStatus.ACTIVE, ProjectStatus.PENDING, ProjectStatus.COMPLETED, ProjectStatus.ARCHIVED]).optional().default(ProjectStatus.ACTIVE),
  urls: z.array(
    z.object({
      title: z.string(),
      url: z.string()
    })
  ).optional(),
  completionRequirements: z.string(),
  dependencies: z.array(z.string()).optional(),
  outputFormat: z.string(),
  taskType: z.enum([TaskType.RESEARCH, TaskType.GENERATION, TaskType.ANALYSIS, TaskType.INTEGRATION]).or(z.string())
}).describe(
  "Creates a single project with comprehensive details and metadata"
);

const BulkProjectSchema = z.object({
  mode: z.literal("bulk"),
  projects: z.array(ProjectSchema).min(1).max(100).describe(
    "Collection of project definitions to create in a single operation"
  )
}).describe("Create multiple related projects in a single efficient transaction");

// Schema shapes for tool registration
export const AtlasProjectCreateSchemaShape = {
  mode: z.enum(["single", "bulk"]).describe(
    "Operation mode - 'single' for one project, 'bulk' for multiple projects"
  ),
  id: z.string().optional().describe(
    "Client-generated project identifier (required for mode='single')"
  ),
  name: z.string().min(1).max(100).optional().describe(
    "Clear, descriptive project name (1-100 characters) (required for mode='single')"
  ),
  description: z.string().optional().describe(
    "Comprehensive project overview with goals and implementation details (required for mode='single')"
  ),
  status: z.enum([ProjectStatus.ACTIVE, ProjectStatus.PENDING, ProjectStatus.COMPLETED, ProjectStatus.ARCHIVED]).optional().describe(
    "Project status for tracking progress (Default: active)"
  ),
  urls: z.array(
    z.object({
      title: z.string(),
      url: z.string()
    })
  ).optional().describe(
    "Links to relevant documentation and resources (e.g., 'https://example.com' or 'file://path/to/file.ts')"
  ),
  completionRequirements: z.string().optional().describe(
    "Measurable success criteria that define project completion (required for mode='single')"
  ),
  dependencies: z.array(z.string()).optional().describe(
    "Project IDs that must be completed before this project can begin"
  ),
  outputFormat: z.string().optional().describe(
    "Format specification for project deliverables (required for mode='single')"
  ),
  taskType: z.enum([TaskType.RESEARCH, TaskType.GENERATION, TaskType.ANALYSIS, TaskType.INTEGRATION]).or(z.string()).optional().describe(
    "Project type classification for workflow organization (required for mode='single')"
  ),
  projects: z.array(ProjectSchema).min(1).max(100).optional().describe(
    "Collection of project definitions to create in a single operation (required for mode='bulk')"
  )
} as const;

// Schema for validation
export const AtlasProjectCreateSchema = z.discriminatedUnion("mode", [
  SingleProjectSchema,
  BulkProjectSchema
]);

export type AtlasProjectCreateInput = z.infer<typeof AtlasProjectCreateSchema>;
export type ProjectInput = z.infer<typeof ProjectSchema>;
export type AtlasProjectCreateResponse = McpToolResponse;
