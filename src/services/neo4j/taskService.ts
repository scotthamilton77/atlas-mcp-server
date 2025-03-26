import { logger } from '../../utils/logger.js';
import { neo4jDriver } from './driver.js';
import { generateId } from './helpers.js';
import {
  Neo4jTask,
  NodeLabels,
  PaginatedResult,
  RelationshipTypes,
  TaskFilterOptions
} from './types.js';
import { Neo4jUtils } from './utils.js';

/**
 * Service for managing Task entities in Neo4j
 */
export class TaskService {
  /**
   * Create a new task
   * @param task Task data
   * @returns The created task
   */
  static async createTask(task: Omit<Neo4jTask, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Neo4jTask> {
    const session = await neo4jDriver.getSession();
    
    try {
      const projectExists = await Neo4jUtils.nodeExists(NodeLabels.Project, 'id', task.projectId);
      if (!projectExists) {
        throw new Error(`Project with ID ${task.projectId} not found`);
      }
      
      const taskId = task.id || `task_${generateId()}`;
      const now = Neo4jUtils.getCurrentTimestamp();
      
      // Revert to storing urls as JSON string
      const query = `
        MATCH (p:${NodeLabels.Project} {id: $projectId})
        CREATE (t:${NodeLabels.Task} {
          id: $id,
          projectId: $projectId,
          title: $title,
          description: $description,
          priority: $priority,
          status: $status,
          assignedTo: $assignedTo,
          urls: $urls, // Store as JSON string
          tags: $tags,
          completionRequirements: $completionRequirements,
          outputFormat: $outputFormat,
          taskType: $taskType,
          createdAt: $createdAt,
          updatedAt: $updatedAt
        })
        CREATE (p)-[r:${RelationshipTypes.CONTAINS_TASK}]->(t)
        RETURN t.id as id,
               t.projectId as projectId,
               t.title as title,
               t.description as description,
               t.priority as priority,
               t.status as status,
               t.assignedTo as assignedTo,
               t.urls as urls, // Retrieve JSON string
               t.tags as tags,
               t.completionRequirements as completionRequirements,
               t.outputFormat as outputFormat,
               t.taskType as taskType,
               t.createdAt as createdAt,
               t.updatedAt as updatedAt
      `;
      
      // Serialize URLs
      const serializedUrls = JSON.stringify(task.urls || []);

      const params = {
        id: taskId,
        projectId: task.projectId,
        title: task.title,
        description: task.description,
        priority: task.priority,
        status: task.status,
        assignedTo: task.assignedTo || null,
        urls: serializedUrls, // Pass JSON string
        tags: task.tags || [],
        completionRequirements: task.completionRequirements,
        outputFormat: task.outputFormat,
        taskType: task.taskType,
        createdAt: now,
        updatedAt: now
      };
      
      const result = await session.executeWrite(async (tx) => {
        const result = await tx.run(query, params);
        return result.records.length > 0 ? result.records[0].toObject() : null;
      });
            
      if (!result) {
        throw new Error('Failed to create task or retrieve its properties');
      }
      
      // Parse urls back from JSON string
      const createdTaskData = { ...result };
      createdTaskData.urls = Neo4jUtils.parseJsonString(result.urls, []);
      
      logger.info('Task created successfully', { 
        taskId: createdTaskData.id,
        projectId: task.projectId
      });
      
      return createdTaskData as Neo4jTask; // Assert type after construction
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error creating task', { error: errorMessage, task });
      throw error;
    } finally {
      await session.close();
    }
  }
  
  /**
   * Get a task by ID
   * @param id Task ID
   * @returns The task or null if not found
   */
  static async getTaskById(id: string): Promise<Neo4jTask | null> {
    const session = await neo4jDriver.getSession();
    
    try {
      // Retrieve JSON string for urls
      const query = `
        MATCH (t:${NodeLabels.Task} {id: $id})
        RETURN t.id as id,
               t.projectId as projectId,
               t.title as title,
               t.description as description,
               t.priority as priority,
               t.status as status,
               t.assignedTo as assignedTo,
               t.urls as urls, // Retrieve JSON string
               t.tags as tags,
               t.completionRequirements as completionRequirements,
               t.outputFormat as outputFormat,
               t.taskType as taskType,
               t.createdAt as createdAt,
               t.updatedAt as updatedAt
      `;
      
      const result = await session.executeRead(async (tx) => {
        const result = await tx.run(query, { id });
        return result.records;
      });
            
      if (result.length === 0) {
        return null;
      }
      
      // Parse urls back from JSON string
      const recordData = result[0].toObject();
      const taskData = { ...recordData };
      taskData.urls = Neo4jUtils.parseJsonString(recordData.urls, []);
      
      return taskData as Neo4jTask; // Assert type after construction
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error getting task by ID', { error: errorMessage, id });
      throw error;
    } finally {
      await session.close();
    }
  }
  
  /**
   * Update a task
   * @param id Task ID
   * @param updates Task updates
   * @returns The updated task
   */
  static async updateTask(id: string, updates: Partial<Omit<Neo4jTask, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>>): Promise<Neo4jTask> {
    const session = await neo4jDriver.getSession();
    
    try {
      const exists = await Neo4jUtils.nodeExists(NodeLabels.Task, 'id', id);
      if (!exists) {
        throw new Error(`Task with ID ${id} not found`);
      }
      
      const updateParams: Record<string, any> = {
        id,
        updatedAt: Neo4jUtils.getCurrentTimestamp()
      };
      let setClauses = ['t.updatedAt = $updatedAt'];
      
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
          // Serialize urls if present
          if (key === 'urls') {
            updateParams[key] = JSON.stringify(value || []);
          } else {
            updateParams[key] = value; 
          }
          setClauses.push(`t.${key} = $${key}`);
        }
      }
      
      // Retrieve JSON string for urls
      const query = `
        MATCH (t:${NodeLabels.Task} {id: $id})
        SET ${setClauses.join(', ')}
        RETURN t.id as id,
               t.projectId as projectId,
               t.title as title,
               t.description as description,
               t.priority as priority,
               t.status as status,
               t.assignedTo as assignedTo,
               t.urls as urls, // Retrieve JSON string
               t.tags as tags,
               t.completionRequirements as completionRequirements,
               t.outputFormat as outputFormat,
               t.taskType as taskType,
               t.createdAt as createdAt,
               t.updatedAt as updatedAt
      `;
      
      const result = await session.executeWrite(async (tx) => {
        const result = await tx.run(query, updateParams);
        return result.records.length > 0 ? result.records[0].toObject() : null;
      });
            
      if (!result) {
        throw new Error('Failed to update task or retrieve its properties');
      }
      
      // Parse urls back from JSON string
      const updatedTaskData = { ...result };
      updatedTaskData.urls = Neo4jUtils.parseJsonString(result.urls, []);

      logger.info('Task updated successfully', { taskId: id });
      return updatedTaskData as Neo4jTask; // Assert type after construction
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error updating task', { error: errorMessage, id, updates });
      throw error;
    } finally {
      await session.close();
    }
  }
  
  /**
   * Delete a task
   * @param id Task ID
   * @returns True if deleted, false if not found
   */
  static async deleteTask(id: string): Promise<boolean> {
    const session = await neo4jDriver.getSession();
    
    try {
      const exists = await Neo4jUtils.nodeExists(NodeLabels.Task, 'id', id);
      if (!exists) {
        return false;
      }
      
      const query = `
        MATCH (t:${NodeLabels.Task} {id: $id})
        DETACH DELETE t
      `;
      
      await session.executeWrite(async (tx) => {
        await tx.run(query, { id });
      });
      
      logger.info('Task deleted successfully', { taskId: id });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error deleting task', { error: errorMessage, id });
      throw error;
    } finally {
      await session.close();
    }
  }
  
  /**
   * Get tasks for a project with optional filtering and pagination
   * @param options Filter and pagination options
   * @returns Paginated list of tasks
   */
  static async getTasks(options: TaskFilterOptions): Promise<PaginatedResult<Neo4jTask>> {
    const session = await neo4jDriver.getSession();
    
    try {
      let conditions: string[] = ['t.projectId = $projectId'];
      const params: Record<string, any> = {
        projectId: options.projectId
      };
      
      if (options.status) {
        if (Array.isArray(options.status) && options.status.length > 0) {
          params.statusList = options.status;
          conditions.push('t.status IN $statusList');
        } else if (typeof options.status === 'string') {
          params.status = options.status;
          conditions.push('t.status = $status');
        }
      }
      
      if (options.priority) {
        if (Array.isArray(options.priority) && options.priority.length > 0) {
          params.priorityList = options.priority;
          conditions.push('t.priority IN $priorityList');
        } else if (typeof options.priority === 'string') {
          params.priority = options.priority;
          conditions.push('t.priority = $priority');
        }
      }
      
      if (options.assignedTo) {
        params.assignedTo = options.assignedTo;
        conditions.push('t.assignedTo = $assignedTo');
      }
      
      if (options.taskType) {
        params.taskType = options.taskType;
        conditions.push('t.taskType = $taskType');
      }
      
      if (options.tags && options.tags.length > 0) {
        // Use helper for array parameter generation
        const tagQuery = Neo4jUtils.generateArrayInListQuery('t', 'tags', 'tagsList', options.tags);
        if (tagQuery.cypher) {
          conditions.push(tagQuery.cypher);
          Object.assign(params, tagQuery.params);
        }
      }
      
      const sortField = options.sortBy || 'createdAt';
      const sortDirection = options.sortDirection || 'desc';
      const whereClause = `WHERE ${conditions.join(' AND ')}`;
      
      // Retrieve JSON string for urls
      const query = `
        MATCH (t:${NodeLabels.Task})
        ${whereClause}
        RETURN t.id as id,
               t.projectId as projectId,
               t.title as title,
               t.description as description,
               t.priority as priority,
               t.status as status,
               t.assignedTo as assignedTo,
               t.urls as urls, // Retrieve JSON string
               t.tags as tags,
               t.completionRequirements as completionRequirements,
               t.outputFormat as outputFormat,
               t.taskType as taskType,
               t.createdAt as createdAt,
               t.updatedAt as updatedAt
        ORDER BY t.${sortField} ${sortDirection.toUpperCase()}
      `;
      
      const result = await session.executeRead(async (tx) => {
        const result = await tx.run(query, params);
        return result.records;
      });
      
      // Parse urls back from JSON string
      const tasks: Neo4jTask[] = result.map(record => {
        const recordData = record.toObject();
        const taskData = { ...recordData };
        taskData.urls = Neo4jUtils.parseJsonString(recordData.urls, []);
        return taskData as Neo4jTask; // Assert type after construction
      });

      return Neo4jUtils.paginateResults(tasks, {
        page: options.page,
        limit: options.limit
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error getting tasks', { error: errorMessage, options });
      throw error;
    } finally {
      await session.close();
    }
  }
  
  /**
   * Add a dependency relationship between tasks
   * @param sourceTaskId ID of the dependent task (source)
   * @param targetTaskId ID of the dependency task (target)
   * @returns The IDs of the two tasks
   */
  static async addTaskDependency(
    sourceTaskId: string,
    targetTaskId: string
  ): Promise<{ id: string; sourceTaskId: string; targetTaskId: string }> {
    const session = await neo4jDriver.getSession();
    
    try {
      const sourceExists = await Neo4jUtils.nodeExists(NodeLabels.Task, 'id', sourceTaskId);
      const targetExists = await Neo4jUtils.nodeExists(NodeLabels.Task, 'id', targetTaskId);
      
      if (!sourceExists) throw new Error(`Source task with ID ${sourceTaskId} not found`);
      if (!targetExists) throw new Error(`Target task with ID ${targetTaskId} not found`);
      
      const dependencyExists = await Neo4jUtils.relationshipExists(
        NodeLabels.Task, 'id', sourceTaskId,
        NodeLabels.Task, 'id', targetTaskId,
        RelationshipTypes.DEPENDS_ON
      );
      
      if (dependencyExists) {
        throw new Error(`Dependency relationship already exists between tasks ${sourceTaskId} and ${targetTaskId}`);
      }
      
      const circularDependencyQuery = `
        MATCH path = (target:${NodeLabels.Task} {id: $targetTaskId})-[:${RelationshipTypes.DEPENDS_ON}*]->(source:${NodeLabels.Task} {id: $sourceTaskId})
        RETURN count(path) > 0 AS hasCycle
      `;
      
      const cycleCheckResult = await session.executeRead(async (tx) => {
        const result = await tx.run(circularDependencyQuery, { sourceTaskId, targetTaskId });
        return result.records[0]?.get('hasCycle');
      });
      
      if (cycleCheckResult) {
        throw new Error('Adding this dependency would create a circular dependency chain');
      }
      
      const dependencyId = `tdep_${generateId()}`;
      const query = `
        MATCH (source:${NodeLabels.Task} {id: $sourceTaskId}),
              (target:${NodeLabels.Task} {id: $targetTaskId})
        CREATE (source)-[r:${RelationshipTypes.DEPENDS_ON} {
          id: $dependencyId,
          createdAt: $createdAt
        }]->(target)
        RETURN r.id as id, source.id as sourceTaskId, target.id as targetTaskId
      `;
      
      const params = {
        sourceTaskId,
        targetTaskId,
        dependencyId,
        createdAt: Neo4jUtils.getCurrentTimestamp()
      };
      
      const result = await session.executeWrite(async (tx) => {
        const result = await tx.run(query, params);
        return result.records;
      });
      
      if (!result || result.length === 0) {
        throw new Error('Failed to create task dependency relationship');
      }
      
      const record = result[0];
      const dependency = {
        id: record.get('id'),
        sourceTaskId: record.get('sourceTaskId'),
        targetTaskId: record.get('targetTaskId')
      };
      
      logger.info('Task dependency added successfully', { sourceTaskId, targetTaskId });
      return dependency;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error adding task dependency', { error: errorMessage, sourceTaskId, targetTaskId });
      throw error;
    } finally {
      await session.close();
    }
  }
  
  /**
   * Remove a dependency relationship between tasks
   * @param dependencyId The ID of the dependency relationship to remove
   * @returns True if removed, false if not found
   */
  static async removeTaskDependency(dependencyId: string): Promise<boolean> {
    const session = await neo4jDriver.getSession();
    
    try {
      const query = `
        MATCH (source:${NodeLabels.Task})-[r:${RelationshipTypes.DEPENDS_ON} {id: $dependencyId}]->(target:${NodeLabels.Task})
        DELETE r
      `;
      
      const result = await session.executeWrite(async (tx) => {
        const res = await tx.run(query, { dependencyId });
        return res.summary.counters.updates().relationshipsDeleted > 0;
      });
            
      if (result) {
        logger.info('Task dependency removed successfully', { dependencyId });
      } else {
        logger.warn('Task dependency not found or not removed', { dependencyId });
      }
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error removing task dependency', { error: errorMessage, dependencyId });
      throw error;
    } finally {
      await session.close();
    }
  }
  
  /**
   * Get task dependencies (both dependencies and dependents)
   * @param taskId Task ID
   * @returns Object containing dependencies and dependents
   */
  static async getTaskDependencies(taskId: string): Promise<{
    dependencies: {
      id: string; // Relationship ID
      taskId: string; // Target Task ID
      title: string;
      status: string;
      priority: string;
    }[];
    dependents: {
      id: string; // Relationship ID
      taskId: string; // Source Task ID
      title: string;
      status: string;
      priority: string;
    }[];
  }> {
    const session = await neo4jDriver.getSession();
    
    try {
      const exists = await Neo4jUtils.nodeExists(NodeLabels.Task, 'id', taskId);
      if (!exists) {
        throw new Error(`Task with ID ${taskId} not found`);
      }
      
      const dependenciesQuery = `
        MATCH (source:${NodeLabels.Task} {id: $taskId})-[r:${RelationshipTypes.DEPENDS_ON}]->(target:${NodeLabels.Task})
        RETURN r.id as id, // Return relationship ID
               target.id AS taskId, 
               target.title AS title,
               target.status AS status,
               target.priority AS priority
        ORDER BY target.priority DESC, target.title
      `;
      
      const dependentsQuery = `
        MATCH (source:${NodeLabels.Task})-[r:${RelationshipTypes.DEPENDS_ON}]->(target:${NodeLabels.Task} {id: $taskId})
        RETURN r.id as id, // Return relationship ID
               source.id AS taskId, 
               source.title AS title,
               source.status AS status,
               source.priority AS priority
        ORDER BY source.priority DESC, source.title
      `;
      
      const [dependenciesResult, dependentsResult] = await Promise.all([
        session.executeRead(async (tx) => (await tx.run(dependenciesQuery, { taskId })).records),
        session.executeRead(async (tx) => (await tx.run(dependentsQuery, { taskId })).records)
      ]);
      
      const dependencies = dependenciesResult.map(record => ({
        id: record.get('id'), // Relationship ID
        taskId: record.get('taskId'),
        title: record.get('title'),
        status: record.get('status'),
        priority: record.get('priority')
      }));
      
      const dependents = dependentsResult.map(record => ({
        id: record.get('id'), // Relationship ID
        taskId: record.get('taskId'),
        title: record.get('title'),
        status: record.get('status'),
        priority: record.get('priority')
      }));
      
      return { dependencies, dependents };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error getting task dependencies', { error: errorMessage, taskId });
      throw error;
    } finally {
      await session.close();
    }
  }
  
  /**
   * Assign a task to a user
   * @param taskId Task ID
   * @param userId User ID
   * @returns The updated task
   */
  static async assignTask(taskId: string, userId: string): Promise<Neo4jTask> {
    const session = await neo4jDriver.getSession();
    
    try {
      const taskExists = await Neo4jUtils.nodeExists(NodeLabels.Task, 'id', taskId);
      if (!taskExists) throw new Error(`Task with ID ${taskId} not found`);
      
      const userExists = await Neo4jUtils.nodeExists(NodeLabels.User, 'id', userId);
      if (!userExists) throw new Error(`User with ID ${userId} not found`); 
      
      const query = `
        MATCH (t:${NodeLabels.Task} {id: $taskId}), (u:${NodeLabels.User} {id: $userId})
        
        OPTIONAL MATCH (t)-[r:${RelationshipTypes.ASSIGNED_TO}]->(:${NodeLabels.User})
        DELETE r
        
        CREATE (t)-[:${RelationshipTypes.ASSIGNED_TO}]->(u)
        
        SET t.assignedTo = $userId,
            t.updatedAt = $updatedAt
        
        RETURN t.id as id,
               t.projectId as projectId,
               t.title as title,
               t.description as description,
               t.priority as priority,
               t.status as status,
               t.assignedTo as assignedTo,
               t.urls as urls, // Retrieve JSON string
               t.tags as tags,
               t.completionRequirements as completionRequirements,
               t.outputFormat as outputFormat,
               t.taskType as taskType,
               t.createdAt as createdAt,
               t.updatedAt as updatedAt
      `;
      
      const params = {
        taskId,
        userId,
        updatedAt: Neo4jUtils.getCurrentTimestamp()
      };
      
      const result = await session.executeWrite(async (tx) => {
        const result = await tx.run(query, params);
        return result.records.length > 0 ? result.records[0].toObject() : null;
      });
            
      if (!result) {
        throw new Error('Failed to assign task or retrieve its properties');
      }
      
      // Parse urls back from JSON string
      const updatedTaskData = { ...result };
      updatedTaskData.urls = Neo4jUtils.parseJsonString(result.urls, []);
      
      logger.info('Task assigned successfully', { taskId, userId });
      return updatedTaskData as Neo4jTask; // Assert type after construction
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error assigning task', { error: errorMessage, taskId, userId });
      throw error;
    } finally {
      await session.close();
    }
  }
  
  /**
   * Unassign a task from its current assignee
   * @param taskId Task ID
   * @returns The updated task
   */
  static async unassignTask(taskId: string): Promise<Neo4jTask> {
    const session = await neo4jDriver.getSession();
    
    try {
      const taskExists = await Neo4jUtils.nodeExists(NodeLabels.Task, 'id', taskId);
      if (!taskExists) throw new Error(`Task with ID ${taskId} not found`);
      
      const query = `
        MATCH (t:${NodeLabels.Task} {id: $taskId})
        
        OPTIONAL MATCH (t)-[r:${RelationshipTypes.ASSIGNED_TO}]->(:${NodeLabels.User})
        DELETE r
        
        SET t.assignedTo = null,
            t.updatedAt = $updatedAt
        
        RETURN t.id as id,
               t.projectId as projectId,
               t.title as title,
               t.description as description,
               t.priority as priority,
               t.status as status,
               t.assignedTo as assignedTo,
               t.urls as urls, // Retrieve JSON string
               t.tags as tags,
               t.completionRequirements as completionRequirements,
               t.outputFormat as outputFormat,
               t.taskType as taskType,
               t.createdAt as createdAt,
               t.updatedAt as updatedAt
      `;
      
      const params = {
        taskId,
        updatedAt: Neo4jUtils.getCurrentTimestamp()
      };
      
      const result = await session.executeWrite(async (tx) => {
        const result = await tx.run(query, params);
        return result.records.length > 0 ? result.records[0].toObject() : null;
      });
            
      if (!result) {
        throw new Error('Failed to unassign task or retrieve its properties');
      }
      
      // Parse urls back from JSON string
      const updatedTaskData = { ...result };
      updatedTaskData.urls = Neo4jUtils.parseJsonString(result.urls, []);
      
      logger.info('Task unassigned successfully', { taskId });
      return updatedTaskData as Neo4jTask; // Assert type after construction
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error unassigning task', { error: errorMessage, taskId });
      throw error;
    } finally {
      await session.close();
    }
  }
}
