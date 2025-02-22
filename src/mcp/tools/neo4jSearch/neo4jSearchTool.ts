import { createToolResponse } from '../../../types/mcp.js';
import { ToolContext } from '../../../utils/security.js';
import { McpError, BaseErrorCode } from '../../../types/errors.js';
import { Neo4jSearchSchema, Neo4jSearchArgs } from './types.js';
import { searchNeo4j } from './neo4jSearch.js';

/**
 * Tool handler for searching the neo4j database.
 * Expects an input object with:
 * - property: the property name to filter on
 * - value: the substring value to search using CONTAINS
 * - label (optional): the neo4j node label for filtering
 * - caseInsensitive (optional): ignore letter case when searching
 * - wildcard (optional): treat '*' and '?' as wildcards in search term
 * - fuzzy (optional): enable fuzzy matching for approximate matches
 * - fuzzyThreshold (optional): threshold for fuzzy matching (0.0 to 1.0, default: 0.5)
 * - exactMatch (optional): require exact matches rather than partial matches
 * - page (optional): page number for paginated results (default: 1)
 * - limit (optional): results per page (default: 100, max: 1000)
 * - arrayProperties (optional): custom array properties to check in addition to defaults
 */
export const neo4jSearchTool = async (input: unknown, context: ToolContext) => {
  let validatedInput: Neo4jSearchArgs;
  try {
    validatedInput = Neo4jSearchSchema.parse(input);
  } catch (error) {
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      "Invalid input for neo4j search tool: " + (error instanceof Error ? error.message : error)
    );
  }
  try {
    const result = await searchNeo4j(validatedInput);
    return createToolResponse(JSON.stringify(result, null, 2));
  } catch (error) {
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      "Error executing neo4j search: " + (error instanceof Error ? error.message : error)
    );
  }
};
