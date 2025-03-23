import { z } from "zod";
import { McpToolResponse } from '../../../types/mcp.js';

export const KnowledgeSchema = z.object({
  id: z.string().optional().describe(
    "Optional client-generated knowledge ID"
  ),
  projectId: z.string().describe(
    "ID of the parent project this knowledge belongs to"
  ),
  text: z.string().describe(
    "Main content of the knowledge item (can be structured or unstructured)"
  ),
  tags: z.array(z.string()).optional().describe(
    "Categorical labels for organization and filtering"
  ),
  domain: z.string().describe(
    "Primary knowledge area or discipline"
  ),
  citations: z.array(z.string()).optional().describe(
    "Array of reference sources supporting this knowledge (URLs, DOIs, etc.)"
  )
});

const SingleKnowledgeSchema = z.object({
  mode: z.literal("single"),
  id: z.string().optional(),
  projectId: z.string(),
  text: z.string(),
  tags: z.array(z.string()).optional(),
  domain: z.string(),
  citations: z.array(z.string()).optional()
}).describe(
  "Adds a single knowledge item with comprehensive details and metadata"
);

const BulkKnowledgeSchema = z.object({
  mode: z.literal("bulk"),
  knowledge: z.array(KnowledgeSchema).min(1).max(100).describe(
    "Array of knowledge objects with the above fields"
  )
}).describe("Add multiple knowledge items in a single efficient transaction");

// Schema shapes for tool registration
export const AtlasKnowledgeAddSchemaShape = {
  mode: z.enum(["single", "bulk"]).describe(
    "Operation mode - 'single' for one knowledge item, 'bulk' for multiple items"
  ),
  id: z.string().optional().describe(
    "Optional client-generated knowledge ID"
  ),
  projectId: z.string().optional().describe(
    "ID of the parent project this knowledge belongs to (required for mode='single')"
  ),
  text: z.string().optional().describe(
    "Main content of the knowledge item (can be structured or unstructured) (required for mode='single')"
  ),
  tags: z.array(z.string()).optional().describe(
    "Array of categorical labels for organization and filtering"
  ),
  domain: z.enum(["technical", "business", "scientific"]).or(z.string()).optional().describe(
    "Primary knowledge area or discipline (required for mode='single')"
  ),
  citations: z.array(z.string()).optional().describe(
    "Array of reference sources supporting this knowledge (URLs, DOIs, etc.)"
  ),
  knowledge: z.array(KnowledgeSchema).min(1).max(100).optional().describe(
    "Array of knowledge objects with the above fields (required for mode='bulk')"
  )
} as const;

// Schema for validation
export const AtlasKnowledgeAddSchema = z.discriminatedUnion("mode", [
  SingleKnowledgeSchema,
  BulkKnowledgeSchema
]);

export type AtlasKnowledgeAddInput = z.infer<typeof AtlasKnowledgeAddSchema>;
export type KnowledgeInput = z.infer<typeof KnowledgeSchema>;
export type AtlasKnowledgeAddResponse = McpToolResponse;
