import { z } from "zod";
import {
  McpToolResponse,
  ProjectStatus,
  TaskType
} from '../../../types/mcp.js';

export const ProjectUpdateSchema = z.object({
  id: z.string().describe("Existing project ID to update"),
  updates: z.object({
    name: z.string().min(1).max(100).optional().describe(
      "Updated project name (1-100 characters)"
    ),
    description: z.string().optional().describe(
      "Updated project overview explaining purpose and scope"
    ),
    status: z.enum([ProjectStatus.ACTIVE, ProjectStatus.PENDING, ProjectStatus.COMPLETED, ProjectStatus.ARCHIVED]).optional().describe(
      "Updated project state"
    ),
    urls: z.array(
      z.object({
        title: z.string(),
        url: z.string()
      })
    ).optional().describe(
      "Updated array of relevant URLs with descriptive titles for reference materials"
    ),
    completionRequirements: z.string().optional().describe(
      "Updated specific, measurable criteria that indicate project completion"
    ),
    outputFormat: z.string().optional().describe(
      "Updated format specification for final project deliverables"
    ),
    taskType: z.enum([TaskType.RESEARCH, TaskType.GENERATION, TaskType.ANALYSIS, TaskType.INTEGRATION]).optional().describe(
      "Updated classification of project purpose"
    )
  }).describe(
    "Object containing fields to modify (only specified fields will be updated)"
  )
});

const SingleProjectUpdateSchema = z.object({
  mode: z.literal("single"),
  id: z.string(),
  updates: z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().optional(),
    status: z.enum([ProjectStatus.ACTIVE, ProjectStatus.PENDING, ProjectStatus.COMPLETED, ProjectStatus.ARCHIVED]).optional(),
    urls: z.array(
      z.object({
        title: z.string(),
        url: z.string()
      })
    ).optional(),
    completionRequirements: z.string().optional(),
    outputFormat: z.string().optional(),
    taskType: z.enum([TaskType.RESEARCH, TaskType.GENERATION, TaskType.ANALYSIS, TaskType.INTEGRATION]).optional()
  })
}).describe(
  "Updates a single project with specified fields"
);

const BulkProjectUpdateSchema = z.object({
  mode: z.literal("bulk"),
  projects: z.array(
    z.object({
      id: z.string().describe("Existing project ID to update"),
      updates: z.object({
        name: z.string().min(1).max(100).optional(),
        description: z.string().optional(),
        status: z.enum([ProjectStatus.ACTIVE, ProjectStatus.PENDING, ProjectStatus.COMPLETED, ProjectStatus.ARCHIVED]).optional(),
        urls: z.array(
          z.object({
            title: z.string(),
            url: z.string()
          })
        ).optional(),
        completionRequirements: z.string().optional(),
        outputFormat: z.string().optional(),
        taskType: z.enum([TaskType.RESEARCH, TaskType.GENERATION, TaskType.ANALYSIS, TaskType.INTEGRATION]).optional()
      })
    })
  ).min(1).max(100).describe(
    "Array of project updates, each containing an ID and updates object"
  )
}).describe("Efficiently update multiple projects in a single operation");

// Schema shapes for tool registration
export const AtlasProjectUpdateSchemaShape = {
  mode: z.enum(["single", "bulk"]).describe(
    "Operation mode - 'single' for one project, 'bulk' for multiple projects"
  ),
  id: z.string().optional().describe(
    "Existing project ID to update (required for mode='single')"
  ),
  updates: z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().optional(),
    status: z.enum([ProjectStatus.ACTIVE, ProjectStatus.PENDING, ProjectStatus.COMPLETED, ProjectStatus.ARCHIVED]).optional(),
    urls: z.array(
      z.object({
        title: z.string(),
        url: z.string()
      })
    ).optional(),
    completionRequirements: z.string().optional(),
    outputFormat: z.string().optional(),
    taskType: z.enum([TaskType.RESEARCH, TaskType.GENERATION, TaskType.ANALYSIS, TaskType.INTEGRATION]).optional()
  }).optional().describe(
    "Object containing fields to modify (only specified fields will be updated) (required for mode='single')"
  ),
  projects: z.array(
    z.object({
      id: z.string(),
      updates: z.object({
        name: z.string().min(1).max(100).optional(),
        description: z.string().optional(),
        status: z.enum([ProjectStatus.ACTIVE, ProjectStatus.PENDING, ProjectStatus.COMPLETED, ProjectStatus.ARCHIVED]).optional(),
        urls: z.array(
          z.object({
            title: z.string(),
            url: z.string()
          })
        ).optional(),
        completionRequirements: z.string().optional(),
        outputFormat: z.string().optional(),
        taskType: z.enum([TaskType.RESEARCH, TaskType.GENERATION, TaskType.ANALYSIS, TaskType.INTEGRATION]).optional()
      })
    })
  ).optional().describe(
    "Array of project updates, each containing an ID and updates object (required for mode='bulk')"
  )
} as const;

// Schema for validation
export const AtlasProjectUpdateSchema = z.discriminatedUnion("mode", [
  SingleProjectUpdateSchema,
  BulkProjectUpdateSchema
]);

export type AtlasProjectUpdateInput = z.infer<typeof AtlasProjectUpdateSchema>;
export type ProjectUpdateInput = z.infer<typeof ProjectUpdateSchema>;
export type AtlasProjectUpdateResponse = McpToolResponse;
