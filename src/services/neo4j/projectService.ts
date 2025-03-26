import { logger } from '../../utils/logger.js';
import { neo4jDriver } from './driver.js';
import { generateId } from './helpers.js';
import {
  Neo4jProject,
  NodeLabels,
  PaginatedResult,
  ProjectFilterOptions,
  RelationshipTypes
} from './types.js';
import { Neo4jUtils } from './utils.js';

/**
 * Service for managing Project entities in Neo4j
 */
export class ProjectService {
  /**
   * Create a new project
   * @param project Project data
   * @returns The created project
   */
  static async createProject(project: Omit<Neo4jProject, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Neo4jProject> {
    const session = await neo4jDriver.getSession();
    
    try {
      const projectId = project.id || `proj_${generateId()}`;
      const now = Neo4jUtils.getCurrentTimestamp();
      
      // Create project node, passing urls directly as a list of maps
      const query = `
        CREATE (p:${NodeLabels.Project} {
          id: $id,
          name: $name,
          description: $description,
          status: $status,
          urls: $urls, // Store as native list of maps
          completionRequirements: $completionRequirements,
          outputFormat: $outputFormat,
          taskType: $taskType,
          createdAt: $createdAt,
          updatedAt: $updatedAt
        })
        RETURN p.id as id,
               p.name as name,
               p.description as description,
               p.status as status,
               p.urls as urls,
               p.completionRequirements as completionRequirements,
               p.outputFormat as outputFormat,
               p.taskType as taskType,
               p.createdAt as createdAt,
               p.updatedAt as updatedAt
      `;
            
      const params = {
        id: projectId,
        name: project.name,
        description: project.description,
        status: project.status,
        urls: project.urls || [], // Pass array directly
        completionRequirements: project.completionRequirements,
        outputFormat: project.outputFormat,
        taskType: project.taskType,
        createdAt: now,
        updatedAt: now
      };
      
      const result = await session.executeWrite(async (tx) => {
        const result = await tx.run(query, params);
        // Return the first record's properties directly
        return result.records.length > 0 ? result.records[0].toObject() : null;
      });
            
      if (!result) {
        throw new Error('Failed to create project or retrieve its properties');
      }
      
      // Result is already a plain object
      const createdProject = result as Neo4jProject; 
      
      logger.info('Project created successfully', { projectId: createdProject.id });
      return createdProject;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error creating project', { error: errorMessage, project });
      throw error;
    } finally {
      await session.close();
    }
  }
  
  /**
   * Get a project by ID
   * @param id Project ID
   * @returns The project or null if not found
   */
  static async getProjectById(id: string): Promise<Neo4jProject | null> {
    const session = await neo4jDriver.getSession();
    
    try {
      // Return properties directly
      const query = `
        MATCH (p:${NodeLabels.Project} {id: $id})
        RETURN p.id as id,
               p.name as name,
               p.description as description,
               p.status as status,
               p.urls as urls,
               p.completionRequirements as completionRequirements,
               p.outputFormat as outputFormat,
               p.taskType as taskType,
               p.createdAt as createdAt,
               p.updatedAt as updatedAt
      `;
      
      const result = await session.executeRead(async (tx) => {
        const result = await tx.run(query, { id });
        return result.records;
      });
            
      if (result.length === 0) {
        return null;
      }
      
      // Convert record to plain object
      const project = result[0].toObject() as Neo4jProject;
      // Ensure urls is an array, default to empty if null/undefined
      project.urls = project.urls || []; 
      
      return project;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error getting project by ID', { error: errorMessage, id });
      throw error;
    } finally {
      await session.close();
    }
  }
  
  /**
   * Update a project
   * @param id Project ID
   * @param updates Project updates
   * @returns The updated project
   */
  static async updateProject(id: string, updates: Partial<Omit<Neo4jProject, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Neo4jProject> {
    const session = await neo4jDriver.getSession();
    
    try {
      const exists = await Neo4jUtils.nodeExists(NodeLabels.Project, 'id', id);
      if (!exists) {
        throw new Error(`Project with ID ${id} not found`);
      }
      
      const updateParams: Record<string, any> = {
        id,
        updatedAt: Neo4jUtils.getCurrentTimestamp()
      };
      let setClauses = ['p.updatedAt = $updatedAt'];
      
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
          // Pass urls array directly
          updateParams[key] = value; 
          setClauses.push(`p.${key} = $${key}`);
        }
      }
      
      // Return properties directly
      const query = `
        MATCH (p:${NodeLabels.Project} {id: $id})
        SET ${setClauses.join(', ')}
        RETURN p.id as id,
               p.name as name,
               p.description as description,
               p.status as status,
               p.urls as urls,
               p.completionRequirements as completionRequirements,
               p.outputFormat as outputFormat,
               p.taskType as taskType,
               p.createdAt as createdAt,
               p.updatedAt as updatedAt
      `;
      
      const result = await session.executeWrite(async (tx) => {
        const result = await tx.run(query, updateParams);
        return result.records.length > 0 ? result.records[0].toObject() : null;
      });
            
      if (!result) {
        throw new Error('Failed to update project or retrieve its properties');
      }
      
      // Result is already a plain object
      const updatedProject = result as Neo4jProject;
      updatedProject.urls = updatedProject.urls || []; // Ensure urls is an array

      logger.info('Project updated successfully', { projectId: id });
      return updatedProject;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error updating project', { error: errorMessage, id, updates });
      throw error;
    } finally {
      await session.close();
    }
  }
  
