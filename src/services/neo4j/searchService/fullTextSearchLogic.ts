/**
 * @fileoverview Implements the full-text search logic for Neo4j entities.
 * @module src/services/neo4j/searchService/fullTextSearchLogic
 */

import { Session } from "neo4j-driver";
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
 * Perform a full-text search across multiple entity types.
 * @param searchValue The string to search for.
 * @param options Search options, excluding those not relevant to full-text search.
 * @returns Paginated search results.
 */
export async function _fullTextSearch(
  searchValue: string,
  options: Omit<
    SearchOptions,
    "value" | "fuzzy" | "caseInsensitive" | "property" | "assignedToUserId"
  > = {},
): Promise<PaginatedResult<SearchResultItem>> {
  const reqContext_fullText = requestContextService.createRequestContext({
    operation: "SearchService._fullTextSearch", // Updated operation name
    searchValue,
    searchOptions: options,
  });
  try {
    const rawEntityTypes = options.entityTypes;
    const taskType = options.taskType;
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

    const targetLabels = typesToUse.map((l) => l.toLowerCase());

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
        logger.error("Error during task full-text search query", err as Error, {
          ...reqContext_fullText,
          targetLabel: "task",
          detail: (err as Error).message,
        });
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
    const errorMessage = error instanceof Error ? error.message : String(error);
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
