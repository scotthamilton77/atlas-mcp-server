import { SearchService, SearchResultItem } from '../../../services/neo4j/searchService.js';
import { PaginatedResult } from '../../../services/neo4j/types.js';
import { BaseErrorCode, McpError } from '../../../types/errors.js';
import { ResponseFormat } from '../../../types/mcp.js';
import { logger } from '../../../utils/logger.js';
import { ToolContext } from '../../../utils/security.js';
import { formatUnifiedSearchResponse } from './responseFormat.js';
// Assuming UnifiedSearchResponse is defined correctly in types.ts
import { UnifiedSearchRequestInput, UnifiedSearchRequestSchema, UnifiedSearchResponse } from './types.js'; 

export const atlasUnifiedSearch = async (
  input: unknown,
  context: ToolContext
): Promise<any> => { 
  const requestId = context.requestContext?.requestId;
  try {
    // Parse and validate input against schema
    const validatedInput = UnifiedSearchRequestSchema.parse(input) as UnifiedSearchRequestInput & { responseFormat?: ResponseFormat };

    // Log operation
    logger.info("Performing unified search", { 
      searchTerm: validatedInput.value,
      entityTypes: validatedInput.entityTypes,
      property: validatedInput.property,
      requestId: requestId 
    });

    if (!validatedInput.value || validatedInput.value.trim() === '') {
      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        "Search value cannot be empty",
        { param: "value" }
      );
    }

    // Call the search service to perform the unified search
    const searchResults: PaginatedResult<SearchResultItem> | undefined = await SearchService.search({
      property: validatedInput.property || '',
      value: validatedInput.value,
      entityTypes: validatedInput.entityTypes,
      caseInsensitive: validatedInput.caseInsensitive,
      fuzzy: validatedInput.fuzzy,
      taskType: validatedInput.taskType,
      page: validatedInput.page,
      limit: validatedInput.limit
    });

    // Add robust check for searchResults and searchResults.data
    if (!searchResults || !Array.isArray(searchResults.data)) {
       logger.error("Search service returned invalid data structure.", { searchResults, requestId });
       throw new McpError(
         BaseErrorCode.INTERNAL_ERROR,
         "Received invalid data structure from search service."
       );
    }
    
    logger.info("Unified search completed successfully", { 
      resultCount: searchResults.data.length, // Safe to access now
      totalResults: searchResults.total,
      requestId: requestId 
    });

    // Create the response object with search results data, mapping 'data' to 'results'
    const responseData: UnifiedSearchResponse = {
      results: searchResults.data, // Map data to results
      total: searchResults.total,
      page: searchResults.page,
      limit: searchResults.limit,
      totalPages: searchResults.totalPages
    };

    // Format and return the response
    // formatUnifiedSearchResponse expects UnifiedSearchResponse which has 'results' property
    return formatUnifiedSearchResponse(responseData); 
    
  } catch (error) {
    // Log the specific error message and stack if available
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error("Failed to perform unified search", { 
      error: errorMessage, 
      stack: errorStack, // Log stack trace
      originalError: error, // Log the original error object
      requestId: requestId 
    });

    // Re-throw as McpError if not already one
    if (error instanceof McpError) {
      throw error;
    } else {
      throw new McpError(
        BaseErrorCode.INTERNAL_ERROR,
        `Error performing unified search: ${errorMessage}`
      );
    }
  }
};