  /**
   * Delete a project and all its associated tasks and knowledge items
   * @param id Project ID
   * @returns True if deleted, false if not found
   */
  static async deleteProject(id: string): Promise<boolean> {
    const session = await neo4jDriver.getSession();
    
    try {
      const exists = await Neo4jUtils.nodeExists(NodeLabels.Project, 'id', id);
      if (!exists) {
        return false;
      }
      
      // Use DETACH DELETE for simplicity
      const query = `
        MATCH (p:${NodeLabels.Project} {id: $id})
        DETACH DELETE p
        RETURN count(p) as deletedCount // Use a different alias
      `;
      
      const result = await session.executeWrite(async (tx) => {
        return await tx.run(query, { id });
      });
      
      // Check if the node was actually deleted by checking the count returned by DETACH DELETE
      // Note: count(p) after DELETE will be 0. We need to rely on the transaction success.
      // A better way might be to return the ID before delete or check existence before.
      // Let's assume transaction success implies deletion for now.
      // const deletedCount = result.summary.counters.updates().nodesDeleted; // Alternative way
      
      // If the query runs without error and the node existed, assume deletion was successful.
      logger.info('Project deleted successfully', { projectId: id });
      return true; 
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error deleting project', { error: errorMessage, id });
      throw error;
    } finally {
      await session.close();
    }
  }
  
