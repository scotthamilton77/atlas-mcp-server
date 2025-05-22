import { Session, int } from "neo4j-driver"; // Import int
import { logger, requestContextService } from "../../utils/index.js"; // Updated import path
import { neo4jDriver } from "./driver.js";
import {
  NodeLabels,
  PaginatedResult,
  RelationshipTypes, // Import RelationshipTypes
  SearchOptions,
} from "./types.js";
import { Neo4jUtils } from "./utils.js";

/**
 * Type for search result items - Made generic
 */
export type SearchResultItem = {
  id: string;
  type: string; // Node label
  entityType?: string; // Optional: Specific classification (e.g., taskType, domain)
  title: string; // Best guess title (name, title, truncated text)
  description?: string; // Optional: Full description or text
  matchedProperty: string;
  matchedValue: string; // Potentially truncated
  createdAt?: string; // Optional
  updatedAt?: string; // Optional
  projectId?: string; // Optional
  projectName?: string; // Optional
  score: number;
};

/**
 * Service for unified search functionality across all entity types
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
    const reqContext = requestContextService.createRequestContext({
      operation: "SearchService.search",
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
        assignedToUserId, // Destructure new option
        page = 1,
        limit = 20, // This limit will be applied *after* combining results
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
          this.searchSingleLabel(
            label,
            cypherSearchValue,
            normalizedProperty,
            label.toLowerCase() === "project" || label.toLowerCase() === "task"
              ? taskType
              : undefined,
            perLabelLimit,
            label.toLowerCase() === "task" ? assignedToUserId : undefined, // Pass assignedToUserId for tasks
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
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("Error performing unified search", error as Error, {
        ...reqContext,
        detail: errorMessage,
        originalOptions: options,
      });
      throw error;
    }
  }

  /**
   * Helper to search within a single node label with sorting and limit.
   * Acquires and closes its own session.
   * @private
   */
  private static async searchSingleLabel(
    labelInput: string,
    cypherSearchValue: string,
    normalizedProperty: string,
    taskTypeFilter?: string,
    limit: number = 50,
    assignedToUserIdFilter?: string, // Added assignedToUserIdFilter
  ): Promise<SearchResultItem[]> {
    let session: Session | null = null;
    const reqContext_single = requestContextService.createRequestContext({
      operation: "SearchService.searchSingleLabel",
      labelInput,
      cypherSearchValue,
      normalizedProperty,
      taskTypeFilter,
      assignedToUserIdFilter, // Log this new filter
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
            `Unsupported label provided to searchSingleLabel: ${labelInput}`,
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

      let searchProperty: string | null = null;
      if (normalizedProperty) {
        searchProperty = normalizedProperty;
      } else {
        // Default property based on label if none specified
        switch (actualLabel) {
          case NodeLabels.Project:
            searchProperty = "name";
            break;
          case NodeLabels.Task:
            searchProperty = "title";
            break;
          case NodeLabels.Knowledge:
            searchProperty = "text";
            break;
        }
      }

      if (!searchProperty) {
        logger.warning(
          `Could not determine a default search property for label ${actualLabel}. Returning empty results.`,
          { ...reqContext_single, actualLabel },
        );
        return [];
      }

      const propExistsCheck = `n.\`${searchProperty}\` IS NOT NULL`;
      let searchPart: string;

      if (searchProperty === "tags") {
        params.exactTagValueLower = params.searchValue
          .replace(/^\(\?i\)\.\*(.*)\.\*$/, "$1")
          .toLowerCase();
        searchPart = `ANY(tag IN n.\`${searchProperty}\` WHERE toLower(tag) = $exactTagValueLower)`;
      } else if (
        searchProperty === "urls" &&
        (actualLabel === NodeLabels.Project || actualLabel === NodeLabels.Task)
      ) {
        // Search raw JSON string for 'urls' property
        searchPart = `toString(n.\`${searchProperty}\`) =~ $searchValue`;
      } else {
        searchPart = `n.\`${searchProperty}\` =~ $searchValue`;
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
          WHEN n.\`${searchProperty}\` IS NOT NULL THEN
            CASE
              WHEN '${searchProperty}' = 'tags' AND ANY(tag IN n.\`${searchProperty}\` WHERE toLower(tag) = ${scoreExactTagValueLowerParam}) THEN 8
              WHEN n.\`${searchProperty}\` =~ ${scoreValueParam} THEN 8
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
          CASE $label WHEN '${NodeLabels.Knowledge}' THEN d.name ELSE COALESCE(n.taskType, '') END AS entityType,
          COALESCE(n.name, n.title, CASE WHEN n.text IS NOT NULL AND size(toString(n.text)) > 50 THEN left(toString(n.text), 50) + '...' ELSE toString(n.text) END, n.id) AS title,
          COALESCE(n.description, n.text, CASE WHEN '${searchProperty}' = 'urls' THEN toString(n.urls) ELSE NULL END) AS description,
          '${searchProperty}' AS matchedProperty,
          CASE
            WHEN n.\`${searchProperty}\` IS NOT NULL THEN
              CASE
                WHEN '${searchProperty}' = 'tags' AND ANY(t IN n.\`${searchProperty}\` WHERE toLower(t) = ${scoreExactTagValueLowerParam}) THEN
                  HEAD([tag IN n.\`${searchProperty}\` WHERE toLower(tag) = ${scoreExactTagValueLowerParam}])
                WHEN '${searchProperty}' = 'urls' AND toString(n.\`${searchProperty}\`) =~ ${valueParam} THEN
                  CASE
                    WHEN size(toString(n.\`${searchProperty}\`)) > 100 THEN left(toString(n.\`${searchProperty}\`), 100) + '...'
                    ELSE toString(n.\`${searchProperty}\`)
                  END
                WHEN n.\`${searchProperty}\` =~ ${valueParam} THEN
                  CASE
                    WHEN size(toString(n.\`${searchProperty}\`)) > 100 THEN left(toString(n.\`${searchProperty}\`), 100) + '...'
                    ELSE toString(n.\`${searchProperty}\`)
                  END
                ELSE ''
              END
            ELSE ''
          END AS matchedValue,
          n.createdAt AS createdAt,
          n.updatedAt AS updatedAt,
          COALESCE(n.projectId, k_proj.id) AS projectId,
          COALESCE(p.name, k_proj.name) AS projectName,
          ${scoringLogic}
      `;

      let optionalMatches = "";
      if (
        actualLabel === NodeLabels.Task ||
        actualLabel === NodeLabels.Project
      ) {
        optionalMatches = `OPTIONAL MATCH (p:${NodeLabels.Project} {id: n.projectId})`;
      } else if (actualLabel === NodeLabels.Knowledge) {
        optionalMatches = `
          OPTIONAL MATCH (k_proj:${NodeLabels.Project} {id: n.projectId})
          OPTIONAL MATCH (n)-[:${RelationshipTypes.BELONGS_TO_DOMAIN}]->(d:${NodeLabels.Domain})
        `;
      }

      const finalMatchQueryPart = matchClauses.join("\n        ");

      let withClauseParts = ["n"];
      if (actualLabel === NodeLabels.Task && assignedToUserIdFilter) {
        withClauseParts.push("assignee");
      }
      // Add p, k_proj, d to WITH if they are introduced in optionalMatches and used in RETURN
      if (
        actualLabel === NodeLabels.Task ||
        actualLabel === NodeLabels.Project
      ) {
        if (returnClause.includes("p.name")) withClauseParts.push("p");
      }
      if (actualLabel === NodeLabels.Knowledge) {
        if (
          returnClause.includes("k_proj.name") ||
          returnClause.includes("k_proj.id")
        )
          withClauseParts.push("k_proj");
        if (returnClause.includes("d.name")) withClauseParts.push("d");
      }
      // Remove duplicates from withClauseParts just in case
      withClauseParts = [...new Set(withClauseParts)];

      const query = `
        ${finalMatchQueryPart}
        ${whereClause}
        WITH ${withClauseParts.join(", ")}
        ${optionalMatches}
        ${returnClause}
        ORDER BY score DESC, COALESCE(n.updatedAt, n.createdAt) DESC
        LIMIT $limit
      `;

      logger.debug(`Executing search query for label ${actualLabel}`, {
        ...reqContext_single,
        actualLabel,
        query,
        params,
      });
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
      const errorMessage =
        error instanceof Error ? error.message : String(error);
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

  // --- Full-text search method ---
  static async fullTextSearch(
    searchValue: string,
    options: Omit<
      SearchOptions,
      "value" | "fuzzy" | "caseInsensitive" | "property" | "assignedToUserId"
    > = {},
  ): Promise<PaginatedResult<SearchResultItem>> {
    const reqContext_fullText = requestContextService.createRequestContext({
      operation: "SearchService.fullTextSearch",
      searchValue,
      searchOptions: options,
    });
    try {
      // Use options.entityTypes directly, otherwise default.
      // The destructured 'entityTypes' from options was previously unused.
      const rawEntityTypes = options.entityTypes;
      const taskType = options.taskType; // Explicitly get taskType from options
      const page = options.page || 1;
      const limit = options.limit || 20;

      const defaultEntityTypesList = ["project", "task", "knowledge"];
      const typesToUse =
        rawEntityTypes &&
        Array.isArray(rawEntityTypes) &&
        rawEntityTypes.length > 0
          ? rawEntityTypes
          : defaultEntityTypesList;

      if (!searchValue || searchValue.trim() === "") {
        throw new Error("Search value cannot be empty");
      }

      const targetLabels = typesToUse.map((l) => l.toLowerCase()); // This uses the correctly defined typesToUse

      const searchResults: SearchResultItem[] = [];

      if (targetLabels.includes("project")) {
        let projectSession: Session | null = null;
        try {
          projectSession = await neo4jDriver.getSession();
          const query = `
          CALL db.index.fulltext.queryNodes("project_fulltext", $searchValue)
          YIELD node AS p, score
          ${taskType ? "WHERE p.taskType = $taskType" : ""}
          RETURN
            p.id AS id, 'project' AS type, p.taskType AS entityType,
            p.name AS title, p.description AS description,
            'full-text' AS matchedProperty,
            CASE
              WHEN score > 2 THEN p.name
              WHEN size(toString(p.description)) > 100 THEN left(toString(p.description), 100) + '...'
              ELSE toString(p.description)
            END AS matchedValue,
            p.createdAt AS createdAt, p.updatedAt AS updatedAt,
            p.id as projectId,
            p.name as projectName,
            score * 2 AS adjustedScore
        `;
          await projectSession.executeRead(async (tx) => {
            const result = await tx.run(query, {
              searchValue,
              ...(taskType && { taskType }),
            });
            const items = result.records.map((record) => {
              const data = record.toObject();
              const scoreValue = data.adjustedScore;
              const score = typeof scoreValue === "number" ? scoreValue : 5;
              return {
                ...data,
                score,
                description:
                  typeof data.description === "string"
                    ? data.description
                    : undefined,
                entityType: data.entityType || undefined,
                createdAt: data.createdAt || undefined,
                updatedAt: data.updatedAt || undefined,
                projectId: data.projectId || undefined,
                projectName: data.projectName || undefined,
              } as SearchResultItem;
            });
            searchResults.push(...items);
          });
        } catch (err) {
          logger.error(
            "Error during project full-text search query",
            err as Error,
            {
              ...reqContext_fullText,
              targetLabel: "project",
              detail: (err as Error).message,
            },
          );
        } finally {
          if (projectSession) await projectSession.close();
        }
      }

      if (targetLabels.includes("task")) {
        let taskSession: Session | null = null;
        try {
          taskSession = await neo4jDriver.getSession();
          const query = `
          CALL db.index.fulltext.queryNodes("task_fulltext", $searchValue)
          YIELD node AS t, score
          ${taskType ? "WHERE t.taskType = $taskType" : ""}
          MATCH (p:${NodeLabels.Project} {id: t.projectId})
          RETURN
            t.id AS id, 'task' AS type, t.taskType AS entityType,
            t.title AS title, t.description AS description,
            'full-text' AS matchedProperty,
            CASE
              WHEN score > 2 THEN t.title
              WHEN size(toString(t.description)) > 100 THEN left(toString(t.description), 100) + '...'
              ELSE toString(t.description)
            END AS matchedValue,
            t.createdAt AS createdAt, t.updatedAt AS updatedAt,
            t.projectId AS projectId, p.name AS projectName,
            score * 1.5 AS adjustedScore
        `;
          await taskSession.executeRead(async (tx) => {
            const result = await tx.run(query, {
              searchValue,
              ...(taskType && { taskType }),
            });
            const items = result.records.map((record) => {
              const data = record.toObject();
              const scoreValue = data.adjustedScore;
              const score = typeof scoreValue === "number" ? scoreValue : 5;
              return {
                ...data,
                score,
                description:
                  typeof data.description === "string"
                    ? data.description
                    : undefined,
                entityType: data.entityType || undefined,
                createdAt: data.createdAt || undefined,
                updatedAt: data.updatedAt || undefined,
                projectId: data.projectId || undefined,
                projectName: data.projectName || undefined,
              } as SearchResultItem;
            });
            searchResults.push(...items);
          });
        } catch (err) {
          logger.error(
            "Error during task full-text search query",
            err as Error,
            {
              ...reqContext_fullText,
              targetLabel: "task",
              detail: (err as Error).message,
            },
          );
        } finally {
          if (taskSession) await taskSession.close();
        }
      }

      if (targetLabels.includes("knowledge")) {
        let knowledgeSession: Session | null = null;
        try {
          knowledgeSession = await neo4jDriver.getSession();
          const query = `
          CALL db.index.fulltext.queryNodes("knowledge_fulltext", $searchValue)
          YIELD node AS k, score
          MATCH (p:${NodeLabels.Project} {id: k.projectId})
          OPTIONAL MATCH (k)-[:${RelationshipTypes.BELONGS_TO_DOMAIN}]->(d:${NodeLabels.Domain})
          RETURN
            k.id AS id, 'knowledge' AS type, d.name AS entityType,
            CASE
              WHEN k.text IS NULL THEN 'Untitled Knowledge'
              WHEN size(toString(k.text)) <= 50 THEN toString(k.text)
              ELSE substring(toString(k.text), 0, 50) + '...'
            END AS title,
            k.text AS description,
            'text' AS matchedProperty,
            CASE
              WHEN size(toString(k.text)) > 100 THEN left(toString(k.text), 100) + '...'
              ELSE toString(k.text)
            END AS matchedValue,
            k.createdAt AS createdAt, k.updatedAt AS updatedAt,
            k.projectId AS projectId, p.name AS projectName,
            score AS adjustedScore
        `;
          await knowledgeSession.executeRead(async (tx) => {
            const result = await tx.run(query, { searchValue });
            const items = result.records.map((record) => {
              const data = record.toObject();
              const scoreValue = data.adjustedScore;
              const score = typeof scoreValue === "number" ? scoreValue : 5;
              return {
                ...data,
                score,
                description:
                  typeof data.description === "string"
                    ? data.description
                    : undefined,
                entityType: data.entityType || undefined,
                createdAt: data.createdAt || undefined,
                updatedAt: data.updatedAt || undefined,
                projectId: data.projectId || undefined,
                projectName: data.projectName || undefined,
              } as SearchResultItem;
            });
            searchResults.push(...items);
          });
        } catch (err) {
          logger.error(
            "Error during knowledge full-text search query",
            err as Error,
            {
              ...reqContext_fullText,
              targetLabel: "knowledge",
              detail: (err as Error).message,
            },
          );
        } finally {
          if (knowledgeSession) await knowledgeSession.close();
        }
      }

      searchResults.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const dateA = a.updatedAt || a.createdAt || "1970-01-01T00:00:00.000Z";
        const dateB = b.updatedAt || b.createdAt || "1970-01-01T00:00:00.000Z";
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });

      return Neo4jUtils.paginateResults(searchResults, { page, limit });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("Error performing full-text search", error as Error, {
        ...reqContext_fullText,
        detail: errorMessage,
      });
      if (errorMessage.includes("Unable to find index")) {
        logger.warning(
          "Full-text index might not be configured correctly or supported in this Neo4j version.",
          { ...reqContext_fullText, detail: "Index not found warning" },
        );
        throw new Error(
          `Full-text search failed: Index not found or query error. (${errorMessage})`,
        );
      }
      throw error;
    }
  }
}
