import { logger } from '../../utils/logger.js';
import { neo4jDriver } from './driver.js';
import { NodeLabels, PaginatedResult, PaginationOptions, RelationshipTypes } from './types.js';

/**
 * Database utility functions for Neo4j
 */
export class Neo4jUtils {
  /**
   * Initialize the Neo4j database schema with constraints and indexes
   * Should be called at application startup
   */
  static async initializeSchema(): Promise<void> {
    try {
      logger.info('Initializing Neo4j database schema');
      
      // Create uniqueness constraints
      await Promise.all([
        neo4jDriver.executeQuery(`
          CREATE CONSTRAINT project_id_unique IF NOT EXISTS 
          FOR (p:${NodeLabels.Project}) REQUIRE p.id IS UNIQUE
        `),
        neo4jDriver.executeQuery(`
          CREATE CONSTRAINT task_id_unique IF NOT EXISTS 
          FOR (t:${NodeLabels.Task}) REQUIRE t.id IS UNIQUE
        `),
        neo4jDriver.executeQuery(`
          CREATE CONSTRAINT knowledge_id_unique IF NOT EXISTS 
          FOR (k:${NodeLabels.Knowledge}) REQUIRE k.id IS UNIQUE
        `),
        neo4jDriver.executeQuery(`
          CREATE CONSTRAINT user_id_unique IF NOT EXISTS 
          FOR (u:${NodeLabels.User}) REQUIRE u.id IS UNIQUE
        `),
        neo4jDriver.executeQuery(`
          CREATE CONSTRAINT citation_id_unique IF NOT EXISTS 
          FOR (c:${NodeLabels.Citation}) REQUIRE c.id IS UNIQUE
        `),
        neo4jDriver.executeQuery(`
          CREATE CONSTRAINT tasktype_name_unique IF NOT EXISTS 
          FOR (t:${NodeLabels.TaskType}) REQUIRE t.name IS UNIQUE
        `),
        neo4jDriver.executeQuery(`
          CREATE CONSTRAINT domain_name_unique IF NOT EXISTS 
          FOR (d:${NodeLabels.Domain}) REQUIRE d.name IS UNIQUE
        `)
      ]);
      
      // Note: Skip foreign key constraints for compatibility with older Neo4j versions
      // Instead, we'll use application-level validation
      logger.info('Schema initialization: Skipping foreign key constraints (not supported in this Neo4j version)');
      
      // Create indexes for frequently queried properties
      await Promise.all([
        neo4jDriver.executeQuery(`
          CREATE INDEX project_status IF NOT EXISTS 
          FOR (p:${NodeLabels.Project}) ON (p.status)
        `),
        neo4jDriver.executeQuery(`
          CREATE INDEX project_taskType IF NOT EXISTS 
          FOR (p:${NodeLabels.Project}) ON (p.taskType)
        `),
        neo4jDriver.executeQuery(`
          CREATE INDEX task_status IF NOT EXISTS 
          FOR (t:${NodeLabels.Task}) ON (t.status)
        `),
        neo4jDriver.executeQuery(`
          CREATE INDEX task_priority IF NOT EXISTS 
          FOR (t:${NodeLabels.Task}) ON (t.priority)
        `),
        neo4jDriver.executeQuery(`
          CREATE INDEX task_projectId IF NOT EXISTS 
          FOR (t:${NodeLabels.Task}) ON (t.projectId)
        `),
        neo4jDriver.executeQuery(`
          CREATE INDEX knowledge_projectId IF NOT EXISTS 
          FOR (k:${NodeLabels.Knowledge}) ON (k.projectId)
        `),
        neo4jDriver.executeQuery(`
          CREATE INDEX knowledge_domain IF NOT EXISTS 
          FOR (k:${NodeLabels.Knowledge}) ON (k.domain)
        `)
      ]);
      
      // Create full-text search indexes
      await Promise.all([
        neo4jDriver.executeQuery(`
          CREATE FULLTEXT INDEX project_fulltext IF NOT EXISTS
          FOR (p:${NodeLabels.Project}) ON EACH [p.name, p.description]
        `),
        neo4jDriver.executeQuery(`
          CREATE FULLTEXT INDEX task_fulltext IF NOT EXISTS
          FOR (t:${NodeLabels.Task}) ON EACH [t.title, t.description]
        `),
        neo4jDriver.executeQuery(`
          CREATE FULLTEXT INDEX knowledge_fulltext IF NOT EXISTS
          FOR (k:${NodeLabels.Knowledge}) ON EACH [k.text]
        `)
      ]);
      
      logger.info('Neo4j database schema initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Neo4j database schema', { error });
      throw error;
    }
  }
  
  /**
   * Clear all data from the database and reinitialize the schema
   * WARNING: This permanently deletes all data
   */
  static async clearDatabase(): Promise<void> {
    try {
      logger.warn('Clearing all data from Neo4j database');
      
      // Delete all relationships
      await neo4jDriver.executeQuery('MATCH ()-[r]-() DELETE r');
      
      // Delete all nodes
      await neo4jDriver.executeQuery('MATCH (n) DELETE n');
      
      // Recreate schema
      await this.initializeSchema();
      
      logger.info('Neo4j database cleared successfully');
    } catch (error) {
      logger.error('Failed to clear Neo4j database', { error });
      throw error;
    }
  }
  
