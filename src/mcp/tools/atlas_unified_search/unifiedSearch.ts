import {
  SearchService,
  SearchResultItem,
} from "../../../services/neo4j/searchService.js";
import { PaginatedResult } from "../../../services/neo4j/types.js";
import { BaseErrorCode, McpError } from "../../../types/errors.js";
import { ResponseFormat } from "../../../types/mcp.js";
import { ToolContext } from "../../../types/tool.js";
import { logger, requestContextService } from "../../../utils/index.js";
import { formatUnifiedSearchResponse } from "./responseFormat.js";
import {
  UnifiedSearchRequestInput,
  UnifiedSearchRequestSchema,
  UnifiedSearchResponse,
} from "./types.js";

export const atlasUnifiedSearch = async (
  input: unknown,
  context: ToolContext,
): Promise<any> => {
  const reqContext =
    context.requestContext ??
    requestContextService.createRequestContext({
      toolName: "atlasUnifiedSearch",
    });
  try {
    const validatedInput = UnifiedSearchRequestSchema.parse(
      input,
    ) as UnifiedSearchRequestInput & { responseFormat?: ResponseFormat };

    logger.info("Performing unified search", {
      ...reqContext,
      input: validatedInput,
    });

    if (!validatedInput.value || validatedInput.value.trim() === "") {
      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        "Search value cannot be empty",
        { param: "value" },
      );
    }

    let searchResults: PaginatedResult<SearchResultItem>;
    const propertyForSearch = validatedInput.property?.trim();

    if (propertyForSearch) {
      // Use regex-based search when a specific property is provided
      logger.info("Using regex-based search for specific property", {
        ...reqContext,
        property: propertyForSearch,
      });
      searchResults = await SearchService.search({
        property: propertyForSearch,
        value: validatedInput.value, // Value is used as part of regex by SearchService.search
        entityTypes: validatedInput.entityTypes,
        caseInsensitive: validatedInput.caseInsensitive, // Pass through
        fuzzy: validatedInput.fuzzy, // Pass through (controls exact vs. contains for regex)
        taskType: validatedInput.taskType,
        assignedToUserId: validatedInput.assignedToUserId, // Pass through
        page: validatedInput.page,
        limit: validatedInput.limit,
      });
    } else {
      // Use full-text search when no specific property is provided (searches default indexed fields)
      logger.info("Using full-text search across default indexed fields", {
        ...reqContext,
      });

      const escapeLucene = (str: string) =>
        str.replace(/([+\-!(){}\[\]^"~*?:\\\/"])/g, "\\$1");
      const escapedValue = escapeLucene(validatedInput.value);
      let luceneQuery: string;

      if (validatedInput.fuzzy === true) {
        luceneQuery = `${escapedValue}~1`; // Fuzzy on default fields
      } else {
        luceneQuery = escapedValue; // Standard search on default fields
      }

      logger.debug("Constructed Lucene query", { ...reqContext, luceneQuery });

      searchResults = await SearchService.fullTextSearch(luceneQuery, {
        entityTypes: validatedInput.entityTypes,
        taskType: validatedInput.taskType,
        page: validatedInput.page,
        limit: validatedInput.limit,
      });
    }

    if (!searchResults || !Array.isArray(searchResults.data)) {
      logger.error(
        "Search service returned invalid data structure.",
        new Error("Invalid search results structure"),
        { ...reqContext, searchResultsReceived: searchResults },
      );
      throw new McpError(
        BaseErrorCode.INTERNAL_ERROR,
        "Received invalid data structure from search service.",
      );
    }

    logger.info("Unified search completed successfully", {
      ...reqContext,
      resultCount: searchResults.data.length,
      totalResults: searchResults.total,
    });

    const responseData: UnifiedSearchResponse = {
      results: searchResults.data,
      total: searchResults.total,
      page: searchResults.page,
      limit: searchResults.limit,
      totalPages: searchResults.totalPages,
    };

    if (validatedInput.responseFormat === ResponseFormat.JSON) {
      return responseData;
    } else {
      return formatUnifiedSearchResponse(responseData);
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    // const errorStack = error instanceof Error ? error.stack : undefined; // Already captured by logger
    logger.error("Failed to perform unified search", error as Error, {
      ...reqContext,
      // errorMessage and errorStack are part of the Error object passed to logger
      inputReceived: input,
    });

    if (error instanceof McpError) {
      throw error;
    } else {
      throw new McpError(
        BaseErrorCode.INTERNAL_ERROR,
        `Error performing unified search: ${errorMessage}`,
      );
    }
  }
};
