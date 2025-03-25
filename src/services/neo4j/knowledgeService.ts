import { logger } from '../../utils/logger.js';
import { neo4jDriver } from './driver.js';
import { generateId } from './helpers.js';
import {
  KnowledgeFilterOptions,
  Neo4jKnowledge,
  NodeLabels,
  PaginatedResult,
  RelationshipTypes
} from './types.js';
import { Neo4jUtils } from './utils.js';

/**
 * Service for managing Knowledge entities in Neo4j
 */
export class KnowledgeService {
  /**
   * Add a new knowledge item
   * @param knowledge Knowledge data
   * @returns The created knowledge item
   */
  static async addKnowledge(knowledge: Omit<Neo4jKnowledge, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Neo4jKnowledge> {
    const session = await neo4jDriver.getSession();
    
    try {
      // Check if the project exists
      const projectExists = await Neo4jUtils.nodeExists(NodeLabels.Project, 'id', knowledge.projectId);
      
      if (!projectExists) {
        throw new Error(`Project with ID ${knowledge.projectId} not found`);
      }
      
      const knowledgeId = knowledge.id || `know_${generateId()}`;
      const now = Neo4jUtils.getCurrentTimestamp();
      
      // Create knowledge node and relationship to project
      const query = `
        MATCH (p:${NodeLabels.Project} {id: $projectId})
        CREATE (k:${NodeLabels.Knowledge} {
          id: $id,
          projectId: $projectId,
          text: $text,
          tags: $tags,
          domain: $domain,
          citations: $citations,
          createdAt: $createdAt,
          updatedAt: $updatedAt
        })
        CREATE (p)-[r:${RelationshipTypes.CONTAINS_KNOWLEDGE}]->(k)
        
        // Create domain relationship if domain node exists, otherwise create it
        MERGE (d:${NodeLabels.Domain} {name: $domain})
        ON CREATE SET d.createdAt = $createdAt
        CREATE (k)-[:${RelationshipTypes.BELONGS_TO_DOMAIN}]->(d)
        
        RETURN k
      `;
      
      const params = {
        id: knowledgeId,
        projectId: knowledge.projectId,
        text: knowledge.text,
        tags: knowledge.tags || [],
        domain: knowledge.domain,
        citations: knowledge.citations || [],
        createdAt: now,
        updatedAt: now
      };
      
      const result = await session.executeWrite(async (tx) => {
        const result = await tx.run(query, params);
        return result.records;
      });
      
      const createdKnowledge = Neo4jUtils.processRecords<Neo4jKnowledge>(result, 'k')[0];
      
      if (!createdKnowledge) {
        throw new Error('Failed to create knowledge item');
      }
      
      // Process citations if provided
      if (knowledge.citations && knowledge.citations.length > 0) {
        await this.addCitations(knowledgeId, knowledge.citations);
      }
      
      logger.info('Knowledge item created successfully', { 
        knowledgeId: createdKnowledge.id,
        projectId: knowledge.projectId
      });
      
      return createdKnowledge;
    } catch (error) {
      logger.error('Error creating knowledge item', { error, knowledge });
      throw error;
    } finally {
      await session.close();
    }
  }
  
  /**
   * Get a knowledge item by ID
   * @param id Knowledge ID
   * @returns The knowledge item or null if not found
   */
  static async getKnowledgeById(id: string): Promise<Neo4jKnowledge | null> {
    const session = await neo4jDriver.getSession();
    
    try {
      const query = `
        MATCH (k:${NodeLabels.Knowledge} {id: $id})
        RETURN k.id as id,
               k.projectId as projectId,
               k.text as text,
               k.tags as tags,
               k.domain as domain,
               k.citations as citations,
               k.createdAt as createdAt,
               k.updatedAt as updatedAt
      `;
      
      const result = await session.executeRead(async (tx) => {
        const result = await tx.run(query, { id });
        return result.records;
      });
      
      if (result.length === 0) {
        return null;
      }
      const record = result[0];
      const knowledge: Neo4jKnowledge = {
        id: record.get('id'),
        projectId: record.get('projectId'),
        text: record.get('text'),
        tags: record.get('tags') || [],
        domain: record.get('domain'),
        citations: record.get('citations') || [], // Citations are stored as string array
        createdAt: record.get('createdAt'),
        updatedAt: record.get('updatedAt')
      };
      return knowledge;
    } catch (error) {
      logger.error('Error getting knowledge by ID', { error, id });
      throw error;
    } finally {
      await session.close();
    }
  }
  
  /**
   * Update a knowledge item
   * @param id Knowledge ID
   * @param updates Knowledge updates
   * @returns The updated knowledge item
   */
  static async updateKnowledge(id: string, updates: Partial<Omit<Neo4jKnowledge, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>>): Promise<Neo4jKnowledge> {
    const session = await neo4jDriver.getSession();
    
    try {
      // First check if knowledge exists
      const exists = await Neo4jUtils.nodeExists(NodeLabels.Knowledge, 'id', id);
      
      if (!exists) {
        throw new Error(`Knowledge with ID ${id} not found`);
      }
      
      // Build dynamic update query based on provided fields
      const updateParams: Record<string, any> = {
        id,
        updatedAt: Neo4jUtils.getCurrentTimestamp()
      };
      
      let setClauses = ['k.updatedAt = $updatedAt'];
      
      // Add update clauses for each provided field
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
          updateParams[key] = value;
          setClauses.push(`k.${key} = $${key}`);
        }
      }
      
      // Special handling for domain update to maintain relationships
      let domainClause = '';
      if (updates.domain) {
        updateParams.domain = updates.domain;
        domainClause = `
          // Update domain relationship
          WITH k
          OPTIONAL MATCH (k)-[oldDomainRel:${RelationshipTypes.BELONGS_TO_DOMAIN}]->(:${NodeLabels.Domain})
          DELETE oldDomainRel
          MERGE (newDomain:${NodeLabels.Domain} {name: $domain})
          CREATE (k)-[:${RelationshipTypes.BELONGS_TO_DOMAIN}]->(newDomain)
        `;
      }
      
      const query = `
        MATCH (k:${NodeLabels.Knowledge} {id: $id})
        SET ${setClauses.join(', ')}
        ${domainClause}
        RETURN k
      `;
      
      const result = await session.executeWrite(async (tx) => {
        const result = await tx.run(query, updateParams);
        return result.records;
      });
      
      const updatedKnowledge = Neo4jUtils.processRecords<Neo4jKnowledge>(result, 'k')[0];
      
      if (!updatedKnowledge) {
        throw new Error('Failed to update knowledge item');
      }
      
      // Update citations if provided
      if (updates.citations) {
        // Remove existing citations
        await session.executeWrite(async (tx) => {
          await tx.run(`
            MATCH (k:${NodeLabels.Knowledge} {id: $id})-[r:${RelationshipTypes.CITES}]->(:${NodeLabels.Citation})
            DELETE r
          `, { id });
        });
        
        // Add new citations
        if (updates.citations.length > 0) {
          await this.addCitations(id, updates.citations);
        }
      }
      
      logger.info('Knowledge item updated successfully', { knowledgeId: id });
      return updatedKnowledge;
    } catch (error) {
      logger.error('Error updating knowledge item', { error, id, updates });
      throw error;
    } finally {
      await session.close();
    }
  }
  
  /**
   * Delete a knowledge item
   * @param id Knowledge ID
   * @returns True if deleted, false if not found
   */
  static async deleteKnowledge(id: string): Promise<boolean> {
    const session = await neo4jDriver.getSession();
    
    try {
      // Check if knowledge exists
      const exists = await Neo4jUtils.nodeExists(NodeLabels.Knowledge, 'id', id);
      
      if (!exists) {
        return false;
      }
      
      // Delete knowledge and all its relationships
      const query = `
        MATCH (k:${NodeLabels.Knowledge} {id: $id})
        
        // Delete domain relationship
        OPTIONAL MATCH (k)-[r1:${RelationshipTypes.BELONGS_TO_DOMAIN}]->(:${NodeLabels.Domain})
        
        // Delete citation relationships
        OPTIONAL MATCH (k)-[r2:${RelationshipTypes.CITES}]->(:${NodeLabels.Citation})
        
        // Delete all other relationships
        OPTIONAL MATCH (k)-[r3]-()
        OPTIONAL MATCH ()-[r4]->(k)
        
        // Delete knowledge
        DELETE r1, r2, r3, r4, k
        
        RETURN count(k) as deleted
      `;
      
      const result = await session.executeWrite(async (tx) => {
        return await tx.run(query, { id });
      });
      
      const deletedCount = result.records[0]?.get('deleted');
      const success = deletedCount > 0;
      
      if (success) {
        logger.info('Knowledge item deleted successfully', { knowledgeId: id });
      }
      
      return success;
    } catch (error) {
      logger.error('Error deleting knowledge item', { error, id });
      throw error;
    } finally {
      await session.close();
    }
  }
  
  /**
   * Get knowledge items for a project with optional filtering and pagination
   * @param options Filter and pagination options
   * @returns Paginated list of knowledge items
   */
  static async getKnowledge(options: KnowledgeFilterOptions): Promise<PaginatedResult<Neo4jKnowledge>> {
    const session = await neo4jDriver.getSession();
    
    try {
      // Build filter conditions
      let conditions: string[] = ['k.projectId = $projectId'];
      const params: Record<string, any> = {
        projectId: options.projectId
      };
      
      if (options.domain) {
        params.domain = options.domain;
        conditions.push('k.domain = $domain');
      }
      
      // Handle tags filtering
      if (options.tags && options.tags.length > 0) {
        params.tagsList = options.tags;
        conditions.push('ANY(tag IN $tagsList WHERE tag IN k.tags)');
      }
      
      // Handle text search
      if (options.search) {
        params.search = `(?i).*${options.search}.*`;
        conditions.push('k.text =~ $search');
      }
      
      // Construct WHERE clause
      const whereClause = `WHERE ${conditions.join(' AND ')}`;
      
      // Construct query
      const query = `
        MATCH (k:${NodeLabels.Knowledge})
        ${whereClause}
        RETURN k.id as id,
               k.projectId as projectId,
               k.text as text,
               k.tags as tags,
               k.domain as domain,
               k.citations as citations,
               k.createdAt as createdAt,
               k.updatedAt as updatedAt
        ORDER BY k.createdAt DESC
      `;
      
      const result = await session.executeRead(async (tx) => {
        const result = await tx.run(query, params);
        return result.records;
      });
      
      const knowledge: Neo4jKnowledge[] = result.map(record => ({
        id: record.get('id'),
        projectId: record.get('projectId'),
        text: record.get('text'),
        tags: record.get('tags') || [],
        domain: record.get('domain'),
        citations: record.get('citations') || [], // Citations are stored as string array
        createdAt: record.get('createdAt'),
        updatedAt: record.get('updatedAt')
      }));

      // Apply pagination
      return Neo4jUtils.paginateResults(knowledge, {
        page: options.page,
        limit: options.limit
      });
    } catch (error) {
      logger.error('Error getting knowledge items', { error, options });
      throw error;
    } finally {
      await session.close();
    }
  }
  
  /**
   * Get all available domains with item counts
   * @returns Array of domains with counts
   */
  static async getDomains(): Promise<Array<{ name: string; count: number }>> {
    const session = await neo4jDriver.getSession();
    
    try {
      const query = `
        MATCH (d:${NodeLabels.Domain})<-[:${RelationshipTypes.BELONGS_TO_DOMAIN}]-(k:${NodeLabels.Knowledge})
        RETURN d.name AS name, count(k) AS count
        ORDER BY count DESC, name
      `;
      
      const result = await session.executeRead(async (tx) => {
        const result = await tx.run(query);
        return result.records;
      });
      
      return result.map(record => ({
        name: record.get('name'),
        count: record.get('count').toNumber()
      }));
    } catch (error) {
      logger.error('Error getting domains', { error });
      throw error;
    } finally {
      await session.close();
    }
  }
  
  /**
   * Get all unique tags used across knowledge items with counts
   * @param projectId Optional project ID to filter tags
   * @returns Array of tags with counts
   */
  static async getTags(projectId?: string): Promise<Array<{ tag: string; count: number }>> {
    const session = await neo4jDriver.getSession();
    
    try {
      let whereClause = '';
      const params: Record<string, any> = {};
      
      if (projectId) {
        whereClause = 'WHERE k.projectId = $projectId';
        params.projectId = projectId;
      }
      
      const query = `
        MATCH (k:${NodeLabels.Knowledge})
        ${whereClause}
        UNWIND k.tags AS tag
        RETURN tag, count(*) AS count
        ORDER BY count DESC, tag
      `;
      
      const result = await session.executeRead(async (tx) => {
        const result = await tx.run(query, params);
        return result.records;
      });
      
      return result.map(record => ({
        tag: record.get('tag'),
        count: record.get('count').toNumber()
      }));
    } catch (error) {
      logger.error('Error getting tags', { error, projectId });
      throw error;
    } finally {
      await session.close();
    }
  }
  
  /**
   * Add citations to a knowledge item
   * @param knowledgeId Knowledge ID
   * @param citations Array of citation strings
   * @returns The citation IDs
   * @private
   */
  private static async addCitations(knowledgeId: string, citations: string[]): Promise<string[]> {
    const session = await neo4jDriver.getSession();
    
    try {
      const citationIds: string[] = [];
      
      // Process each citation
      for (const citation of citations) {
        const citationId = `cite_${generateId()}`;
        citationIds.push(citationId);
        
        // Create citation and relationship
        await session.executeWrite(async (tx) => {
          await tx.run(`
            MATCH (k:${NodeLabels.Knowledge} {id: $knowledgeId})
            CREATE (c:${NodeLabels.Citation} {
              id: $citationId,
              source: $citation,
              createdAt: $createdAt
            })
            CREATE (k)-[:${RelationshipTypes.CITES}]->(c)
          `, {
            knowledgeId,
            citationId,
            citation,
            createdAt: Neo4jUtils.getCurrentTimestamp()
          });
        });
      }
      
      return citationIds;
    } catch (error) {
      logger.error('Error adding citations', { error, knowledgeId, citations });
      throw error;
    } finally {
      await session.close();
    }
  }
}
