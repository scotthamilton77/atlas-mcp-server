/**
 * Data fetching module for Neo4j backup service
 */
import { logger } from '../../../utils/logger.js';
import { neo4jDriver } from '../driver.js';
import {
  Neo4jKnowledge,
  Neo4jProject,
  Neo4jTask,
  NodeLabels
} from '../types.js';
import { Neo4jUtils } from '../utils.js';
import { Neo4jRelationship } from './types.js';

/**
 * Responsible for fetching data from Neo4j database for backup purposes
 */
export class DataFetcher {
  /**
   * Fetch all projects from the database
   */
  static async fetchAllProjects(): Promise<Neo4jProject[]> {
    const session = await neo4jDriver.getSession();
    
    try {
      const query = `
        MATCH (p:${NodeLabels.Project})
        RETURN p
        ORDER BY p.createdAt
      `;
      
      const result = await session.executeRead(async (tx) => {
        const result = await tx.run(query);
        return result.records;
      });
      
      return Neo4jUtils.processRecords<Neo4jProject>(result, 'p');
    } catch (error) {
      logger.error('Error fetching projects for backup', { error });
      throw error;
    } finally {
      await session.close();
    }
  }
  
  /**
   * Fetch all tasks from the database
   */
  static async fetchAllTasks(): Promise<Neo4jTask[]> {
    const session = await neo4jDriver.getSession();
    
    try {
      const query = `
        MATCH (t:${NodeLabels.Task})
        RETURN t
        ORDER BY t.createdAt
      `;
      
      const result = await session.executeRead(async (tx) => {
        const result = await tx.run(query);
        return result.records;
      });
      
      return Neo4jUtils.processRecords<Neo4jTask>(result, 't');
    } catch (error) {
      logger.error('Error fetching tasks for backup', { error });
      throw error;
    } finally {
      await session.close();
    }
  }
  
  /**
   * Fetch all knowledge items from the database
   */
  static async fetchAllKnowledge(): Promise<Neo4jKnowledge[]> {
    const session = await neo4jDriver.getSession();
    
    try {
      const query = `
        MATCH (k:${NodeLabels.Knowledge})
        RETURN k
        ORDER BY k.createdAt
      `;
      
      const result = await session.executeRead(async (tx) => {
        const result = await tx.run(query);
        return result.records;
      });
      
      return Neo4jUtils.processRecords<Neo4jKnowledge>(result, 'k');
    } catch (error) {
      logger.error('Error fetching knowledge items for backup', { error });
      throw error;
    } finally {
      await session.close();
    }
  }
  
  /**
   * Fetch all relationships from the database
   */
  static async fetchAllRelationships(): Promise<Neo4jRelationship[]> {
    const session = await neo4jDriver.getSession();
    
    try {
      // Get all the main relationship types between our nodes
      const query = `
        MATCH (a)-[r]->(b)
        WHERE a:${NodeLabels.Project} OR a:${NodeLabels.Task} OR a:${NodeLabels.Knowledge}
        RETURN
          a.id as sourceId,
          labels(a)[0] as sourceLabel,
          type(r) as type,
          b.id as targetId,
          labels(b)[0] as targetLabel,
          properties(r) as properties
        ORDER BY a.id, b.id
      `;
      
      const result = await session.executeRead(async (tx) => {
        const result = await tx.run(query);
        return result.records;
      });
      
      // Convert Neo4j records to relationship objects
      return result.map(record => {
        return {
          sourceId: record.get('sourceId'),
          sourceLabel: record.get('sourceLabel'),
          type: record.get('type'),
          targetId: record.get('targetId'),
          targetLabel: record.get('targetLabel'),
          properties: record.get('properties')
        };
      });
    } catch (error) {
      logger.error('Error fetching relationships for backup', { error });
      throw error;
    } finally {
      await session.close();
    }
  }
}
