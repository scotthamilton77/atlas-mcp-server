import { z } from "zod";
import { McpToolResponse } from '../../../types/mcp.js';
import { SearchResultItem } from "../../../services/neo4j/searchService.js";

// Schema for the tool input
export const UnifiedSearchRequestSchema = z.object({
  property: z.string().optional().describe(
    "Specific property to search within"
  ),
  value: z.string().describe(
    "Search term or phrase to find within the specified property (required)"
  ),
  entityTypes: z.array(
    z.enum(['project', 'task', 'knowledge'])
  ).optional().describe(
    "Array of entity types (lowercase: 'project', 'task', 'knowledge') to include in search (Default: all types if omitted)"
  ),
  caseInsensitive: z.boolean().optional().default(true).describe(
    "Boolean flag to ignore case when searching (Default: true)"
  ),
  fuzzy: z.boolean().optional().default(false).describe(
    "Boolean flag to enable approximate matching for typos and variations (Default: false)"
  ),
  taskType: z.string().optional().describe(
    "Optional filter by project/task classification"
  ),
  page: z.number().int().positive().optional().default(1).describe(
    "Page number for paginated results (Default: 1)"
  ),
  limit: z.number().int().positive().max(100).optional().default(20).describe(
    "Number of results per page, maximum 100 (Default: 20)"
  )
});

export type UnifiedSearchRequestInput = z.infer<typeof UnifiedSearchRequestSchema>;

export interface UnifiedSearchResponse {
  results: SearchResultItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
