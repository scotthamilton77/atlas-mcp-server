import { z } from 'zod';

export const Neo4jSearchSchema = z.object({
  property: z.string().min(1).describe("Property to search on."),
  value: z.string().min(1).describe("Search term for CONTAINS filter. Must be at least 1 character long."),
  label: z.string().optional().describe("Optional: neo4j node label filter."),
  caseInsensitive: z.boolean().optional().describe("Optional: When true, search ignores letter case."),
  wildcard: z.boolean().optional().describe("Optional: When true, '*' and '?' in search term are treated as wildcards."),
  fuzzy: z.boolean().optional().describe("Optional: When true, enables fuzzy matching for approximate string matches."),
  page: z.number().int().min(1).optional().describe("Optional: Page number for paginated results (default: 1)."),
  limit: z.number().int().min(1).max(1000).optional().describe("Optional: Number of results per page (default: 100)."),
  fuzzyThreshold: z.number().min(0).max(1).optional().describe("Optional: Threshold for fuzzy matching (0.0 to 1.0, default 0.5)."),
  exactMatch: z.boolean().optional().describe("Optional: When true, requires exact matches rather than partial matches."),
  arrayProperties: z.array(z.string()).optional().describe(
    "Optional: Custom array properties to check (in addition to default ones like tags, categories, etc)."
  )
});

/**
 * Type derived from the zod schema for neo4j search parameters.
 * Used throughout the codebase to ensure type consistency.
 */
export type Neo4jSearchArgs = z.infer<typeof Neo4jSearchSchema>;