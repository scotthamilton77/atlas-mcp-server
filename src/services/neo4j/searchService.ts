import { logger } from '../../utils/logger.js';
import { neo4jDriver } from './driver.js';
import {
  NodeLabels,
  PaginatedResult,
  SearchOptions
} from './types.js';
import { Neo4jUtils } from './utils.js';

/**
 * Type for search result items
 */
export type SearchResultItem = {
  id: string;
  type: 'project' | 'task' | 'knowledge';
  entityType: string;
  title: string;
  description: string; // Keep full description available
  matchedProperty: string;
  matchedValue: string; // This will be potentially truncated
  createdAt: string;
  updatedAt: string;
  projectId?: string;
  projectName?: string;
  score: number;
};

/**
 * Service for unified search functionality across all entity types
 */
export class SearchService {
  /**
   * Perform a unified search across multiple entity types
   * @param options Search options
   * @returns Paginated search results
   */
  static async search(options: SearchOptions): Promise<PaginatedResult<SearchResultItem>> {
    const session = await neo4jDriver.getSession();
    
    try {
      const {
        property = '',
        value,
        entityTypes = ['project', 'task', 'knowledge'],
        caseInsensitive = true,
        fuzzy = false,
        taskType,
        page = 1,
        limit = 20
      } = options;
      
      if (!value || value.trim() === '') {
        throw new Error('Search value cannot be empty');
      }
      
      const searchValue = caseInsensitive ? value.toLowerCase() : value;
      const normalizedProperty = property ? property.toLowerCase() : '';
      const searchResults: SearchResultItem[] = [];
      const searchPromises: Promise<void>[] = [];
      
      if (entityTypes.includes('project')) {
        searchPromises.push(
          this.searchProjects(searchValue, normalizedProperty, fuzzy, taskType)
            .then(results => { searchResults.push(...results); })
        );
      }
      if (entityTypes.includes('task')) {
        searchPromises.push(
          this.searchTasks(searchValue, normalizedProperty, fuzzy, taskType)
            .then(results => { searchResults.push(...results); })
        );
      }
      if (entityTypes.includes('knowledge')) {
        searchPromises.push(
          this.searchKnowledge(searchValue, normalizedProperty, fuzzy)
            .then(results => { searchResults.push(...results); })
        );
      }
      
      await Promise.all(searchPromises);
      
      searchResults.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      
      return Neo4jUtils.paginateResults(searchResults, { page, limit });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error performing unified search', { error: errorMessage, options });
      throw error;
    } finally {
      await session.close();
    }
  }
  