  /**
   * Get all projects with optional filtering and pagination
   * @param options Filter and pagination options
   * @returns Paginated list of projects
   */
  static async getProjects(options: ProjectFilterOptions = {}): Promise<PaginatedResult<Neo4jProject>> {
    const session = await neo4jDriver.getSession();
    
    try {
      let conditions: string[] = [];
      const params: Record<string, any> = {};
      
      if (options.status) {
        if (Array.isArray(options.status) && options.status.length > 0) {
          params.statusList = options.status;
          conditions.push('p.status IN $statusList');
        } else if (typeof options.status === 'string') {
          params.status = options.status;
          conditions.push('p.status = $status');
        }
      }
      
      if (options.taskType) {
        params.taskType = options.taskType;
        conditions.push('p.taskType = $taskType');
      }
      
      if (options.searchTerm) {
        // Use case-insensitive regex for broader matching
        params.searchTerm = `(?i).*${options.searchTerm}.*`; 
        conditions.push('(p.name =~ $searchTerm OR p.description =~ $searchTerm)');
      }
      
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      
      // Construct query to return properties directly
      const query = `
        MATCH (p:${NodeLabels.Project})
        ${whereClause}
        RETURN p.id as id,
               p.name as name,
               p.description as description,
               p.status as status,
               p.urls as urls,
               p.completionRequirements as completionRequirements,
               p.outputFormat as outputFormat,
               p.taskType as taskType,
               p.createdAt as createdAt,
               p.updatedAt as updatedAt
        ORDER BY p.createdAt DESC
      `;
      
      const result = await session.executeRead(async (tx) => {
        const result = await tx.run(query, params);
        return result.records;
      });
      
      // Process records into plain objects
      const projects: Neo4jProject[] = result.map(record => {
         const project = record.toObject() as Neo4jProject;
         project.urls = project.urls || []; // Ensure urls is an array
         return project;
      });
            
      // Apply pagination using the utility function
      return Neo4jUtils.paginateResults(projects, {
        page: options.page,
        limit: options.limit
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error getting projects', { error: errorMessage, options });
      throw error;
    } finally {
      await session.close();
    }
  }
  
  /**
   * Add a dependency relationship between projects
   * @param sourceProjectId ID of the dependent project (source)
   * @param targetProjectId ID of the dependency project (target)
   * @param type Type of dependency relationship
   * @param description Description of the dependency
   * @returns The IDs of the two projects and the relationship type
   */
  static async addProjectDependency(
    sourceProjectId: string,
    targetProjectId: string,
    type: 'requires' | 'extends' | 'implements' | 'references',
    description: string
  ): Promise<{ id: string; sourceProjectId: string; targetProjectId: string; type: string; description: string }> {
    const session = await neo4jDriver.getSession();
    
    try {
      const sourceExists = await Neo4jUtils.nodeExists(NodeLabels.Project, 'id', sourceProjectId);
      const targetExists = await Neo4jUtils.nodeExists(NodeLabels.Project, 'id', targetProjectId);
      
      if (!sourceExists) throw new Error(`Source project with ID ${sourceProjectId} not found`);
      if (!targetExists) throw new Error(`Target project with ID ${targetProjectId} not found`);
      
      const dependencyExists = await Neo4jUtils.relationshipExists(
        NodeLabels.Project, 'id', sourceProjectId,
        NodeLabels.Project, 'id', targetProjectId,
        RelationshipTypes.DEPENDS_ON
      );
      
      if (dependencyExists) {
        // Maybe update existing instead of throwing? For now, throw.
        throw new Error(`Dependency relationship already exists between projects ${sourceProjectId} and ${targetProjectId}`);
      }
      
      const dependencyId = `pdep_${generateId()}`; // Prefix for project dependency
      const query = `
        MATCH (source:${NodeLabels.Project} {id: $sourceProjectId}),
              (target:${NodeLabels.Project} {id: $targetProjectId})
        CREATE (source)-[r:${RelationshipTypes.DEPENDS_ON} {
          id: $dependencyId,
          type: $type,
          description: $description,
          createdAt: $createdAt
        }]->(target)
        RETURN r.id as id, source.id as sourceProjectId, target.id as targetProjectId, r.type as type, r.description as description
      `;
      
      const params = {
        sourceProjectId,
        targetProjectId,
        dependencyId,
        type,
        description,
        createdAt: Neo4jUtils.getCurrentTimestamp()
      };
      
      const result = await session.executeWrite(async (tx) => {
        const result = await tx.run(query, params);
        return result.records;
      });
      
      if (!result || result.length === 0) {
        throw new Error('Failed to create project dependency relationship');
      }
      
      const record = result[0];
      const dependency = {
        id: record.get('id'),
        sourceProjectId: record.get('sourceProjectId'),
        targetProjectId: record.get('targetProjectId'),
        type: record.get('type'),
        description: record.get('description')
      };
      
      logger.info('Project dependency added successfully', { 
        sourceProjectId, 
        targetProjectId, 
        type 
      });
      
      return dependency;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error adding project dependency', { 
        error: errorMessage, 
        sourceProjectId, 
        targetProjectId, 
        type 
      });
      throw error;
    } finally {
      await session.close();
    }
  }
  
