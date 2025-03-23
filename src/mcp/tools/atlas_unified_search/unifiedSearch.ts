import { SearchService } from '../../../services/neo4j/searchService.js';
import { BaseErrorCode, McpError } from '../../../types/errors.js';
import { logger } from '../../../utils/logger.js';
import { ToolContext } from '../../../utils/security.js';
import { UnifiedSearchRequestInput, UnifiedSearchRequestSchema } from './types.js';
import { formatUnifiedSearchResponse } from './responseFormat.js';

export const atlasUnifiedSearch = async (
  input: unknown,
  context: ToolContext
) => {
  try {
    // Parse and validate input against schema
    const validatedInput = UnifiedSearchRequestSchema.parse(input);
    
    // Log operation
    logger.info("Performing unified search", { 
      searchTerm: validatedInput.value,
      entityTypes: validatedInput.entityTypes,
      property: validatedInput.property,
      requestId: context.requestContext?.requestId 
    });

    if (!validatedInput.value || validatedInput.value.trim() === '') {
      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        "Search value cannot be empty",
        { param: "value" }
      );
    }

    // Call the search service to perform the unified search
    const searchResults = await SearchService.search({
      property: validatedInput.property || '',
      value: validatedInput.value,
      entityTypes: validatedInput.entityTypes,
      caseInsensitive: validatedInput.caseInsensitive,
      fuzzy: validatedInput.fuzzy,
      taskType: validatedInput.taskType,
      page: validatedInput.page,
      limit: validatedInput.limit
    });
    
    logger.info("Unified search completed successfully", { 
      resultCount: searchResults.data.length,
      totalResults: searchResults.total,
      requestId: context.requestContext?.requestId 
    });

    // Create the response object with search results data
    const responseData = {
      results: searchResults.data,
      total: searchResults.total,
      page: searchResults.page,
      limit: searchResults.limit,
      totalPages: searchResults.totalPages
    };

    // Format and return the response
    return formatUnifiedSearchResponse(responseData);
  } catch (error) {
    // Handle specific error cases
    if (error instanceof McpError) {
      throw error;
    }

    logger.error("Failed to perform unified search", { 
      error,
      requestId: context.requestContext?.requestId 
    });

    // Convert other errors to McpError
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Error performing unified search: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};
