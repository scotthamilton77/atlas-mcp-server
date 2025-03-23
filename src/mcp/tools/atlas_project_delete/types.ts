import { z } from "zod";
import { McpToolResponse } from '../../../types/mcp.js';

// Schema for individual project removal
const SingleProjectSchema = z.object({
  mode: z.literal("single"),
  id: z.string().describe(
    "Project identifier to permanently remove from the system"
  )
}).describe(
  "Remove a specific project entity by its unique identifier"
);

// Schema for multi-project cleanup operation
const BulkProjectSchema = z.object({
  mode: z.literal("bulk"),
  projectIds: z.array(z.string()).min(1).describe(
    "Collection of project identifiers to remove in a single operation"
  )
}).describe(
  "Batch removal of multiple project entities in a single transaction"
);

// Schema shapes for tool registration
export const AtlasProjectDeleteSchemaShape = {
  mode: z.enum(["single", "bulk"]).describe(
    "Operation strategy - 'single' for individual removal, 'bulk' for batch operations"
  ),
  id: z.string().optional().describe(
    "Target project identifier for removal (required for mode='single')"
  ),
  projectIds: z.array(z.string()).optional().describe(
    "Collection of project identifiers to process (required for mode='bulk')"
  )
} as const;

// Schema for validation
export const AtlasProjectDeleteSchema = z.discriminatedUnion("mode", [
  SingleProjectSchema,
  BulkProjectSchema
]);

export type AtlasProjectDeleteInput = z.infer<typeof AtlasProjectDeleteSchema>;
export type AtlasProjectDeleteResponse = McpToolResponse;