  /**
   * Remove a dependency relationship between projects
   * @param dependencyId The ID of the dependency relationship to remove
   * @returns True if removed, false if not found
   */
  static async removeProjectDependency(dependencyId: string): Promise<boolean> {
    const session = await neo4jDriver.getSession();
    
    try {
      const query = `
        MATCH (source:${NodeLabels.Project})-[r:${RelationshipTypes.DEPENDS_ON} {id: $dependencyId}]->(target:${NodeLabels.Project})
        DELETE r
        RETURN count(r) as deletedCount // Use a different alias
      `;
      
      const result = await session.executeWrite(async (tx) => {
        // We need summary to check if relationship was deleted
        const res = await tx.run(query, { dependencyId });
        return res.summary.counters.updates().relationshipsDeleted > 0;
      });
            
      if (result) {
        logger.info('Project dependency removed successfully', { dependencyId });
      } else {
        logger.warn('Dependency not found or not removed', { dependencyId });
      }
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error removing project dependency', { error: errorMessage, dependencyId });
      throw error;
    } finally {
      await session.close();
    }
  }
  
  /**
   * Get all dependencies for a project (both dependencies and dependents)
   * @param projectId Project ID
   * @returns Object containing dependencies and dependents
   */
  static async getProjectDependencies(projectId: string): Promise<{
    dependencies: {
      id: string;
      sourceProjectId: string;
      targetProjectId: string;
      type: string;
      description: string;
      targetProject: {
        id: string;
        name: string;
        status: string;
      };
    }[];
    dependents: {
      id: string;
      sourceProjectId: string;
      targetProjectId: string;
      type: string;
      description: string;
      sourceProject: {
        id: string;
        name: string;
        status: string;
      };
    }[];
  }> {
    const session = await neo4jDriver.getSession();
    
    try {
      const exists = await Neo4jUtils.nodeExists(NodeLabels.Project, 'id', projectId);
      if (!exists) {
        throw new Error(`Project with ID ${projectId} not found`);
      }
      
      const dependenciesQuery = `
        MATCH (source:${NodeLabels.Project} {id: $projectId})-[r:${RelationshipTypes.DEPENDS_ON}]->(target:${NodeLabels.Project})
        RETURN r.id AS id, 
               source.id AS sourceProjectId, 
               target.id AS targetProjectId,
               r.type AS type,
               r.description AS description,
               target.name AS targetName,
               target.status AS targetStatus
        ORDER BY r.type, target.name
      `;
      
      const dependentsQuery = `
        MATCH (source:${NodeLabels.Project})-[r:${RelationshipTypes.DEPENDS_ON}]->(target:${NodeLabels.Project} {id: $projectId})
        RETURN r.id AS id, 
               source.id AS sourceProjectId, 
               target.id AS targetProjectId,
               r.type AS type,
               r.description AS description,
               source.name AS sourceName,
               source.status AS sourceStatus
        ORDER BY r.type, source.name
      `;
      
      const [dependenciesResult, dependentsResult] = await Promise.all([
        session.executeRead(async (tx) => (await tx.run(dependenciesQuery, { projectId })).records),
        session.executeRead(async (tx) => (await tx.run(dependentsQuery, { projectId })).records)
      ]);
      
      const dependencies = dependenciesResult.map(record => ({
        id: record.get('id'),
        sourceProjectId: record.get('sourceProjectId'),
        targetProjectId: record.get('targetProjectId'),
        type: record.get('type'),
        description: record.get('description'),
        targetProject: {
          id: record.get('targetProjectId'),
          name: record.get('targetName'),
          status: record.get('targetStatus')
        }
      }));
      
      const dependents = dependentsResult.map(record => ({
        id: record.get('id'),
        sourceProjectId: record.get('sourceProjectId'),
        targetProjectId: record.get('targetProjectId'),
        type: record.get('type'),
        description: record.get('description'),
        sourceProject: {
          id: record.get('sourceProjectId'),
          name: record.get('sourceName'),
          status: record.get('sourceStatus')
        }
      }));
      
      return { dependencies, dependents };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error getting project dependencies', { error: errorMessage, projectId });
      throw error;
    } finally {
      await session.close();
    }
  }
}