  /**
   * Apply pagination to query results
   * @param data Array of data to paginate
   * @param options Pagination options
   * @returns Paginated result object
   */
  static paginateResults<T>(data: T[], options: PaginationOptions = {}): PaginatedResult<T> {
    const page = Math.max(options.page || 1, 1);
    const limit = Math.min(Math.max(options.limit || 20, 1), 100);
    
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedData = data.slice(startIndex, endIndex);
    
    return {
      data: paginatedData,
      total: data.length,
      page,
      limit,
      totalPages: Math.ceil(data.length / limit)
    };
  }
  
  /**
   * Generate a Cypher fragment for array parameters
   * Used for filtering by arrays like tags
   * @param paramName Name of the parameter
   * @param arrayParam Array parameter value
   * @returns Object with cypher fragment and params
   */
  static generateArrayParamQuery(
    paramName: string,
    arrayParam?: string | string[]
  ): { cypher: string; params: Record<string, any> } {
    if (!arrayParam || (Array.isArray(arrayParam) && arrayParam.length === 0)) {
      return { cypher: '', params: {} };
    }
    
    const params: Record<string, any> = {};
    let cypher = '';
    
    if (Array.isArray(arrayParam)) {
      params[paramName] = arrayParam;
      cypher = `ANY(item IN $${paramName} WHERE item IN n.${paramName})`;
    } else {
      params[paramName] = arrayParam;
      cypher = `$${paramName} IN n.${paramName}`;
    }
    
    return { cypher, params };
  }
  
  /**
   * Validate that a node exists in the database
   * @param label Node label
   * @param property Property to check
   * @param value Value to check
   * @returns True if the node exists, false otherwise
   */
  static async nodeExists(
    label: NodeLabels,
    property: string,
    value: string
  ): Promise<boolean> {
    const query = `
      MATCH (n:${label} {${property}: $value})
      RETURN count(n) AS count
    `;
    
    const result = await neo4jDriver.executeReadQuery(query, { value });
    return result[0]?.get('count') > 0;
  }
  
  /**
   * Validate relationships between nodes
   * @param startLabel Label of the start node
   * @param startProperty Property of the start node to check
   * @param startValue Value of the start node property
   * @param endLabel Label of the end node
   * @param endProperty Property of the end node to check
   * @param endValue Value of the end node property 
   * @param relationshipType Type of relationship to check
   * @returns True if the relationship exists, false otherwise
   */
  static async relationshipExists(
    startLabel: NodeLabels,
    startProperty: string,
    startValue: string,
    endLabel: NodeLabels,
    endProperty: string,
    endValue: string,
    relationshipType: RelationshipTypes
  ): Promise<boolean> {
    const query = `
      MATCH (a:${startLabel} {${startProperty}: $startValue})-[r:${relationshipType}]->(b:${endLabel} {${endProperty}: $endValue})
      RETURN count(r) AS count
    `;
    
    const result = await neo4jDriver.executeReadQuery(query, { 
      startValue, 
      endValue 
    });
    
    return result[0]?.get('count') > 0;
  }
  
  /**
   * Generate a timestamp string in ISO format for database operations
   * @returns Current timestamp as ISO string
   */
  static getCurrentTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * Safely parse a JSON string, returning a default value on error
   * @param jsonString The JSON string to parse
   * @param defaultValue The default value to return if parsing fails
   * @returns The parsed object or the default value
   */
  static parseJsonString<T>(jsonString: string | null | undefined, defaultValue: T): T {
    if (!jsonString) {
      return defaultValue;
    }
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      logger.error('Failed to parse JSON string', { error, jsonString });
      return defaultValue;
    }
  }

  /**
   * Process Neo4j result records into a standardized format
   * @param records Neo4j result records
   * @param primaryKey Name of the primary key in the records
   * @returns Processed records as an array of objects
   */
  static processRecords<T>(records: any[], primaryKey: string = 'n'): T[] {
    if (!records || records.length === 0) {
      return [];
    }
    
    return records.map(record => {
      const node = record.get(primaryKey);
      
      if (!node) {
        console.log('Missing node for key:', primaryKey, 'in record:', record);
        return null;
      }
      
      // For Neo4j Node objects with properties method
      if (typeof node.properties === 'function') {
        const props = node.properties();
        console.log('Extracted properties via function:', props);
        
        // Parse any serialized JSON fields
        let result = {...props};
        if (result.urls && typeof result.urls === 'string') {
          try {
            result.urls = JSON.parse(result.urls);
          } catch (e) {
            console.error('Failed to parse URLs JSON:', e);
            result.urls = [];
          }
        }
        
        return result as T;
      }
      
      // For already extracted property objects
      console.log('Using node directly:', node);
      
      // Parse any serialized JSON fields
      let result = {...node};
      if (result.urls && typeof result.urls === 'string') {
        result.urls = this.parseJsonString(result.urls, []);
      }
      
      return result as T;
    }).filter((item): item is T => item !== null);
  }
  
  /**
   * Check if the database is empty (no nodes exist)
   * @returns Promise<boolean> - true if database is empty, false otherwise
   */
  static async isDatabaseEmpty(): Promise<boolean> {
    try {
      const query = `
        MATCH (n)
        RETURN count(n) AS nodeCount
        LIMIT 1
      `;
      
      const result = await neo4jDriver.executeReadQuery(query);
      
      if (!result || result.length === 0) {
        return true;
      }
      
      const nodeCount = result[0]?.get('nodeCount');
      return nodeCount === 0;
    } catch (error) {
      logger.error('Error checking if database is empty', { error });
      // If we can't check, assume it's not empty to be safe
      return false;
    }
  }
}
