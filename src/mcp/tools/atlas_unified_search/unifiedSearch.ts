import {
  SearchResultItem,
  SearchService,
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
    const entityTypesForSearch = validatedInput.entityTypes || [
      "project",
      "task",
      "knowledge",
    ]; // Default if not provided

    // Determine if we should use full-text for the given property and entity type
    let shouldUseFullText = false;
    if (propertyForSearch) {
      const lowerProp = propertyForSearch.toLowerCase();
      // Check for specific entityType + property combinations that have dedicated full-text indexes
      if (entityTypesForSearch.includes("knowledge") && lowerProp === "text") {
        shouldUseFullText = true;
      } else if (
        entityTypesForSearch.includes("project") &&
        (lowerProp === "name" || lowerProp === "description")
      ) {
        shouldUseFullText = true;
      } else if (
        entityTypesForSearch.includes("task") &&
        (lowerProp === "title" || lowerProp === "description")
      ) {
        shouldUseFullText = true;
      }
      // Add other specific full-text indexed fields here if any
    } else {
      // No specific property, so general full-text search is appropriate across default indexed fields
      shouldUseFullText = true;
    }

    if (shouldUseFullText) {
      logger.info(
        `Using full-text search. Property: '${propertyForSearch || "default fields"}'`,
        {
          ...reqContext,
          property: propertyForSearch,
          targetEntityTypes: entityTypesForSearch,
          effectiveFuzzy: validatedInput.fuzzy === true,
        },
      );

      const escapeLucene = (str: string) =>
        str.replace(/([+\-!(){}\[\]^"~*?:\\\/"])/g, "\\$1");
      let luceneQueryValue = escapeLucene(validatedInput.value);

      // If fuzzy is requested for the tool, apply it to the Lucene query
      if (validatedInput.fuzzy === true) {
        luceneQueryValue = `${luceneQueryValue}~1`;
      }
      // Note: If propertyForSearch is set (e.g., "text" for "knowledge"),
      // SearchService.fullTextSearch will use the appropriate index (e.g., "knowledge_fulltext").
      // Lucene itself can handle field-specific queries like "fieldName:term",
      // but our SearchService.fullTextSearch is already structured to call specific indexes.
      // So, just passing the term (and fuzzy if needed) is correct here.

      logger.debug("Constructed Lucene query value for full-text search", {
        ...reqContext,
        luceneQueryValue,
      });

      searchResults = await SearchService.fullTextSearch(luceneQueryValue, {
        entityTypes: entityTypesForSearch,
        taskType: validatedInput.taskType,
        page: validatedInput.page,
        limit: validatedInput.limit,
      });
    } else {
      // propertyForSearch is specified, and it's not one we've decided to use full-text for
      // This path implies a regex-based search on a specific, non-full-text-optimized property.
      // We want "contains" (fuzzy: true for SearchService.search) by default for this path,
      // unless the user explicitly passed fuzzy: false in the tool input.
      let finalFuzzyForRegexPath: boolean;
      if ((input as any)?.fuzzy === false) {
        // User explicitly requested an exact match for the regex search
        finalFuzzyForRegexPath = false;
      } else {
        // User either passed fuzzy: true, or didn't pass fuzzy (in which case Zod default is true,
        // and we also want "contains" as the intelligent default for this path).
        finalFuzzyForRegexPath = true;
      }

      logger.info(
        `Using regex-based search for specific property: '${propertyForSearch}'. Effective fuzzy for SearchService.search (true means contains): ${finalFuzzyForRegexPath}`,
        {
          ...reqContext,
          property: propertyForSearch,
          targetEntityTypes: entityTypesForSearch,
          userInputFuzzy: (input as any)?.fuzzy, // Log what user actually passed, if anything
          zodParsedFuzzy: validatedInput.fuzzy, // Log what Zod parsed (with default)
          finalFuzzyForRegexPath,
        },
      );

      searchResults = await SearchService.search({
        property: propertyForSearch, // Already trimmed
        value: validatedInput.value,
        entityTypes: entityTypesForSearch,
        caseInsensitive: validatedInput.caseInsensitive, // Pass through
        fuzzy: finalFuzzyForRegexPath, // This now correctly defaults to 'true' for "contains"
        taskType: validatedInput.taskType,
        assignedToUserId: validatedInput.assignedToUserId, // Pass through
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