  /**
   * Search for projects matching the search criteria
   * @private
   */
  private static async searchProjects(
    searchValue: string, 
    property: string, 
    fuzzy: boolean,
    taskType?: string
  ): Promise<SearchResultItem[]> {
    const session = await neo4jDriver.getSession();
    try {
      let whereConditions: string[] = [];
      const params: Record<string, any> = {
        // Use regex for fuzzy, contains for exact (case-insensitive handled by toLower)
        searchValue: fuzzy ? `(?i).*${searchValue}.*` : searchValue 
      };
      
      if (taskType) {
        whereConditions.push('p.taskType = $taskType');
        params.taskType = taskType;
      }
      
      let searchCondition: string;
      if (property === 'name' || property === 'title') {
        searchCondition = fuzzy ? 'p.name =~ $searchValue' : 'toLower(p.name) CONTAINS $searchValue';
      } else if (property === 'description') {
        searchCondition = fuzzy ? 'p.description =~ $searchValue' : 'toLower(p.description) CONTAINS $searchValue';
      } else {
        searchCondition = fuzzy
          ? '(p.name =~ $searchValue OR p.description =~ $searchValue)'
          : '(toLower(p.name) CONTAINS $searchValue OR toLower(p.description) CONTAINS $searchValue)';
      }
      whereConditions.push(searchCondition);
      
      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;
      const scoringLogic = `
        CASE
          WHEN toLower(p.name) = $searchValue THEN 10
          WHEN toLower(p.name) CONTAINS $searchValue THEN 8
          WHEN toLower(p.description) CONTAINS $searchValue THEN 6
          ELSE 5
        END AS score
      `;
      
      const query = `
        MATCH (p:${NodeLabels.Project})
        ${whereClause}
        RETURN 
          p.id AS id, 'project' AS type, p.taskType AS entityType,
          p.name AS title, p.description AS description,
          CASE WHEN toLower(p.name) CONTAINS $searchValue THEN 'name' ELSE 'description' END AS matchedProperty,
          // Truncate long descriptions for matchedValue
          CASE
            WHEN toLower(p.name) CONTAINS $searchValue THEN p.name
            WHEN size(p.description) > 100 THEN left(p.description, 100) + '...'
            ELSE p.description
          END AS matchedValue,
          p.createdAt AS createdAt, p.updatedAt AS updatedAt,
          ${scoringLogic}
        ORDER BY score DESC, p.createdAt DESC
      `;
      
      const result = await session.executeRead(async (tx) => (await tx.run(query, params)).records);
      
      return result.map(record => {
        const data = record.toObject();
        const scoreValue = data.score;
        const score = typeof scoreValue === 'number' ? scoreValue : 
                      (scoreValue && typeof scoreValue.toNumber === 'function' ? scoreValue.toNumber() : 5);
        return { ...data, score } as SearchResultItem;
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error searching projects', { error: errorMessage, searchValue, property });
      throw error; // Re-throw
    } finally {
      await session.close();
    }
  }
  
  /**
   * Search for tasks matching the search criteria
   * @private
   */
  private static async searchTasks(
    searchValue: string, 
    property: string, 
    fuzzy: boolean,
    taskType?: string
  ): Promise<SearchResultItem[]> {
    const session = await neo4jDriver.getSession();
    try {
      let whereConditions: string[] = [];
       const params: Record<string, any> = {
        searchValue: fuzzy ? `(?i).*${searchValue}.*` : searchValue
      };
      
      if (taskType) {
        whereConditions.push('t.taskType = $taskType');
        params.taskType = taskType;
      }
      
      let searchCondition: string;
      if (property === 'title') {
        searchCondition = fuzzy ? 't.title =~ $searchValue' : 'toLower(t.title) CONTAINS $searchValue';
      } else if (property === 'description') {
        searchCondition = fuzzy ? 't.description =~ $searchValue' : 'toLower(t.description) CONTAINS $searchValue';
      } else {
        searchCondition = fuzzy
          ? '(t.title =~ $searchValue OR t.description =~ $searchValue)'
          : '(toLower(t.title) CONTAINS $searchValue OR toLower(t.description) CONTAINS $searchValue)';
      }
      whereConditions.push(searchCondition);
      
      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;
      const scoringLogic = `
        CASE
          WHEN toLower(t.title) = $searchValue THEN 10
          WHEN toLower(t.title) CONTAINS $searchValue THEN 8
          WHEN toLower(t.description) CONTAINS $searchValue THEN 6
          ELSE 5
        END AS score
      `;
      
      const query = `
        MATCH (t:${NodeLabels.Task})
        MATCH (p:${NodeLabels.Project} {id: t.projectId}) // Assumes Task has projectId
        ${whereClause}
        RETURN 
          t.id AS id, 'task' AS type, t.taskType AS entityType,
          t.title AS title, t.description AS description,
          CASE WHEN toLower(t.title) CONTAINS $searchValue THEN 'title' ELSE 'description' END AS matchedProperty,
          // Truncate long descriptions for matchedValue
          CASE
            WHEN toLower(t.title) CONTAINS $searchValue THEN t.title
            WHEN size(t.description) > 100 THEN left(t.description, 100) + '...'
            ELSE t.description
          END AS matchedValue,
          t.createdAt AS createdAt, t.updatedAt AS updatedAt,
          t.projectId AS projectId, p.name AS projectName,
          ${scoringLogic}
        ORDER BY score DESC, t.createdAt DESC
      `;
      
      const result = await session.executeRead(async (tx) => (await tx.run(query, params)).records);
      
      return result.map(record => {
         const data = record.toObject();
         const scoreValue = data.score;
         const score = typeof scoreValue === 'number' ? scoreValue : 
                       (scoreValue && typeof scoreValue.toNumber === 'function' ? scoreValue.toNumber() : 5);
         return { ...data, score } as SearchResultItem;
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error searching tasks', { error: errorMessage, searchValue, property });
      throw error; // Re-throw
    } finally {
      await session.close();
    }
  }
  
  /**
   * Search for knowledge items matching the search criteria
   * @private
   */
  private static async searchKnowledge(
    searchValue: string, 
    property: string, 
    fuzzy: boolean
  ): Promise<SearchResultItem[]> {
    const session = await neo4jDriver.getSession();
    try {
      let whereConditions: string[] = [];
       const params: Record<string, any> = {
        searchValue: fuzzy ? `(?i).*${searchValue}.*` : searchValue
      };
      
      let searchCondition: string;
      // Knowledge primarily searched by 'text' content
      if (property === 'text' || !property) { // Default to text if property is empty or 'text'
        searchCondition = fuzzy ? 'k.text =~ $searchValue' : 'toLower(k.text) CONTAINS $searchValue';
      } else {
         // If a different property is specified (e.g., domain), handle it - though less common for knowledge search
         searchCondition = fuzzy ? `k.${property} =~ $searchValue` : `toLower(k.${property}) CONTAINS $searchValue`;
         logger.warn(`Searching knowledge by property '${property}', typically 'text' is used.`);
      }
      whereConditions.push(searchCondition);
      
      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;
      const scoringLogic = `
        CASE
          WHEN toLower(k.text) = $searchValue THEN 10 // Exact match higher score
          WHEN toLower(k.text) CONTAINS $searchValue THEN 7
          ELSE 5
        END AS score
      `;
      
      const query = `
        MATCH (k:${NodeLabels.Knowledge})
        MATCH (p:${NodeLabels.Project} {id: k.projectId}) // Assumes Knowledge has projectId
        ${whereClause}
        RETURN 
          k.id AS id, 'knowledge' AS type, k.domain AS entityType,
          // Generate a title from the text
          CASE 
            WHEN k.text IS NULL THEN 'Untitled Knowledge'
            WHEN size(toString(k.text)) <= 50 THEN toString(k.text)
            ELSE substring(toString(k.text), 0, 50) + '...'
          END AS title,
          k.text AS description, // Keep full text as description
          'text' AS matchedProperty, // Assume match is always in text for knowledge
          // Truncate long text for matchedValue
          CASE
            WHEN size(k.text) > 100 THEN left(k.text, 100) + '...'
            ELSE k.text
          END AS matchedValue,
          k.createdAt AS createdAt, k.updatedAt AS updatedAt,
          k.projectId AS projectId, p.name AS projectName,
          ${scoringLogic}
        ORDER BY score DESC, k.createdAt DESC
      `;
      
      const result = await session.executeRead(async (tx) => (await tx.run(query, params)).records);
      
      return result.map(record => {
         const data = record.toObject();
         const scoreValue = data.score;
         const score = typeof scoreValue === 'number' ? scoreValue : 
                       (scoreValue && typeof scoreValue.toNumber === 'function' ? scoreValue.toNumber() : 5);
         return { ...data, score } as SearchResultItem;
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error searching knowledge items', { error: errorMessage, searchValue, property });
      throw error; // Re-throw
    } finally {
      await session.close();
    }
  }
  
  /**
   * Perform a full-text search using Neo4j's built-in full-text search capabilities
   * Requires properly set up full-text indexes (project_fulltext, task_fulltext, knowledge_fulltext)
   * @param searchValue Value to search for (supports Lucene syntax)
   * @param options Search options
   * @returns Paginated search results
   */
  static async fullTextSearch(
    searchValue: string,
    options: Omit<SearchOptions, 'value' | 'fuzzy' | 'caseInsensitive'> = {} // Fuzzy/CaseInsensitive handled by index config
  ): Promise<PaginatedResult<SearchResultItem>> {
    const session = await neo4jDriver.getSession();
    try {
      const {
        entityTypes = ['project', 'task', 'knowledge'],
        taskType, // Filter specific to project/task
        page = 1,
        limit = 20
      } = options;
      
      if (!searchValue || searchValue.trim() === '') {
        throw new Error('Search value cannot be empty');
      }
      
      const searchResults: SearchResultItem[] = [];
      const searchPromises: Promise<void>[] = [];
      
      // Project full-text search
      if (entityTypes.includes('project')) {
        const query = `
          CALL db.index.fulltext.queryNodes("project_fulltext", $searchValue) 
          YIELD node AS p, score
          ${taskType ? 'WHERE p.taskType = $taskType' : ''}
          RETURN 
            p.id AS id, 'project' AS type, p.taskType AS entityType,
            p.name AS title, p.description AS description,
            'full-text' AS matchedProperty, // Indicate full-text match
            // Truncate long descriptions for matchedValue in full-text results
            CASE
              WHEN score > 2 THEN p.name // Prioritize name if score is high
              WHEN size(p.description) > 100 THEN left(p.description, 100) + '...'
              ELSE p.description
            END AS matchedValue,
            p.createdAt AS createdAt, p.updatedAt AS updatedAt,
            score * 2 AS adjustedScore // Boost project score slightly
        `;
        searchPromises.push(
          session.executeRead(async (tx) => {
            const result = await tx.run(query, { searchValue, ...(taskType && { taskType }) });
            const items = result.records.map(record => {
               const data = record.toObject();
               const scoreValue = data.adjustedScore;
               const score = typeof scoreValue === 'number' ? scoreValue : 5;
               return { ...data, score } as SearchResultItem;
            });
            searchResults.push(...items);
          })
        );
      }
      
      // Task full-text search
      if (entityTypes.includes('task')) {
        const query = `
          CALL db.index.fulltext.queryNodes("task_fulltext", $searchValue) 
          YIELD node AS t, score
          ${taskType ? 'WHERE t.taskType = $taskType' : ''}
          MATCH (p:${NodeLabels.Project} {id: t.projectId})
          RETURN 
            t.id AS id, 'task' AS type, t.taskType AS entityType,
            t.title AS title, t.description AS description,
            'full-text' AS matchedProperty,
            // Truncate long descriptions for matchedValue in full-text results
            CASE
              WHEN score > 2 THEN t.title // Prioritize title if score is high
              WHEN size(t.description) > 100 THEN left(t.description, 100) + '...'
              ELSE t.description
            END AS matchedValue,
            t.createdAt AS createdAt, t.updatedAt AS updatedAt,
            t.projectId AS projectId, p.name AS projectName,
            score * 1.5 AS adjustedScore // Boost task score slightly less
        `;
        searchPromises.push(
          session.executeRead(async (tx) => {
            const result = await tx.run(query, { searchValue, ...(taskType && { taskType }) });
            const items = result.records.map(record => {
               const data = record.toObject();
               const scoreValue = data.adjustedScore;
               const score = typeof scoreValue === 'number' ? scoreValue : 5;
               return { ...data, score } as SearchResultItem;
            });
            searchResults.push(...items);
          })
        );
      }
      
      // Knowledge full-text search
      if (entityTypes.includes('knowledge')) {
        const query = `
          CALL db.index.fulltext.queryNodes("knowledge_fulltext", $searchValue) 
          YIELD node AS k, score
          MATCH (p:${NodeLabels.Project} {id: k.projectId})
          RETURN 
            k.id AS id, 'knowledge' AS type, k.domain AS entityType,
            // Generate title
            CASE 
              WHEN k.text IS NULL THEN 'Untitled Knowledge'
              WHEN size(toString(k.text)) <= 50 THEN toString(k.text)
              ELSE substring(toString(k.text), 0, 50) + '...'
            END AS title,
            k.text AS description, // Keep full text as description
            'text' AS matchedProperty, // Match is always in text for knowledge index
            // Truncate long text for matchedValue in full-text results
            CASE
              WHEN size(k.text) > 100 THEN left(k.text, 100) + '...'
              ELSE k.text
            END AS matchedValue,
            k.createdAt AS createdAt, k.updatedAt AS updatedAt,
            k.projectId AS projectId, p.name AS projectName,
            score AS adjustedScore // Use raw score for knowledge
        `;
        searchPromises.push(
          session.executeRead(async (tx) => {
            const result = await tx.run(query, { searchValue });
            const items = result.records.map(record => {
               const data = record.toObject();
               const scoreValue = data.adjustedScore;
               const score = typeof scoreValue === 'number' ? scoreValue : 5;
               return { ...data, score } as SearchResultItem;
            });
            searchResults.push(...items);
          })
        );
      }
      
      await Promise.all(searchPromises);
      
      searchResults.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      
      return Neo4jUtils.paginateResults(searchResults, { page, limit });
    } catch (error) {
      // Handle specific index not found errors gracefully?
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error performing full-text search', { error: errorMessage, searchValue, options });
      // Check if error indicates full-text index is missing
      if (errorMessage.includes("Unable to find index")) {
         logger.warn("Full-text index might not be configured correctly or supported in this Neo4j version.");
         // Return empty results instead of throwing? Or re-throw? For now, re-throw.
         throw new Error(`Full-text search failed: Index not found or query error. (${errorMessage})`);
      }
      throw error; // Re-throw other errors
    } finally {
      await session.close();
    }
  }
}
