import { z } from "zod";
import {
  McpToolResponse,
  PriorityLevel,
  TaskStatus,
  TaskType
} from '../../../types/mcp.js';

export const TaskSchema = z.object({
  id: z.string().optional().describe(
    "Optional client-generated task ID"
  ),
  projectId: z.string().describe(
    "ID of the parent project this task belongs to"
  ),
  title: z.string().min(5).max(150).describe(
    "Concise task title clearly describing the objective (5-150 characters)"
  ),
  description: z.string().describe(
    "Detailed explanation of the task requirements and context"
  ),
  priority: z.enum([PriorityLevel.LOW, PriorityLevel.MEDIUM, PriorityLevel.HIGH, PriorityLevel.CRITICAL]).default(PriorityLevel.MEDIUM).describe(
    "Importance level"
  ),
  status: z.enum([TaskStatus.BACKLOG, TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED]).default(TaskStatus.TODO).describe(
    "Current task state"
  ),
  assignedTo: z.string().optional().describe(
    "ID of entity responsible for task completion"
  ),
  urls: z.array(
    z.object({
      title: z.string(),
      url: z.string()
    })
  ).optional().describe(
    "Relevant URLs with descriptive titles for reference materials"
  ),
  tags: z.array(z.string()).optional().describe(
    "Categorical labels for organization and filtering"
  ),
  completionRequirements: z.string().describe(
    "Specific, measurable criteria that indicate task completion"
  ),
  dependencies: z.array(z.string()).optional().describe(
    "Array of existing task IDs that must be completed before this task can begin"
  ),
  outputFormat: z.string().describe(
    "Required format specification for task deliverables"
  ),
  taskType: z.enum([TaskType.RESEARCH, TaskType.GENERATION, TaskType.ANALYSIS, TaskType.INTEGRATION]).describe(
    "Classification of task purpose"
  )
});

const SingleTaskSchema = z.object({
  mode: z.literal("single"),
  id: z.string().optional(),
  projectId: z.string(),
  title: z.string().min(5).max(150),
  description: z.string(),
  priority: z.enum([PriorityLevel.LOW, PriorityLevel.MEDIUM, PriorityLevel.HIGH, PriorityLevel.CRITICAL]).optional().default(PriorityLevel.MEDIUM),
  status: z.enum([TaskStatus.BACKLOG, TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED]).optional().default(TaskStatus.TODO),
  assignedTo: z.string().optional(),
  urls: z.array(
    z.object({
      title: z.string(),
      url: z.string()
    })
  ).optional(),
  tags: z.array(z.string()).optional(),
  completionRequirements: z.string(),
  dependencies: z.array(z.string()).optional(),
  outputFormat: z.string(),
  taskType: z.enum([TaskType.RESEARCH, TaskType.GENERATION, TaskType.ANALYSIS, TaskType.INTEGRATION])
}).describe(
  "Creates a single task with comprehensive details and metadata"
);

const BulkTaskSchema = z.object({
  mode: z.literal("bulk"),
  tasks: z.array(TaskSchema).min(1).max(100).describe(
    "Collection of task definitions to create in a single operation"
  )
}).describe("Create multiple related tasks in a single efficient transaction");

// Schema shapes for tool registration
export const AtlasTaskCreateSchemaShape = {
  mode: z.enum(["single", "bulk"]).describe(
    "Operation mode - 'single' for one task, 'bulk' for multiple tasks"
  ),
  id: z.string().optional().describe(
    "Optional client-generated task ID"
  ),
  projectId: z.string().optional().describe(
    "ID of the parent project this task belongs to (required for mode='single')"
  ),
  title: z.string().min(5).max(150).optional().describe(
    "Concise task title clearly describing the objective (5-150 characters) (required for mode='single')"
  ),
  description: z.string().optional().describe(
    "Detailed explanation of the task requirements and context (required for mode='single')"
  ),
  priority: z.enum([PriorityLevel.LOW, PriorityLevel.MEDIUM, PriorityLevel.HIGH, PriorityLevel.CRITICAL]).optional().describe(
    "Importance level (Default: medium)"
  ),
  status: z.enum([TaskStatus.BACKLOG, TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED]).optional().describe(
    "Current task state (Default: todo)"
  ),
  assignedTo: z.string().optional().describe(
    "ID of entity responsible for task completion"
  ),
  urls: z.array(
    z.object({
      title: z.string(),
      url: z.string()
    })
  ).optional().describe(
    "Array of relevant URLs with descriptive titles for reference materials"
  ),
  tags: z.array(z.string()).optional().describe(
    "Array of categorical labels for organization and filtering"
  ),
  completionRequirements: z.string().optional().describe(
    "Specific, measurable criteria that indicate task completion (required for mode='single')"
  ),
  dependencies: z.array(z.string()).optional().describe(
    "Array of existing task IDs that must be completed before this task can begin"
  ),
  outputFormat: z.string().optional().describe(
    "Required format specification for task deliverables (required for mode='single')"
  ),
  taskType: z.enum([TaskType.RESEARCH, TaskType.GENERATION, TaskType.ANALYSIS, TaskType.INTEGRATION]).optional().describe(
    "Classification of task purpose (required for mode='single')"
  ),
  tasks: z.array(TaskSchema).min(1).max(100).optional().describe(
    "Array of task objects with the above fields (required for mode='bulk')"
  )
} as const;

// Schema for validation
export const AtlasTaskCreateSchema = z.discriminatedUnion("mode", [
  SingleTaskSchema,
  BulkTaskSchema
]);

export type AtlasTaskCreateInput = z.infer<typeof AtlasTaskCreateSchema>;
export type TaskInput = z.infer<typeof TaskSchema>;
export type AtlasTaskCreateResponse = McpToolResponse;
