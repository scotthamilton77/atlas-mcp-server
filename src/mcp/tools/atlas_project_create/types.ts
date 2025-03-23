import { z } from "zod";
import { 
  McpToolResponse, 
  ProjectStatus, 
  TaskType,
  ProjectResponse 
} from '../../../types/mcp.js';
import { Project, ProjectCreateRequest } from '../../../types/tool.js';

export const ProjectSchema = z.object({
  id: z.string().optional().describe(
    "Optional client-generated project ID"
  ),
  name: z.string().min(1).max(100).describe(
    "Descriptive project name (1-100 characters)"
  ),
  description: z.string().describe(
    "Comprehensive project overview explaining purpose and scope"
  ),
  status: z.enum([ProjectStatus.ACTIVE, ProjectStatus.PENDING, ProjectStatus.COMPLETED, ProjectStatus.ARCHIVED]).default(ProjectStatus.ACTIVE).describe(
    "Current project state (Default: active)"
  ),
  urls: z.array(
    z.object({
      title: z.string(),
      url: z.string()
    })
  ).optional().describe(
    "Array of relevant URLs with descriptive titles for reference materials"
  ),
  completionRequirements: z.string().describe(
    "Specific, measurable criteria that indicate project completion"
  ),
  dependencies: z.array(z.string()).optional().describe(
    "Array of existing project IDs that must be completed before this project can begin"
  ),
  outputFormat: z.string().describe(
    "Required format specification for final project deliverables"
  ),
  taskType: z.enum([TaskType.RESEARCH, TaskType.GENERATION, TaskType.ANALYSIS, TaskType.INTEGRATION]).describe(
    "Classification of project purpose"
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
  taskType: z.enum([TaskType.RESEARCH, TaskType.GENERATION, TaskType.ANALYSIS, TaskType.INTEGRATION])
}).describe(
  "Creates a single project with required details"
);

const BulkProjectSchema = z.object({
  mode: z.literal("bulk"),
  projects: z.array(ProjectSchema).min(1).max(100).describe(
    "Array of project objects with the required fields"
  )
}).describe("Efficiently create multiple projects in a single operation");

// Schema shapes for tool registration
export const AtlasProjectCreateSchemaShape = {
  mode: z.enum(["single", "bulk"]).describe(
    "Operation mode - 'single' for one project, 'bulk' for multiple projects"
  ),
  id: z.string().optional().describe(
    "Optional client-generated project ID (required for mode='single')"
  ),
  name: z.string().min(1).max(100).optional().describe(
    "Descriptive project name (1-100 characters) (required for mode='single')"
  ),
  description: z.string().optional().describe(
    "Comprehensive project overview explaining purpose and scope (required for mode='single')"
  ),
  status: z.enum([ProjectStatus.ACTIVE, ProjectStatus.PENDING, ProjectStatus.COMPLETED, ProjectStatus.ARCHIVED]).optional().describe(
    "Current project state (Default: active)"
  ),
  urls: z.array(
    z.object({
      title: z.string(),
      url: z.string()
    })
  ).optional().describe(
    "Array of relevant URLs with descriptive titles for reference materials"
  ),
  completionRequirements: z.string().optional().describe(
    "Specific, measurable criteria that indicate project completion (required for mode='single')"
  ),
  dependencies: z.array(z.string()).optional().describe(
    "Array of existing project IDs that must be completed before this project can begin"
  ),
  outputFormat: z.string().optional().describe(
    "Required format specification for final project deliverables (required for mode='single')"
  ),
  taskType: z.enum([TaskType.RESEARCH, TaskType.GENERATION, TaskType.ANALYSIS, TaskType.INTEGRATION]).optional().describe(
    "Classification of project purpose (required for mode='single')"
  ),
  projects: z.array(ProjectSchema).min(1).max(100).optional().describe(
    "Array of project objects with the above fields (required for mode='bulk')"
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
