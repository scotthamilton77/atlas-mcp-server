import { Session } from 'neo4j-driver';
import { logger } from '../../utils/logger.js';
import { neo4jDriver } from './driver.js';
import {
  NodeLabels,
  PaginatedResult,
  SearchOptions
} from './types.js';
import { Neo4jUtils } from './utils.js';

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
   * @param options Search options
   * @returns Paginated search results
   */
  static async search(options: SearchOptions): Promise<PaginatedResult<SearchResultItem>> {
    // No longer need session here, helpers will manage their own
    
    try {
      const {
        property = '', // Specific property to search, if provided
        value,
        // Default to project, task, knowledge if not provided, but allow any string
        entityTypes = ['project', 'task', 'knowledge'], 
        caseInsensitive = true,
        fuzzy = false,
        taskType, // Note: taskType filter only applied if 'Project' or 'Task' is in entityTypes
        page = 1,
        limit = 20
      } = options;
      
      if (!value || value.trim() === '') {
        throw new Error('Search value cannot be empty');
      }
      
      // Ensure entityTypes is an array
      const targetLabels = Array.isArray(entityTypes) ? entityTypes : [entityTypes];
      if (targetLabels.length === 0) {
        logger.warn("Unified search called with empty entityTypes array. Returning empty results.");
        return Neo4jUtils.paginateResults([], { page, limit });
      }

      const searchValue = caseInsensitive ? value.toLowerCase() : value;
      const normalizedProperty = property ? property.toLowerCase() : '';
      
      const allResults: SearchResultItem[] = [];
      const searchPromises: Promise<SearchResultItem[]>[] = [];

      // Iterate through the provided labels and build queries dynamically
      for (const label of targetLabels) {
        if (!label || typeof label !== 'string') {
          logger.warn(`Skipping invalid label in entityTypes: ${label}`);
          continue;
        }
        
        // Escape label for safe use in Cypher query
        const escapedLabel = `\`${label.replace(/`/g, '``')}\``;
        
        // Call helper without passing session
        searchPromises.push(
          this.searchSingleLabel(
            // No session argument
            label, 
            escapedLabel, 
            searchValue, 
            normalizedProperty, 
            fuzzy,
            // Only pass taskType filter if the label is Project or Task
            (label.toLowerCase() === 'project' || label.toLowerCase() === 'task') ? taskType : undefined 
          )
        );
      }
      
      // Execute all searches in parallel using Promise.allSettled for robustness
      const settledResults = await Promise.allSettled(searchPromises);
      
      // Process settled results, aggregating only fulfilled promises with valid array values
      settledResults.forEach((result, index) => {
        const label = targetLabels[index]; // Get corresponding label for logging
        // Add an explicit check for truthiness along with Array.isArray
        if (result.status === 'fulfilled' && result.value && Array.isArray(result.value)) { 
          allResults.push(...result.value);
        } else if (result.status === 'rejected') {
          logger.error(`Search promise rejected for label "${label}":`, { reason: result.reason });
          // Continue processing other results
        } else if (result.status === 'fulfilled') {
           // Log if fulfilled but not an array (shouldn't happen with current searchSingleLabel logic)
           logger.warn(`Search promise fulfilled with non-array value for label "${label}":`, { value: result.value });
        }
      });
      
      // Sort combined results by score, then by date
      allResults.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        // Fallback sort if scores are equal (use updatedAt first, then createdAt)
        const dateA = a.updatedAt || a.createdAt || '1970-01-01T00:00:00.000Z';
        const dateB = b.updatedAt || b.createdAt || '1970-01-01T00:00:00.000Z';
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });
      
      return Neo4jUtils.paginateResults(allResults, { page, limit });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error performing unified search', { error: errorMessage, options });
      throw error; // Re-throw original error or a wrapped one
    } 
    // No finally block needed here as session is managed by helpers
  }

  /**
   * Helper to search within a single node label. Acquires and closes its own session.
   * @private
   */
  private static async searchSingleLabel(
    // No session parameter
    labelInput: string, // Rename to avoid confusion with NodeLabels
    escapedLabel: string, // This will be replaced by the correct label
    searchValue: string,
    normalizedProperty: string,
    fuzzy: boolean,
    taskTypeFilter?: string
  ): Promise<SearchResultItem[]> {
    let session: Session | null = null; // Session managed locally
    try {
      session = await neo4jDriver.getSession(); // Acquire session

      // Map lowercase input label to actual NodeLabel
      let actualLabel: NodeLabels | undefined;
      switch (labelInput.toLowerCase()) {
        case 'project': actualLabel = NodeLabels.Project; break;
        case 'task': actualLabel = NodeLabels.Task; break;
        case 'knowledge': actualLabel = NodeLabels.Knowledge; break;
        // Add other cases if search expands beyond these three
        default:
          logger.warn(`Unsupported label provided to searchSingleLabel: ${labelInput}`);
          return []; // Return empty if label is not supported
      }
      
      // Escape the actual label for the query
      const correctlyEscapedLabel = `\`${actualLabel}\``;

      // Prepare searchValue parameter based on fuzzy and caseInsensitive (handled in parent)
      // For non-fuzzy, case-insensitive, we'll use regex for contains check
      const cypherSearchValue = fuzzy 
          ? `(?i).*${searchValue}.*` // Fuzzy, case-insensitive regex
          : `(?i).*${searchValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*`; // Non-fuzzy, case-insensitive contains regex (escape special chars)
          
      const params: Record<string, any> = {
        searchValue: cypherSearchValue, // Use the prepared regex/value
        label: actualLabel // Pass the correct NodeLabel value for use in RETURN clause
      };
      
      let whereConditions: string[] = [];
      
      // Apply taskType filter only if provided AND applicable to this label
      if (taskTypeFilter) {
         whereConditions.push('n.taskType = $taskTypeFilter');
         params.taskTypeFilter = taskTypeFilter;
      }

      // --- Define properties to search ---
      // Prioritize specific property if provided, otherwise search common text fields
      const propertiesToSearch = normalizedProperty 
        ? [normalizedProperty] 
        : ['name', 'title', 'description', 'text']; // Common properties

      let searchConditionParts: string[] = [];
      for (const prop of propertiesToSearch) {
        // Check if property exists before attempting to search it using IS NOT NULL
        const propExistsCheck = `n.\`${prop}\` IS NOT NULL`;
        // Always use =~ with the prepared searchValue parameter
        const searchPart = `toString(n.\`${prop}\`) =~ $searchValue`; // Use toString() for safety with =~
        searchConditionParts.push(`(${propExistsCheck} AND ${searchPart})`);
      }

      if (searchConditionParts.length > 0) {
        whereConditions.push(`(${searchConditionParts.join(' OR ')})`);
      } else {
        // Should not happen if propertiesToSearch is not empty, but as a fallback:
        logger.warn(`No valid properties to search for label ${actualLabel}. Returning empty results for this label.`);
        return [];
      }

      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

      // --- Define scoring logic ---
      // Use the prepared searchValue parameter (which includes (?i) for case-insensitivity)
      const scoreValueParam = '$searchValue'; 
      // Simple scoring: prioritize name/title matches, then description/text
      // Use =~ consistently for comparisons
      let scoringLogic = `
        CASE `;
      if (propertiesToSearch.includes('name')) {
        // Exact match (using regex for case-insensitivity if needed) gets higher score
        // Note: Exact match check might be tricky with the .* wildcards in cypherSearchValue.
        // For simplicity, we'll just check for contains using =~
        scoringLogic += `
          WHEN n.name IS NOT NULL AND toString(n.name) =~ ${scoreValueParam} THEN 8 `; 
      }
       if (propertiesToSearch.includes('title')) {
         scoringLogic += `
          WHEN n.title IS NOT NULL AND toString(n.title) =~ ${scoreValueParam} THEN 8 `;
      }
      if (propertiesToSearch.includes('description')) {
        scoringLogic += `
          WHEN n.description IS NOT NULL AND toString(n.description) =~ ${scoreValueParam} THEN 6 `;
      }
       if (propertiesToSearch.includes('text')) {
        scoringLogic += `
          WHEN n.text IS NOT NULL AND toString(n.text) =~ ${scoreValueParam} THEN 6 `;
      }
      scoringLogic += `
          ELSE 5 
        END AS score
      `;

      // --- Define RETURN clause ---
      // Try to extract common fields, using COALESCE for fallbacks

      // Use the prepared searchValue parameter (which includes (?i) for case-insensitivity)
      const valueParam = '$searchValue';

      const returnClause = `
        RETURN
          n.id AS id,
          $label AS type, // Use the label passed in params
          COALESCE(n.taskType, n.domain, '') AS entityType,
          COALESCE(n.name, n.title, CASE WHEN n.text IS NOT NULL AND size(toString(n.text)) > 50 THEN left(toString(n.text), 50) + '...' ELSE toString(n.text) END, n.id) AS title,
          COALESCE(n.description, n.text) AS description,
          // Determine matched property using =~ and the prepared searchValue
          CASE
            WHEN ${propertiesToSearch.includes('name') ? `n.name IS NOT NULL AND toString(n.name) =~ ${valueParam}` : 'false'} THEN 'name'
            WHEN ${propertiesToSearch.includes('title') ? `n.title IS NOT NULL AND toString(n.title) =~ ${valueParam}` : 'false'} THEN 'title'
            WHEN ${propertiesToSearch.includes('description') ? `n.description IS NOT NULL AND toString(n.description) =~ ${valueParam}` : 'false'} THEN 'description'
            WHEN ${propertiesToSearch.includes('text') ? `n.text IS NOT NULL AND toString(n.text) =~ ${valueParam}` : 'false'} THEN 'text'
            ELSE COALESCE(keys(n)[0], '') // Fallback
          END AS matchedProperty,
          // Get matched value using =~ and the prepared searchValue
           CASE
            WHEN ${propertiesToSearch.includes('name') ? `n.name IS NOT NULL AND toString(n.name) =~ ${valueParam}` : 'false'} THEN n.name
            WHEN ${propertiesToSearch.includes('title') ? `n.title IS NOT NULL AND toString(n.title) =~ ${valueParam}` : 'false'} THEN n.title
            WHEN ${propertiesToSearch.includes('description') ? `n.description IS NOT NULL AND toString(n.description) =~ ${valueParam}` : 'false'} THEN CASE WHEN size(toString(n.description)) > 100 THEN left(toString(n.description), 100) + '...' ELSE toString(n.description) END
            WHEN ${propertiesToSearch.includes('text') ? `n.text IS NOT NULL AND toString(n.text) =~ ${valueParam}` : 'false'} THEN CASE WHEN size(toString(n.text)) > 100 THEN left(toString(n.text), 100) + '...' ELSE toString(n.text) END
            ELSE '' // Fallback
          END AS matchedValue,
          n.createdAt AS createdAt,
          n.updatedAt AS updatedAt,
          // Optionally get projectId and projectName if the node has projectId
          n.projectId AS projectId,
          p.name AS projectName, // Get project name via relationship
          ${scoringLogic}
      `;

      // --- Construct final query ---
      // Use OPTIONAL MATCH for project name in case the node isn't linked or doesn't have projectId
      const query = `
        MATCH (n:${correctlyEscapedLabel}) // Use the correctly escaped actual label
        OPTIONAL MATCH (p:${NodeLabels.Project} {id: n.projectId}) // Optional match for project
        ${whereClause}
        ${returnClause}
        ORDER BY score DESC, COALESCE(n.updatedAt, n.createdAt) DESC
      `;
      
      logger.debug(`Executing search query for label ${actualLabel}`, { query, params }); // Log query and params for debugging
      const result = await session.executeRead(async (tx: any) => (await tx.run(query, params)).records);
      
      // Map results, ensuring score is a number
      return result.map((record: any) => {
        const data = record.toObject();
        // Handle potential Neo4j integer objects for score
        const scoreValue = data.score;
        const score = typeof scoreValue === 'number' ? scoreValue : 
                      (scoreValue && typeof scoreValue.toNumber === 'function' ? scoreValue.toNumber() : 5); // Default score 5
        // Ensure description is string or undefined
        const description = typeof data.description === 'string' ? data.description : undefined;
        return { 
          ...data, 
          score,
          description,
          // Ensure optional fields are undefined if null/missing from query result
          entityType: data.entityType || undefined,
          createdAt: data.createdAt || undefined,
          updatedAt: data.updatedAt || undefined,
          projectId: data.projectId || undefined,
          projectName: data.projectName || undefined,
         } as SearchResultItem;
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Use labelInput here as actualLabel might be undefined if the switch defaulted
      logger.error(`Error searching label ${labelInput}`, { error: errorMessage, searchValue, normalizedProperty }); 
      // Don't throw here, allow other labels to be searched. Log error and return empty array for this label.
      return []; 
    } finally {
       if (session) {
         await session.close(); // Close the locally managed session
       }
    }
  }
  
  // --- Keep fullTextSearch method as is for now ---
  // It relies on specific index names (project_fulltext, etc.)
  // Refactoring it would require a different approach, possibly needing dynamic index querying or a generic index.
  
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
        entityTypes = ['project', 'task', 'knowledge'], // Still defaults to specific types here
        taskType, // Filter specific to project/task
        page = 1,
        limit = 20
      } = options;
      
      if (!searchValue || searchValue.trim() === '') {
        throw new Error('Search value cannot be empty');
      }
      
      // Ensure entityTypes is a valid array for filtering which indexes to query
      const rawEntityTypes = options.entityTypes; // Get potentially undefined value from options
      const defaultEntityTypes = ['project', 'task', 'knowledge'];
      // Use provided types if it's a non-empty array, otherwise use defaults
      const typesToUse = rawEntityTypes && Array.isArray(rawEntityTypes) && rawEntityTypes.length > 0 
                         ? rawEntityTypes 
                         : defaultEntityTypes;
      // Convert to lowercase for consistent checking
      const targetLabels = typesToUse.map(l => l.toLowerCase()); 

      const searchResults: SearchResultItem[] = [];
      const searchPromises: Promise<void>[] = [];
      
      // Project full-text search
      if (targetLabels.includes('project')) {
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
               // Ensure optional fields are handled
               return { 
                 ...data, 
                 score,
                 description: typeof data.description === 'string' ? data.description : undefined,
                 entityType: data.entityType || undefined,
                 createdAt: data.createdAt || undefined,
                 updatedAt: data.updatedAt || undefined,
                 projectId: data.projectId || undefined,
                 projectName: data.projectName || undefined,
               } as SearchResultItem;
            });
            searchResults.push(...items);
          })
        );
      }
      
      // Task full-text search
      if (targetLabels.includes('task')) {
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
                return { 
                 ...data, 
                 score,
                 description: typeof data.description === 'string' ? data.description : undefined,
                 entityType: data.entityType || undefined,
                 createdAt: data.createdAt || undefined,
                 updatedAt: data.updatedAt || undefined,
                 projectId: data.projectId || undefined,
                 projectName: data.projectName || undefined,
               } as SearchResultItem;
            });
            searchResults.push(...items);
          })
        );
      }
      
      // Knowledge full-text search
      if (targetLabels.includes('knowledge')) {
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
                return { 
                 ...data, 
                 score,
                 description: typeof data.description === 'string' ? data.description : undefined,
                 entityType: data.entityType || undefined,
                 createdAt: data.createdAt || undefined,
                 updatedAt: data.updatedAt || undefined,
                 projectId: data.projectId || undefined,
                 projectName: data.projectName || undefined,
               } as SearchResultItem;
            });
            searchResults.push(...items);
          })
        );
      }
      
      await Promise.all(searchPromises);
      
      searchResults.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        // Fallback sort if scores are equal (use updatedAt first, then createdAt)
        const dateA = a.updatedAt || a.createdAt || '1970-01-01T00:00:00.000Z';
        const dateB = b.updatedAt || b.createdAt || '1970-01-01T00:00:00.000Z';
        return new Date(dateB).getTime() - new Date(dateA).getTime();
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
