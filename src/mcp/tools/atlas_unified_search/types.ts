import { z } from "zod";
import { McpToolResponse } from "../../../types/mcp.js";
import { SearchResultItem } from "../../../services/neo4j/searchService.js";

// Schema for the tool input
export const UnifiedSearchRequestSchema = z.object({
  property: z
    .string()
    .optional()
    .describe(
      "Optional: Target a specific property for search. If specified, a regex-based search is performed on this property (e.g., 'name', 'description', 'text', 'tags', 'urls'). If omitted, a full-text index search is performed across default fields for each entity type (typically includes fields like name, title, description, text, tags, but depends on index configuration).",
    ),
  value: z.string().describe("The search term or phrase."),
  entityTypes: z
    .array(z.enum(["project", "task", "knowledge"]))
    .optional()
    .describe(
      "Array of entity types ('project', 'task', 'knowledge') to include in search (Default: all types if omitted)",
    ),
  caseInsensitive: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      "For regex search (when 'property' is specified): Perform a case-insensitive search (Default: true). Not applicable to full-text index searches (when 'property' is omitted).",
    ),
  fuzzy: z
    .boolean()
    .optional()
    .default(true) // Changed default to true for more intuitive "contains" search on specific properties
    .describe(
      "For regex search (when 'property' is specified): Enables 'contains' matching (Default: true). Set to false for an exact match on the property. For full-text search (when 'property' is omitted): If true, attempts to construct a fuzzy Lucene query (e.g., term~1); if false (default for this case, as Zod default is true but full-text might interpret it differently if not explicitly handled), performs a standard term match.",
    ),
  taskType: z
    .string()
    .optional()
    .describe(
      "Optional filter by project/task classification (applies to project and task types)",
    ),
  assignedToUserId: z
    .string()
    .optional()
    .describe(
      "Optional: Filter tasks by the ID of the assigned user. Only applicable when 'property' is specified (regex search) and 'entityTypes' includes 'task'.",
    ),
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

export type UnifiedSearchRequestInput = z.infer<
  typeof UnifiedSearchRequestSchema
>;

export interface UnifiedSearchResponse {
  results: SearchResultItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
