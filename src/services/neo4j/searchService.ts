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
  description: string;
  matchedProperty: string;
  matchedValue: string;
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
      
      // Validate required parameters
      if (!value || value.trim() === '') {
        throw new Error('Search value cannot be empty');
      }
      
      // Prepare the search value based on options
      const searchValue = caseInsensitive 
        ? value.toLowerCase() 
        : value;
      
      // Normalize search property if provided
      const normalizedProperty = property ? property.toLowerCase() : '';
      
      // Initialize result array
      const searchResults: SearchResultItem[] = [];
      
      // Process each entity type if included
      const searchPromises: Promise<void>[] = [];
      
      // Project search
      if (entityTypes.includes('project')) {
        searchPromises.push(
          this.searchProjects(searchValue, normalizedProperty, fuzzy, taskType)
            .then(results => {
              searchResults.push(...results);
              return;
            })
        );
      }
      
      // Task search
      if (entityTypes.includes('task')) {
        searchPromises.push(
          this.searchTasks(searchValue, normalizedProperty, fuzzy, taskType)
            .then(results => {
              searchResults.push(...results);
              return;
            })
        );
      }
      
      // Knowledge search
      if (entityTypes.includes('knowledge')) {
        searchPromises.push(
          this.searchKnowledge(searchValue, normalizedProperty, fuzzy)
            .then(results => {
              searchResults.push(...results);
              return;
            })
        );
      }
      
      // Wait for all search operations to complete
      await Promise.all(searchPromises);
      
      // Sort results by score (descending) and then by creation date (descending)
      searchResults.sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      
      // Apply pagination
      return Neo4jUtils.paginateResults(searchResults, { page, limit });
    } catch (error) {
      logger.error('Error performing unified search', { error, options });
      throw error;
    } finally {
      await session.close();
    }
  }
  
  /**
   * Search for projects matching the search criteria
   * @param searchValue Value to search for
   * @param property Specific property to search within (empty for all properties)
   * @param fuzzy Whether to use fuzzy matching
   * @param taskType Optional taskType filter
   * @returns Array of search result items
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
        searchValue: fuzzy ? `(?i).*${searchValue}.*` : searchValue.toLowerCase()
      };
      
      // Add task type filter if provided
      if (taskType) {
        whereConditions.push('p.taskType = $taskType');
        params.taskType = taskType;
      }
      
      // Build search conditions based on property
      let searchCondition: string;
      if (property === 'name' || property === 'title') {
        searchCondition = fuzzy 
          ? 'p.name =~ $searchValue' 
          : 'toLower(p.name) CONTAINS $searchValue';
      } else if (property === 'description') {
        searchCondition = fuzzy 
          ? 'p.description =~ $searchValue' 
          : 'toLower(p.description) CONTAINS $searchValue';
      } else {
        // Search across all searchable properties if no specific property
        searchCondition = fuzzy
          ? '(p.name =~ $searchValue OR p.description =~ $searchValue)'
          : '(toLower(p.name) CONTAINS $searchValue OR toLower(p.description) CONTAINS $searchValue)';
      }
      
      whereConditions.push(searchCondition);
      
      // Construct the final WHERE clause
      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;
      
      // Construct scoring logic
      const scoringLogic = `
        // Calculate search relevance score
        CASE
          WHEN toLower(p.name) = $searchValue THEN 10
          WHEN toLower(p.name) CONTAINS $searchValue THEN 8
          WHEN toLower(p.description) CONTAINS $searchValue THEN 6
          ELSE 5
        END AS score
      `;
      
      // Construct the final query
      const query = `
        MATCH (p:${NodeLabels.Project})
        ${whereClause}
        RETURN 
          p.id AS id,
          'project' AS type,
          p.taskType AS entityType,
          p.name AS title,
          p.description AS description,
          CASE
            WHEN toLower(p.name) CONTAINS $searchValue THEN 'name'
            ELSE 'description'
          END AS matchedProperty,
          CASE
            WHEN toLower(p.name) CONTAINS $searchValue THEN p.name
            ELSE p.description
          END AS matchedValue,
          p.createdAt AS createdAt,
          p.updatedAt AS updatedAt,
          ${scoringLogic}
        ORDER BY score DESC, p.createdAt DESC
      `;
      
      const result = await session.executeRead(async (tx) => {
        const result = await tx.run(query, params);
        return result.records;
      });
      
      // Map result records to search result items
      return result.map(record => {
        const scoreValue = record.get('score');
        const score = typeof scoreValue === 'number' ? scoreValue : 
                      scoreValue && typeof scoreValue.toNumber === 'function' ? scoreValue.toNumber() : 5;
        
        return {
          id: record.get('id'),
          type: record.get('type'),
          entityType: record.get('entityType'),
          title: record.get('title'),
          description: record.get('description'),
          matchedProperty: record.get('matchedProperty'),
          matchedValue: record.get('matchedValue'),
          createdAt: record.get('createdAt'),
          updatedAt: record.get('updatedAt'),
          score: score
        };
      });
    } catch (error) {
      logger.error('Error searching projects', { error, searchValue, property });
      throw error;
    } finally {
      await session.close();
    }
  }
  
  /**
   * Search for tasks matching the search criteria
   * @param searchValue Value to search for
   * @param property Specific property to search within (empty for all properties)
   * @param fuzzy Whether to use fuzzy matching
   * @param taskType Optional taskType filter
   * @returns Array of search result items
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
        searchValue: fuzzy ? `(?i).*${searchValue}.*` : searchValue.toLowerCase()
      };
      
      // Add task type filter if provided
      if (taskType) {
        whereConditions.push('t.taskType = $taskType');
        params.taskType = taskType;
      }
      
      // Build search conditions based on property
      let searchCondition: string;
      if (property === 'title') {
        searchCondition = fuzzy 
          ? 't.title =~ $searchValue' 
          : 'toLower(t.title) CONTAINS $searchValue';
      } else if (property === 'description') {
        searchCondition = fuzzy 
          ? 't.description =~ $searchValue' 
          : 'toLower(t.description) CONTAINS $searchValue';
      } else {
        // Search across all searchable properties if no specific property
        searchCondition = fuzzy
          ? '(t.title =~ $searchValue OR t.description =~ $searchValue)'
          : '(toLower(t.title) CONTAINS $searchValue OR toLower(t.description) CONTAINS $searchValue)';
      }
      
      whereConditions.push(searchCondition);
      
      // Construct the final WHERE clause
      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;
      
      // Construct scoring logic
      const scoringLogic = `
        // Calculate search relevance score
        CASE
          WHEN toLower(t.title) = $searchValue THEN 10
          WHEN toLower(t.title) CONTAINS $searchValue THEN 8
          WHEN toLower(t.description) CONTAINS $searchValue THEN 6
          ELSE 5
        END AS score
      `;
      
      // Construct the final query
      const query = `
        MATCH (t:${NodeLabels.Task})
        MATCH (p:${NodeLabels.Project} {id: t.projectId})
        ${whereClause}
        RETURN 
          t.id AS id,
          'task' AS type,
          t.taskType AS entityType,
          t.title AS title,
          t.description AS description,
          CASE
            WHEN toLower(t.title) CONTAINS $searchValue THEN 'title'
            ELSE 'description'
          END AS matchedProperty,
          CASE
            WHEN toLower(t.title) CONTAINS $searchValue THEN t.title
            ELSE t.description
          END AS matchedValue,
          t.createdAt AS createdAt,
          t.updatedAt AS updatedAt,
          t.projectId AS projectId,
          p.name AS projectName,
          ${scoringLogic}
        ORDER BY score DESC, t.createdAt DESC
      `;
      
      const result = await session.executeRead(async (tx) => {
        const result = await tx.run(query, params);
        return result.records;
      });
      
      // Map result records to search result items
      return result.map(record => {
        const scoreValue = record.get('score');
        const score = typeof scoreValue === 'number' ? scoreValue : 
                      scoreValue && typeof scoreValue.toNumber === 'function' ? scoreValue.toNumber() : 5;
        
        return {
          id: record.get('id'),
          type: record.get('type'),
          entityType: record.get('entityType'),
          title: record.get('title'),
          description: record.get('description'),
          matchedProperty: record.get('matchedProperty'),
          matchedValue: record.get('matchedValue'),
          createdAt: record.get('createdAt'),
          updatedAt: record.get('updatedAt'),
          projectId: record.get('projectId'),
          projectName: record.get('projectName'),
          score: score
        };
      });
    } catch (error) {
      logger.error('Error searching tasks', { error, searchValue, property });
      throw error;
    } finally {
      await session.close();
    }
  }
  
  /**
   * Search for knowledge items matching the search criteria
   * @param searchValue Value to search for
   * @param property Specific property to search within (empty for all properties)
   * @param fuzzy Whether to use fuzzy matching
   * @returns Array of search result items
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
        searchValue: fuzzy ? `(?i).*${searchValue}.*` : searchValue.toLowerCase()
      };
      
      // Build search conditions based on property
      let searchCondition: string;
      if (property === 'text') {
        searchCondition = fuzzy 
          ? 'k.text =~ $searchValue' 
          : 'toLower(k.text) CONTAINS $searchValue';
      } else {
        // Search across all searchable properties if no specific property
        searchCondition = fuzzy
          ? 'k.text =~ $searchValue'
          : 'toLower(k.text) CONTAINS $searchValue';
      }
      
      whereConditions.push(searchCondition);
      
      // Construct the final WHERE clause
      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;
      
      // Construct scoring logic
      const scoringLogic = `
        // Calculate search relevance score
        CASE
          WHEN k.text = $searchValue THEN 10
          WHEN toLower(k.text) CONTAINS $searchValue THEN 7
          ELSE 5
        END AS score
      `;
      
      // Construct the final query
      const query = `
        MATCH (k:${NodeLabels.Knowledge})
        MATCH (p:${NodeLabels.Project} {id: k.projectId})
        ${whereClause}
        RETURN 
          k.id AS id,
          'knowledge' AS type,
          k.domain AS entityType,
          CASE 
            // Generate a title from the text if not too long
            WHEN k.text IS NULL THEN 'Untitled Knowledge'
            WHEN size(toString(k.text)) <= 50 THEN toString(k.text)
            ELSE substring(toString(k.text), 0, 50) + '...'
          END AS title,
          k.text AS description,
          'text' AS matchedProperty,
          k.text AS matchedValue,
          k.createdAt AS createdAt,
          k.updatedAt AS updatedAt,
          k.projectId AS projectId,
          p.name AS projectName,
          ${scoringLogic}
        ORDER BY score DESC, k.createdAt DESC
      `;
      
      const result = await session.executeRead(async (tx) => {
        const result = await tx.run(query, params);
        return result.records;
      });
      
      // Map result records to search result items
      return result.map(record => {
        const scoreValue = record.get('score');
        const score = typeof scoreValue === 'number' ? scoreValue : 
                      scoreValue && typeof scoreValue.toNumber === 'function' ? scoreValue.toNumber() : 5;
        
        return {
          id: record.get('id'),
          type: record.get('type'),
          entityType: record.get('entityType'),
          title: record.get('title'),
          description: record.get('description'),
          matchedProperty: record.get('matchedProperty'),
          matchedValue: record.get('matchedValue'),
          createdAt: record.get('createdAt'),
          updatedAt: record.get('updatedAt'),
          projectId: record.get('projectId'),
          projectName: record.get('projectName'),
          score: score
        };
      });
    } catch (error) {
      logger.error('Error searching knowledge items', { error, searchValue, property });
      throw error;
    } finally {
      await session.close();
    }
  }
  
  /**
   * Perform a full-text search using Neo4j's built-in full-text search capabilities
   * More powerful but requires properly set up full-text indexes
   * @param searchValue Value to search for
   * @param options Search options
   * @returns Paginated search results
   */
  static async fullTextSearch(
    searchValue: string,
    options: Omit<SearchOptions, 'value'> = {}
  ): Promise<PaginatedResult<SearchResultItem>> {
    const session = await neo4jDriver.getSession();
    
    try {
      const {
        entityTypes = ['project', 'task', 'knowledge'],
        taskType,
        page = 1,
        limit = 20
      } = options;
      
      // Validate required parameters
      if (!searchValue || searchValue.trim() === '') {
        throw new Error('Search value cannot be empty');
      }
      
      // Initialize result array
      const searchResults: SearchResultItem[] = [];
      
      // Process each entity type if included
      const searchPromises: Promise<void>[] = [];
      
      // Project full-text search
      if (entityTypes.includes('project')) {
        const query = `
          CALL db.index.fulltext.queryNodes("project_fulltext", $searchValue) 
          YIELD node AS p, score
          ${taskType ? 'WHERE p.taskType = $taskType' : ''}
          RETURN 
            p.id AS id,
            'project' AS type,
            p.taskType AS entityType,
            p.name AS title,
            p.description AS description,
            'full-text' AS matchedProperty,
            CASE
              WHEN score > 2 THEN p.name
              ELSE p.description
            END AS matchedValue,
            p.createdAt AS createdAt,
            p.updatedAt AS updatedAt,
            score * 2 AS adjustedScore
        `;
        
        searchPromises.push(
          session.executeRead(async (tx) => {
            const result = await tx.run(query, { 
              searchValue, 
              ...(taskType ? { taskType } : {}) 
            });
            
            const items = result.records.map(record => {
              const scoreValue = record.get('adjustedScore');
              const score = typeof scoreValue === 'number' ? scoreValue : 
                          scoreValue && typeof scoreValue.toNumber === 'function' ? scoreValue.toNumber() : 5;
              
              return {
                id: record.get('id'),
                type: record.get('type'),
                entityType: record.get('entityType'),
                title: record.get('title'),
                description: record.get('description'),
                matchedProperty: record.get('matchedProperty'),
                matchedValue: record.get('matchedValue'),
                createdAt: record.get('createdAt'),
                updatedAt: record.get('updatedAt'),
                score: score
              };
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
            t.id AS id,
            'task' AS type,
            t.taskType AS entityType,
            t.title AS title,
            t.description AS description,
            'full-text' AS matchedProperty,
            CASE
              WHEN score > 2 THEN t.title
              ELSE t.description
            END AS matchedValue,
            t.createdAt AS createdAt,
            t.updatedAt AS updatedAt,
            t.projectId AS projectId,
            p.name AS projectName,
            score * 1.5 AS adjustedScore
        `;
        
        searchPromises.push(
          session.executeRead(async (tx) => {
            const result = await tx.run(query, { 
              searchValue, 
              ...(taskType ? { taskType } : {}) 
            });
            
            const items = result.records.map(record => {
              const scoreValue = record.get('adjustedScore');
              const score = typeof scoreValue === 'number' ? scoreValue : 
                          scoreValue && typeof scoreValue.toNumber === 'function' ? scoreValue.toNumber() : 5;
              
              return {
                id: record.get('id'),
                type: record.get('type'),
                entityType: record.get('entityType'),
                title: record.get('title'),
                description: record.get('description'),
                matchedProperty: record.get('matchedProperty'),
                matchedValue: record.get('matchedValue'),
                createdAt: record.get('createdAt'),
                updatedAt: record.get('updatedAt'),
                projectId: record.get('projectId'),
                projectName: record.get('projectName'),
                score: score
              };
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
            k.id AS id,
            'knowledge' AS type,
            k.domain AS entityType,
            CASE 
              WHEN k.text IS NULL THEN 'Untitled Knowledge'
              WHEN size(toString(k.text)) <= 50 THEN toString(k.text)
              ELSE substring(toString(k.text), 0, 50) + '...'
            END AS title,
            k.text AS description,
            'text' AS matchedProperty,
            k.text AS matchedValue,
            k.createdAt AS createdAt,
            k.updatedAt AS updatedAt,
            k.projectId AS projectId,
            p.name AS projectName,
            score AS adjustedScore
        `;
        
        searchPromises.push(
          session.executeRead(async (tx) => {
            const result = await tx.run(query, { searchValue });
            
            const items = result.records.map(record => {
              const scoreValue = record.get('adjustedScore');
              const score = typeof scoreValue === 'number' ? scoreValue : 
                          scoreValue && typeof scoreValue.toNumber === 'function' ? scoreValue.toNumber() : 5;
              
              return {
                id: record.get('id'),
                type: record.get('type'),
                entityType: record.get('entityType'),
                title: record.get('title'),
                description: record.get('description'),
                matchedProperty: record.get('matchedProperty'),
                matchedValue: record.get('matchedValue'),
                createdAt: record.get('createdAt'),
                updatedAt: record.get('updatedAt'),
                projectId: record.get('projectId'),
                projectName: record.get('projectName'),
                score: score
              };
            });
            
            searchResults.push(...items);
          })
        );
      }
      
      // Wait for all search operations to complete
      await Promise.all(searchPromises);
      
      // Sort results by score (descending) and then by creation date (descending)
      searchResults.sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      
      // Apply pagination
      return Neo4jUtils.paginateResults(searchResults, { page, limit });
    } catch (error) {
      logger.error('Error performing full-text search', { error, searchValue, options });
      throw error;
    } finally {
      await session.close();
    }
  }
}
