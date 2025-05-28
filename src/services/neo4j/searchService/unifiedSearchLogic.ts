/**
 * @fileoverview Implements the unified search logic for Neo4j entities.
 * @module src/services/neo4j/searchService/unifiedSearchLogic
 */

import { Session, int } from "neo4j-driver";
import { logger, requestContextService } from "../../../utils/index.js";
import { neo4jDriver } from "../driver.js";
import {
  NodeLabels,
  PaginatedResult,
  RelationshipTypes,
  SearchOptions,
} from "../types.js";
import { Neo4jUtils } from "../utils.js";
import { SearchResultItem } from "./searchTypes.js";

/**
 * Helper to search within a single node label with sorting and limit.
 * Acquires and closes its own session.
 * @private
 */
async function _searchSingleLabel(
  labelInput: string,
  cypherSearchValue: string,
  originalPropertyName: string, // Used for Cypher query (case-sensitive)
  normalizedLogicProperty: string, // Used for internal logic (lowercase)
  taskTypeFilter?: string,
  limit: number = 50,
  assignedToUserIdFilter?: string,
): Promise<SearchResultItem[]> {
  let session: Session | null = null;
  const reqContext_single = requestContextService.createRequestContext({
    operation: "SearchService._searchSingleLabel", // Updated operation name
    labelInput,
    cypherSearchValue,
    originalPropertyName,
    normalizedLogicProperty,
    taskTypeFilter,
    assignedToUserIdFilter,
    limit,
  });
  try {
    session = await neo4jDriver.getSession();

    let actualLabel: NodeLabels | undefined;
    switch (labelInput.toLowerCase()) {
      case "project":
        actualLabel = NodeLabels.Project;
        break;
      case "task":
        actualLabel = NodeLabels.Task;
        break;
      case "knowledge":
        actualLabel = NodeLabels.Knowledge;
        break;
      default:
        logger.warning(
          `Unsupported label provided to _searchSingleLabel: ${labelInput}`,
          reqContext_single,
        );
        return [];
    }

    const correctlyEscapedLabel = `\`${actualLabel}\``;

    const params: Record<string, any> = {
      searchValue: cypherSearchValue,
      label: actualLabel,
      limit: int(limit),
    };

    const matchClauses: string[] = [`MATCH (n:${correctlyEscapedLabel})`];
    let whereConditions: string[] = [];

    if (taskTypeFilter) {
      whereConditions.push("n.taskType = $taskTypeFilter");
      params.taskTypeFilter = taskTypeFilter;
    }

    if (actualLabel === NodeLabels.Task && assignedToUserIdFilter) {
      matchClauses.push(
        `MATCH (n)-[:${RelationshipTypes.ASSIGNED_TO}]->(assignee:${NodeLabels.User} {id: $assignedToUserIdFilter})`,
      );
      params.assignedToUserIdFilter = assignedToUserIdFilter;
    }

    let propertyForCypher: string; // This will be original case, or default
    let propertyForLogic: string; // This will be lowercase, or default

    if (originalPropertyName) {
      propertyForCypher = originalPropertyName;
      propertyForLogic = normalizedLogicProperty; // Already lowercase from _searchUnified
    } else {
      // Default property based on label if none specified
      switch (actualLabel) {
        case NodeLabels.Project:
          propertyForCypher = "name"; // Default is original case
          propertyForLogic = "name";
          break;
        case NodeLabels.Task:
          propertyForCypher = "title";
          propertyForLogic = "title";
          break;
        case NodeLabels.Knowledge:
          propertyForCypher = "text";
          propertyForLogic = "text";
          break;
        default: // Should not happen due to earlier check
          logger.error(
            "Unreachable code: default property determination failed.",
            reqContext_single,
          );
          return [];
      }
    }

    propertyForLogic = propertyForLogic.toLowerCase();

    if (!propertyForCypher) {
      logger.warning(
        `Could not determine a search property for Cypher for label ${actualLabel}. Returning empty results.`,
        { ...reqContext_single, actualLabel },
      );
      return [];
    }

    const propExistsCheck = `n.\`${propertyForCypher}\` IS NOT NULL`;
    let searchPart: string;

    if (propertyForLogic === "tags") {
      let tagSearchTerm = params.searchValue;
      if (tagSearchTerm.startsWith("(?i)")) {
        tagSearchTerm = tagSearchTerm.substring(4);
      }
      let coreValue = tagSearchTerm;
      if (tagSearchTerm.startsWith("^") && tagSearchTerm.endsWith("$")) {
        coreValue = tagSearchTerm.substring(1, tagSearchTerm.length - 1);
      } else if (
        tagSearchTerm.startsWith(".*") &&
        tagSearchTerm.endsWith(".*")
      ) {
        coreValue = tagSearchTerm.substring(2, tagSearchTerm.length - 2);
      }
      params.exactTagValueLower = coreValue.toLowerCase();
      searchPart = `ANY(tag IN n.\`${propertyForCypher}\` WHERE toLower(tag) = $exactTagValueLower)`;
    } else if (
      propertyForLogic === "urls" &&
      (actualLabel === NodeLabels.Project || actualLabel === NodeLabels.Task)
    ) {
      searchPart = `toString(n.\`${propertyForCypher}\`) =~ $searchValue`;
    } else {
      searchPart = `n.\`${propertyForCypher}\` =~ $searchValue`;
    }

    whereConditions.push(`(${propExistsCheck} AND ${searchPart})`);
    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(" AND ")}`
        : "";

    const scoreValueParam = "$searchValue";
    const scoreExactTagValueLowerParam = "$exactTagValueLower";
    const scoringLogic = `
      CASE
        WHEN n.\`${propertyForCypher}\` IS NOT NULL THEN
          CASE
            WHEN '${propertyForLogic}' = 'tags' AND ANY(tag IN n.\`${propertyForCypher}\` WHERE toLower(tag) = ${scoreExactTagValueLowerParam}) THEN 8
            WHEN n.\`${propertyForCypher}\` =~ ${scoreValueParam} THEN 8
            ELSE 5
          END
        ELSE 5
      END AS score
    `;

    const valueParam = "$searchValue";
    const returnClause = `
      RETURN
        n.id AS id,
        $label AS type,
        CASE $label
          WHEN '${NodeLabels.Knowledge}' THEN (CASE WHEN d IS NOT NULL THEN d.name ELSE null END)
          ELSE n.taskType 
        END AS entityType,
        COALESCE(n.name, n.title, CASE WHEN n.text IS NOT NULL AND size(toString(n.text)) > 50 THEN left(toString(n.text), 50) + '...' ELSE toString(n.text) END, n.id) AS title,
        COALESCE(n.description, n.text, CASE WHEN '${propertyForLogic}' = 'urls' THEN toString(n.urls) ELSE NULL END) AS description,
        '${propertyForCypher}' AS matchedProperty,
        CASE
          WHEN n.\`${propertyForCypher}\` IS NOT NULL THEN
            CASE
              WHEN '${propertyForLogic}' = 'tags' AND ANY(t IN n.\`${propertyForCypher}\` WHERE toLower(t) = ${scoreExactTagValueLowerParam}) THEN
                HEAD([tag IN n.\`${propertyForCypher}\` WHERE toLower(tag) = ${scoreExactTagValueLowerParam}])
              WHEN '${propertyForLogic}' = 'urls' AND toString(n.\`${propertyForCypher}\`) =~ ${valueParam} THEN
                CASE
                  WHEN size(toString(n.\`${propertyForCypher}\`)) > 100 THEN left(toString(n.\`${propertyForCypher}\`), 100) + '...'
                  ELSE toString(n.\`${propertyForCypher}\`)
                END
              WHEN n.\`${propertyForCypher}\` =~ ${valueParam} THEN
                CASE
                  WHEN size(toString(n.\`${propertyForCypher}\`)) > 100 THEN left(toString(n.\`${propertyForCypher}\`), 100) + '...'
                  ELSE toString(n.\`${propertyForCypher}\`)
                END
              ELSE ''
            END
          ELSE ''
        END AS matchedValue,
        n.createdAt AS createdAt,
        n.updatedAt AS updatedAt,
        CASE $label
          WHEN '${NodeLabels.Project}' THEN n.id
          ELSE n.projectId
        END AS projectId,
        CASE $label
          WHEN '${NodeLabels.Project}' THEN n.name
          WHEN '${NodeLabels.Task}' THEN (CASE WHEN p IS NOT NULL THEN p.name ELSE null END)
          WHEN '${NodeLabels.Knowledge}' THEN (CASE WHEN k_proj IS NOT NULL THEN k_proj.name ELSE null END)
          ELSE null
        END AS projectName,
        ${scoringLogic}
    `;

    let optionalMatches = "";
    if (actualLabel === NodeLabels.Task) {
      optionalMatches = `OPTIONAL MATCH (p:${NodeLabels.Project} {id: n.projectId})`;
    } else if (actualLabel === NodeLabels.Knowledge) {
      optionalMatches = `
        OPTIONAL MATCH (k_proj:${NodeLabels.Project} {id: n.projectId})
        OPTIONAL MATCH (n)-[:${RelationshipTypes.BELONGS_TO_DOMAIN}]->(d:${NodeLabels.Domain})
      `;
    }

    const finalMatchQueryPart = matchClauses.join("\n        ");
    let baseWithVariables = ["n"];
    if (actualLabel === NodeLabels.Task && assignedToUserIdFilter) {
      baseWithVariables.push("assignee");
    }
    baseWithVariables = [...new Set(baseWithVariables)];

    const query = `
      ${finalMatchQueryPart}
      ${whereClause}
      WITH ${baseWithVariables.join(", ")}
      ${optionalMatches}
      ${returnClause}
      ORDER BY score DESC, COALESCE(n.updatedAt, n.createdAt) DESC
      LIMIT $limit
    `;

    logger.debug(
      `Executing search query for label ${actualLabel}. Property for Cypher: '${propertyForCypher}', Property for Logic: '${propertyForLogic}', SearchValue (Regex): '${params.searchValue}'`,
      {
        ...reqContext_single,
        actualLabel,
        propertyForCypher,
        propertyForLogic,
        rawSearchValueParam: params.searchValue,
        query,
        params,
      },
    );
    const result = await session.executeRead(
      async (tx: any) => (await tx.run(query, params)).records,
    );

    return result.map((record: any) => {
      const data = record.toObject();
      const scoreValue = data.score;
      const score =
        typeof scoreValue === "number"
          ? scoreValue
          : scoreValue && typeof scoreValue.toNumber === "function"
            ? scoreValue.toNumber()
            : 5;
      const description =
        typeof data.description === "string" ? data.description : undefined;
      return {
        ...data,
        score,
        description,
        entityType: data.entityType || undefined,
        createdAt: data.createdAt || undefined,
        updatedAt: data.updatedAt || undefined,
        projectId: data.projectId || undefined,
        projectName: data.projectName || undefined,
      } as SearchResultItem;
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error searching label ${labelInput}`, error as Error, {
      ...reqContext_single,
      detail: errorMessage,
    });
    return [];
  } finally {
    if (session) {
      await session.close();
    }
  }
}

/**
 * Perform a unified search across multiple entity types (node labels).
 * Searches common properties like name, title, description, text.
 * Applies pagination after combining and sorting results from individual label searches.
 * @param options Search options
 * @returns Paginated search results
 */
export async function _searchUnified(
  options: SearchOptions,
): Promise<PaginatedResult<SearchResultItem>> {
  const reqContext = requestContextService.createRequestContext({
    operation: "SearchService._searchUnified", // Updated operation name
    searchOptions: options,
  });
  try {
    const {
      property = "",
      value,
      entityTypes = ["project", "task", "knowledge"],
      caseInsensitive = true,
      fuzzy = false,
      taskType,
      assignedToUserId,
      page = 1,
      limit = 20,
    } = options;

    if (!value || value.trim() === "") {
      throw new Error("Search value cannot be empty");
    }

    const targetLabels = Array.isArray(entityTypes)
      ? entityTypes
      : [entityTypes];
    if (targetLabels.length === 0) {
      logger.warning(
        "Unified search called with empty entityTypes array. Returning empty results.",
        reqContext,
      );
      return Neo4jUtils.paginateResults([], { page, limit });
    }

    const normalizedProperty = property ? property.toLowerCase() : "";
    const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const caseFlag = caseInsensitive ? "(?i)" : "";

    const cypherSearchValue = fuzzy
      ? `${caseFlag}.*${escapedValue}.*`
      : `${caseFlag}^${escapedValue}$`;

    const allResults: SearchResultItem[] = [];
    const searchPromises: Promise<SearchResultItem[]>[] = [];
    const perLabelLimit = Math.max(limit * 2, 50);

    for (const label of targetLabels) {
      if (!label || typeof label !== "string") {
        logger.warning(`Skipping invalid label in entityTypes: ${label}`, {
          ...reqContext,
          invalidLabel: label,
        });
        continue;
      }

      searchPromises.push(
        _searchSingleLabel(
          // Call the local helper
          label,
          cypherSearchValue,
          property,
          normalizedProperty,
          label.toLowerCase() === "project" || label.toLowerCase() === "task"
            ? taskType
            : undefined,
          perLabelLimit,
          label.toLowerCase() === "task" ? assignedToUserId : undefined,
        ),
      );
    }

    const settledResults = await Promise.allSettled(searchPromises);

    settledResults.forEach((result, index) => {
      const label = targetLabels[index];
      if (
        result.status === "fulfilled" &&
        result.value &&
        Array.isArray(result.value)
      ) {
        allResults.push(...result.value);
      } else if (result.status === "rejected") {
        logger.error(
          `Search promise rejected for label "${label}":`,
          new Error(String(result.reason)),
          { ...reqContext, label, rejectionReason: result.reason },
        );
      } else if (result.status === "fulfilled") {
        logger.warning(
          `Search promise fulfilled with non-array value for label "${label}":`,
          { ...reqContext, label, fulfilledValue: result.value },
        );
      }
    });

    allResults.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const dateA = a.updatedAt || a.createdAt || "1970-01-01T00:00:00.000Z";
      const dateB = b.updatedAt || b.createdAt || "1970-01-01T00:00:00.000Z";
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });

    return Neo4jUtils.paginateResults(allResults, { page, limit });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Error performing unified search", error as Error, {
      ...reqContext,
      detail: errorMessage,
      originalOptions: options,
    });
    throw error;
  }
}
