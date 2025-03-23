import { z } from "zod";
import {
  McpToolResponse,
  PriorityLevel,
  TaskStatus,
  TaskType
} from '../../../types/mcp.js';

export const TaskUpdateSchema = z.object({
  id: z.string().describe("Identifier of the existing task to be modified"),
  updates: z.object({
    title: z.string().min(5).max(150).optional().describe(
      "Modified task title (5-150 characters)"
    ),
    description: z.string().optional().describe(
      "Revised task description and requirements"
    ),
    priority: z.enum([PriorityLevel.LOW, PriorityLevel.MEDIUM, PriorityLevel.HIGH, PriorityLevel.CRITICAL]).optional().describe(
      "Updated priority level reflecting current importance"
    ),
    status: z.enum([TaskStatus.BACKLOG, TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED]).optional().describe(
      "Updated task status reflecting current progress"
    ),
    assignedTo: z.string().optional().describe(
      "Updated assignee ID for task responsibility"
    ),
    urls: z.array(
      z.object({
        title: z.string(),
        url: z.string()
      })
    ).optional().describe(
      "Modified reference materials and documentation links"
    ),
    tags: z.array(z.string()).optional().describe(
      "Updated categorical labels for task organization"
    ),
    completionRequirements: z.string().optional().describe(
      "Revised success criteria for task completion"
    ),
    outputFormat: z.string().optional().describe(
      "Modified deliverable specification for task output"
    ),
    taskType: z.enum([TaskType.RESEARCH, TaskType.GENERATION, TaskType.ANALYSIS, TaskType.INTEGRATION]).optional().describe(
      "Revised classification for task categorization"
    )
  }).describe(
    "Partial update object containing only fields that need modification"
  )
});

const SingleTaskUpdateSchema = z.object({
  mode: z.literal("single"),
  id: z.string(),
  updates: z.object({
    title: z.string().min(5).max(150).optional(),
    description: z.string().optional(),
    priority: z.enum([PriorityLevel.LOW, PriorityLevel.MEDIUM, PriorityLevel.HIGH, PriorityLevel.CRITICAL]).optional(),
    status: z.enum([TaskStatus.BACKLOG, TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED]).optional(),
    assignedTo: z.string().optional(),
    urls: z.array(
      z.object({
        title: z.string(),
        url: z.string()
      })
    ).optional(),
    tags: z.array(z.string()).optional(),
    completionRequirements: z.string().optional(),
    outputFormat: z.string().optional(),
    taskType: z.enum([TaskType.RESEARCH, TaskType.GENERATION, TaskType.ANALYSIS, TaskType.INTEGRATION]).optional()
  })
}).describe(
  "Update an individual task with selective field modifications"
);

const BulkTaskUpdateSchema = z.object({
  mode: z.literal("bulk"),
  tasks: z.array(
    z.object({
      id: z.string().describe("Identifier of the task to update"),
      updates: z.object({
        title: z.string().min(5).max(150).optional(),
        description: z.string().optional(),
        priority: z.enum([PriorityLevel.LOW, PriorityLevel.MEDIUM, PriorityLevel.HIGH, PriorityLevel.CRITICAL]).optional(),
        status: z.enum([TaskStatus.BACKLOG, TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED]).optional(),
        assignedTo: z.string().optional(),
        urls: z.array(
          z.object({
            title: z.string(),
            url: z.string()
          })
        ).optional(),
        tags: z.array(z.string()).optional(),
        completionRequirements: z.string().optional(),
        outputFormat: z.string().optional(),
        taskType: z.enum([TaskType.RESEARCH, TaskType.GENERATION, TaskType.ANALYSIS, TaskType.INTEGRATION]).optional()
      })
    })
  ).min(1).max(100).describe(
    "Collection of task updates to be applied in a single transaction"
  )
}).describe("Update multiple related tasks in a single efficient transaction");

// Schema shapes for tool registration
export const AtlasTaskUpdateSchemaShape = {
  mode: z.enum(["single", "bulk"]).describe(
    "Operation mode - 'single' for one task, 'bulk' for multiple tasks"
  ),
  id: z.string().optional().describe(
    "Existing task ID to update (required for mode='single')"
  ),
  updates: z.object({
    title: z.string().min(5).max(150).optional(),
    description: z.string().optional(),
    priority: z.enum([PriorityLevel.LOW, PriorityLevel.MEDIUM, PriorityLevel.HIGH, PriorityLevel.CRITICAL]).optional(),
    status: z.enum([TaskStatus.BACKLOG, TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED]).optional(),
    assignedTo: z.string().optional(),
    urls: z.array(
      z.object({
        title: z.string(),
        url: z.string()
      })
    ).optional(),
    tags: z.array(z.string()).optional(),
    completionRequirements: z.string().optional(),
    outputFormat: z.string().optional(),
    taskType: z.enum([TaskType.RESEARCH, TaskType.GENERATION, TaskType.ANALYSIS, TaskType.INTEGRATION]).optional()
  }).optional().describe(
    "Object containing fields to modify (only specified fields will be updated) (required for mode='single')"
  ),
  tasks: z.array(
    z.object({
      id: z.string(),
      updates: z.object({
        title: z.string().min(5).max(150).optional(),
        description: z.string().optional(),
        priority: z.enum([PriorityLevel.LOW, PriorityLevel.MEDIUM, PriorityLevel.HIGH, PriorityLevel.CRITICAL]).optional(),
        status: z.enum([TaskStatus.BACKLOG, TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED]).optional(),
        assignedTo: z.string().optional(),
        urls: z.array(
          z.object({
            title: z.string(),
            url: z.string()
          })
        ).optional(),
        tags: z.array(z.string()).optional(),
        completionRequirements: z.string().optional(),
        outputFormat: z.string().optional(),
        taskType: z.enum([TaskType.RESEARCH, TaskType.GENERATION, TaskType.ANALYSIS, TaskType.INTEGRATION]).optional()
      })
    })
  ).optional().describe(
    "Array of task updates, each containing an ID and updates object (required for mode='bulk')"
  )
} as const;

// Schema for validation
export const AtlasTaskUpdateSchema = z.discriminatedUnion("mode", [
  SingleTaskUpdateSchema,
  BulkTaskUpdateSchema
]);

export type AtlasTaskUpdateInput = z.infer<typeof AtlasTaskUpdateSchema>;
export type TaskUpdateInput = z.infer<typeof TaskUpdateSchema>;
export type AtlasTaskUpdateResponse = McpToolResponse;
