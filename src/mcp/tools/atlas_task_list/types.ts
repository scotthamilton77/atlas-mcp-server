import { z } from "zod";
import {
  McpToolResponse,
  PriorityLevel,
  TaskStatus,
} from "../../../types/mcp.js";
import { Neo4jTask } from "../../../services/neo4j/types.js";

// Schema for the tool input
export const TaskListRequestSchema = z.object({
  projectId: z
    .string()
    .describe("ID of the project to list tasks for (required)"),
  status: z
    .any()
    .optional()
    .describe("Filter by task status (string) or array of statuses")
    .refine((value) => {
      if (value === undefined) return true;
      if (typeof value === 'string') {
        return ['backlog', 'todo', 'in-progress', 'completed'].includes(value);
      }
      if (Array.isArray(value)) {
        return value.every(v => typeof v === 'string' && ['backlog', 'todo', 'in-progress', 'completed'].includes(v));
      }
      return false;
    }, {
      message: "Status must be a valid task status string or array of status strings. Valid values: 'backlog', 'todo', 'in-progress', 'completed'"
    }),
  assignedTo: z.string().optional().describe("Filter by assignment ID"),
  priority: z
    .any()
    .optional()
    .describe("Filter by priority level (string) or array of priorities")
    .refine((value) => {
      if (value === undefined) return true;
      if (typeof value === 'string') {
        return ['low', 'medium', 'high', 'critical'].includes(value);
      }
      if (Array.isArray(value)) {
        return value.every(v => typeof v === 'string' && ['low', 'medium', 'high', 'critical'].includes(v));
      }
      return false;
    }, {
      message: "Priority must be a valid priority level string or array of priority strings. Valid values: 'low', 'medium', 'high', 'critical'"
    }),
  tags: z
    .array(z.string())
    .optional()
    .describe(
      "Array of tags to filter by (tasks matching any tag will be included)",
    ),
  taskType: z.string().optional().describe("Filter by task classification"),
  sortBy: z
    .enum(["priority", "createdAt", "status"])
    .optional()
    .default("createdAt")
    .describe("Field to sort results by (Default: createdAt)"),
  sortDirection: z
    .enum(["asc", "desc"])
    .optional()
    .default("desc")
    .describe("Sort order (Default: desc)"),
  page: z
    .number()
    .int()
    .positive()
    .optional()
    .default(1)
    .describe("Page number for paginated results (Default: 1)"),
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .default(20)
    .describe("Number of results per page, maximum 100 (Default: 20)"),
});

export type TaskListRequestInput = z.infer<typeof TaskListRequestSchema>;

export interface TaskListResponse {
  tasks: Neo4jTask[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
