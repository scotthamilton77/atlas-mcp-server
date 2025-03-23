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
      
      // Create project node
      const query = `
        CREATE (p:${NodeLabels.Project} {
          id: $id,
          name: $name,
          description: $description,
          status: $status,
          urls: $urls,
          completionRequirements: $completionRequirements,
          outputFormat: $outputFormat,
          taskType: $taskType,
          createdAt: $createdAt,
          updatedAt: $updatedAt
        })
        RETURN p
      `;
      
      // Serialize URLs to JSON string if they exist
      const serializedUrls = project.urls ? JSON.stringify(project.urls) : '[]';
      
      const params = {
        id: projectId,
        name: project.name,
        description: project.description,
        status: project.status,
        urls: serializedUrls,
        completionRequirements: project.completionRequirements,
        outputFormat: project.outputFormat,
        taskType: project.taskType,
        createdAt: now,
        updatedAt: now
      };
      
      const result = await session.executeWrite(async (tx) => {
        const result = await tx.run(query, params);
        return result.records;
      });
      
      // Get the raw project from Neo4j
      const rawProject = Neo4jUtils.processRecords<any>(result, 'p')[0];
      
      if (!rawProject) {
        throw new Error('Failed to create project');
      }
      
      // Deserialize URLs from JSON string
      const createdProject: Neo4jProject = {
        ...rawProject,
        urls: rawProject.urls ? JSON.parse(rawProject.urls) : []
      };
      
      logger.info('Project created successfully', { projectId: createdProject.id });
      return createdProject;
    } catch (error) {
      logger.error('Error creating project', { error, project });
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
      const query = `
        MATCH (p:${NodeLabels.Project} {id: $id})
        RETURN p
      `;
      
      const result = await session.executeRead(async (tx) => {
        const result = await tx.run(query, { id });
        return result.records;
      });
      
      const rawProjects = Neo4jUtils.processRecords<any>(result, 'p');
      
      if (rawProjects.length === 0) {
        return null;
      }
      
      // Deserialize URLs from JSON string
      const project: Neo4jProject = {
        ...rawProjects[0],
        urls: rawProjects[0].urls ? JSON.parse(rawProjects[0].urls) : []
      };
      
      return project;
    } catch (error) {
      logger.error('Error getting project by ID', { error, id });
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
      // First check if project exists
      const exists = await Neo4jUtils.nodeExists(NodeLabels.Project, 'id', id);
      
      if (!exists) {
        throw new Error(`Project with ID ${id} not found`);
      }
      
      // Build dynamic update query based on provided fields
      const updateParams: Record<string, any> = {
        id,
        updatedAt: Neo4jUtils.getCurrentTimestamp()
      };
      
      let setClauses = ['p.updatedAt = $updatedAt'];
      
      // Create a modified params object for Neo4j (we'll keep the updates object intact for type safety)
      const processedUpdates: Record<string, any> = {};
      
      // Add update clauses for each provided field
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
          // Special handling for URLs to serialize them
          if (key === 'urls') {
            processedUpdates[key] = JSON.stringify(value);
          } else {
            processedUpdates[key] = value;
          }
          
          updateParams[key] = processedUpdates[key];
          setClauses.push(`p.${key} = $${key}`);
        }
      }
      
      const query = `
        MATCH (p:${NodeLabels.Project} {id: $id})
        SET ${setClauses.join(', ')}
        RETURN p
      `;
      
      const result = await session.executeWrite(async (tx) => {
        const result = await tx.run(query, updateParams);
        return result.records;
      });
      
      // Get the raw project from Neo4j
      const rawProject = Neo4jUtils.processRecords<any>(result, 'p')[0];
      
      if (!rawProject) {
        throw new Error('Failed to update project');
      }
      
      // Deserialize URLs from JSON string
      const updatedProject: Neo4jProject = {
        ...rawProject,
        urls: rawProject.urls ? JSON.parse(rawProject.urls) : []
      };
      
      logger.info('Project updated successfully', { projectId: id });
      return updatedProject;
    } catch (error) {
      logger.error('Error updating project', { error, id, updates });
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
      // Check if project exists
      const exists = await Neo4jUtils.nodeExists(NodeLabels.Project, 'id', id);
      
      if (!exists) {
        return false;
      }
      
      // Delete project along with its tasks and knowledge items
      const query = `
        MATCH (p:${NodeLabels.Project} {id: $id})
        
        // Delete all tasks owned by this project
        OPTIONAL MATCH (p)-[:${RelationshipTypes.CONTAINS_TASK}]->(t:${NodeLabels.Task})
        
        // Delete all knowledge items owned by this project
        OPTIONAL MATCH (p)-[:${RelationshipTypes.CONTAINS_KNOWLEDGE}]->(k:${NodeLabels.Knowledge})
        
        // Delete all project dependency relationships
        OPTIONAL MATCH (p)-[r1:${RelationshipTypes.DEPENDS_ON}]->()
        OPTIONAL MATCH ()-[r2:${RelationshipTypes.DEPENDS_ON}]->(p)
        
        // Delete all other relationships
        OPTIONAL MATCH (p)-[r3]-()
        
        // Delete entities
        DELETE r1, r2, r3, t, k, p
        
        RETURN count(p) as deleted
      `;
      
      const result = await session.executeWrite(async (tx) => {
        return await tx.run(query, { id });
      });
      
      const deletedCount = result.records[0]?.get('deleted');
      const success = deletedCount > 0;
      
      if (success) {
        logger.info('Project deleted successfully', { projectId: id });
      }
      
      return success;
    } catch (error) {
      logger.error('Error deleting project', { error, id });
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
      // Build filter conditions
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
        params.searchTerm = `(?i).*${options.searchTerm}.*`;
        conditions.push('(p.name =~ $searchTerm OR p.description =~ $searchTerm)');
      }
      
      // Construct WHERE clause if needed
      const whereClause = conditions.length > 0 
        ? `WHERE ${conditions.join(' AND ')}` 
        : '';
      
      // Construct query
      const query = `
        MATCH (p:${NodeLabels.Project})
        ${whereClause}
        RETURN p
        ORDER BY p.createdAt DESC
      `;
      
      const result = await session.executeRead(async (tx) => {
        const result = await tx.run(query, params);
        return result.records;
      });
      
      const rawProjects = Neo4jUtils.processRecords<any>(result, 'p');
      
      // Deserialize URLs from JSON strings for all projects
      const projects: Neo4jProject[] = rawProjects.map(project => ({
        ...project,
        urls: project.urls ? JSON.parse(project.urls) : []
      }));
      
      // Apply pagination
      return Neo4jUtils.paginateResults(projects, {
        page: options.page,
        limit: options.limit
      });
    } catch (error) {
      logger.error('Error getting projects', { error, options });
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
      // Check if both projects exist
      const sourceExists = await Neo4jUtils.nodeExists(NodeLabels.Project, 'id', sourceProjectId);
      const targetExists = await Neo4jUtils.nodeExists(NodeLabels.Project, 'id', targetProjectId);
      
      if (!sourceExists) {
        throw new Error(`Source project with ID ${sourceProjectId} not found`);
      }
      
      if (!targetExists) {
        throw new Error(`Target project with ID ${targetProjectId} not found`);
      }
      
      // Check if dependency already exists
      const dependencyExists = await Neo4jUtils.relationshipExists(
        NodeLabels.Project,
        'id',
        sourceProjectId,
        NodeLabels.Project,
        'id',
        targetProjectId,
        RelationshipTypes.DEPENDS_ON
      );
      
      if (dependencyExists) {
        throw new Error(`Dependency relationship already exists between projects ${sourceProjectId} and ${targetProjectId}`);
      }
      
      // Create dependency relationship
      const dependencyId = `dep_${generateId()}`;
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
      logger.error('Error adding project dependency', { 
        error, 
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
        RETURN count(r) as deleted
      `;
      
      const result = await session.executeWrite(async (tx) => {
        return await tx.run(query, { dependencyId });
      });
      
      const deletedCount = result.records[0]?.get('deleted') as number;
      const success = deletedCount > 0;
      
      if (success) {
        logger.info('Project dependency removed successfully', { dependencyId });
      } else {
        logger.warn('Dependency not found for removal', { dependencyId });
      }
      
      return success;
    } catch (error) {
      logger.error('Error removing project dependency', { error, dependencyId });
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
      // Check if project exists
      const exists = await Neo4jUtils.nodeExists(NodeLabels.Project, 'id', projectId);
      
      if (!exists) {
        throw new Error(`Project with ID ${projectId} not found`);
      }
      
      // Get outgoing dependencies (projects this project depends on)
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
      
      // Get incoming dependencies (projects that depend on this project)
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
        session.executeRead(async (tx) => {
          const result = await tx.run(dependenciesQuery, { projectId });
          return result.records;
        }),
        session.executeRead(async (tx) => {
          const result = await tx.run(dependentsQuery, { projectId });
          return result.records;
        })
      ]);
      
      // Process dependencies (outgoing)
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
      
      // Process dependents (incoming)
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
      logger.error('Error getting project dependencies', { error, projectId });
      throw error;
    } finally {
      await session.close();
    }
  }
}
