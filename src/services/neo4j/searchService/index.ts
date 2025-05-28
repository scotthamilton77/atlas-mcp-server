/**
 * @fileoverview Provides a SearchService class for unified and full-text search
 * across Neo4j entities. This service acts as an orchestrator for different
 * search strategies.
 * @module src/services/neo4j/searchService/index
 */

import { PaginatedResult, SearchOptions } from "../types.js";
import { _fullTextSearch } from "./fullTextSearchLogic.js";
import { SearchResultItem } from "./searchTypes.js";
import { _searchUnified } from "./unifiedSearchLogic.js";

export { SearchResultItem } from "./searchTypes.js";

/**
 * Service for unified and full-text search functionality across all entity types.
 */
export class SearchService {
  /**
   * Perform a unified search across multiple entity types (node labels).
   * Searches common properties like name, title, description, text.
   * Applies pagination after combining and sorting results from individual label searches.
   * @param options Search options
   * @returns Paginated search results
   */
  static async search(
    options: SearchOptions,
  ): Promise<PaginatedResult<SearchResultItem>> {
    return _searchUnified(options);
  }

  /**
   * Perform a full-text search using pre-configured Neo4j full-text indexes.
   * @param searchValue The string to search for.
   * @param options Search options, excluding those not relevant to full-text search.
   * @returns Paginated search results
   */
  static async fullTextSearch(
    searchValue: string,
    options: Omit<
      SearchOptions,
      "value" | "fuzzy" | "caseInsensitive" | "property" | "assignedToUserId"
    > = {},
  ): Promise<PaginatedResult<SearchResultItem>> {
    return _fullTextSearch(searchValue, options);
  }
}
