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
      // Check if the project exists
      const projectExists = await Neo4jUtils.nodeExists(NodeLabels.Project, 'id', task.projectId);
      
      if (!projectExists) {
        throw new Error(`Project with ID ${task.projectId} not found`);
      }
      
      const taskId = task.id || `task_${generateId()}`;
      const now = Neo4jUtils.getCurrentTimestamp();
      
      // Create task node and relationship to project
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
          urls: $urls,
          tags: $tags,
          completionRequirements: $completionRequirements,
          outputFormat: $outputFormat,
          taskType: $taskType,
          createdAt: $createdAt,
          updatedAt: $updatedAt
        })
        CREATE (p)-[r:${RelationshipTypes.CONTAINS_TASK}]->(t)
        RETURN t
      `;
      
      const params = {
        id: taskId,
        projectId: task.projectId,
        title: task.title,
        description: task.description,
        priority: task.priority,
        status: task.status,
        assignedTo: task.assignedTo || null,
        urls: task.urls || [],
        tags: task.tags || [],
        completionRequirements: task.completionRequirements,
        outputFormat: task.outputFormat,
        taskType: task.taskType,
        createdAt: now,
        updatedAt: now
      };
      
      const result = await session.executeWrite(async (tx) => {
        const result = await tx.run(query, params);
        return result.records;
      });
      
      const createdTask = Neo4jUtils.processRecords<Neo4jTask>(result, 't')[0];
      
      if (!createdTask) {
        throw new Error('Failed to create task');
      }
      
      logger.info('Task created successfully', { 
        taskId: createdTask.id,
        projectId: task.projectId
      });
      
      return createdTask;
    } catch (error) {
      logger.error('Error creating task', { error, task });
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
      const query = `
        MATCH (t:${NodeLabels.Task} {id: $id})
        RETURN t
      `;
      
      const result = await session.executeRead(async (tx) => {
        const result = await tx.run(query, { id });
        return result.records;
      });
      
      const tasks = Neo4jUtils.processRecords<Neo4jTask>(result, 't');
      return tasks.length > 0 ? tasks[0] : null;
    } catch (error) {
      logger.error('Error getting task by ID', { error, id });
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
      // First check if task exists
      const exists = await Neo4jUtils.nodeExists(NodeLabels.Task, 'id', id);
      
      if (!exists) {
        throw new Error(`Task with ID ${id} not found`);
      }
      
      // Build dynamic update query based on provided fields
      const updateParams: Record<string, any> = {
        id,
        updatedAt: Neo4jUtils.getCurrentTimestamp()
      };
      
      let setClauses = ['t.updatedAt = $updatedAt'];
      
      // Add update clauses for each provided field
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
          updateParams[key] = value;
          setClauses.push(`t.${key} = $${key}`);
        }
      }
      
      const query = `
        MATCH (t:${NodeLabels.Task} {id: $id})
        SET ${setClauses.join(', ')}
        RETURN t
      `;
      
      const result = await session.executeWrite(async (tx) => {
        const result = await tx.run(query, updateParams);
        return result.records;
      });
      
      const updatedTask = Neo4jUtils.processRecords<Neo4jTask>(result, 't')[0];
      
      if (!updatedTask) {
        throw new Error('Failed to update task');
      }
      
      logger.info('Task updated successfully', { taskId: id });
      return updatedTask;
    } catch (error) {
      logger.error('Error updating task', { error, id, updates });
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
      // Check if task exists
      const exists = await Neo4jUtils.nodeExists(NodeLabels.Task, 'id', id);
      
      if (!exists) {
        return false;
      }
      
      // Delete task and all its relationships
      const query = `
        MATCH (t:${NodeLabels.Task} {id: $id})
        
        // Delete all task dependency relationships
        OPTIONAL MATCH (t)-[r1:${RelationshipTypes.DEPENDS_ON}]->()
        OPTIONAL MATCH ()-[r2:${RelationshipTypes.DEPENDS_ON}]->(t)
        
        // Delete all other relationships
        OPTIONAL MATCH (t)-[r3]-()
        OPTIONAL MATCH ()-[r4]->(t)
        
        // Delete task
        DELETE r1, r2, r3, r4, t
        
        RETURN count(t) as deleted
      `;
      
      const result = await session.executeWrite(async (tx) => {
        return await tx.run(query, { id });
      });
      
      const deletedCount = result.records[0]?.get('deleted');
      const success = deletedCount > 0;
      
      if (success) {
        logger.info('Task deleted successfully', { taskId: id });
      }
      
      return success;
    } catch (error) {
      logger.error('Error deleting task', { error, id });
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
      // Build filter conditions
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
      
      // Handle tags filtering
      if (options.tags && options.tags.length > 0) {
        const { cypher, params: tagParams } = Neo4jUtils.generateArrayParamQuery('tags', options.tags);
        if (cypher) {
          conditions.push(cypher);
          Object.assign(params, tagParams);
        }
      }
      
      // Determine sort field and direction
      const sortField = options.sortBy || 'createdAt';
      const sortDirection = options.sortDirection || 'desc';
      
      // Construct WHERE clause
      const whereClause = `WHERE ${conditions.join(' AND ')}`;
      
      // Construct query
      const query = `
        MATCH (t:${NodeLabels.Task})
        ${whereClause}
        RETURN t
        ORDER BY t.${sortField} ${sortDirection.toUpperCase()}
      `;
      
      const result = await session.executeRead(async (tx) => {
        const result = await tx.run(query, params);
        return result.records;
      });
      
      const tasks = Neo4jUtils.processRecords<Neo4jTask>(result, 't');
      
      // Apply pagination
      return Neo4jUtils.paginateResults(tasks, {
        page: options.page,
        limit: options.limit
      });
    } catch (error) {
      logger.error('Error getting tasks', { error, options });
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
      // Check if both tasks exist
      const sourceExists = await Neo4jUtils.nodeExists(NodeLabels.Task, 'id', sourceTaskId);
      const targetExists = await Neo4jUtils.nodeExists(NodeLabels.Task, 'id', targetTaskId);
      
      if (!sourceExists) {
        throw new Error(`Source task with ID ${sourceTaskId} not found`);
      }
      
      if (!targetExists) {
        throw new Error(`Target task with ID ${targetTaskId} not found`);
      }
      
      // Check if dependency already exists
      const dependencyExists = await Neo4jUtils.relationshipExists(
        NodeLabels.Task,
        'id',
        sourceTaskId,
        NodeLabels.Task,
        'id',
        targetTaskId,
        RelationshipTypes.DEPENDS_ON
      );
      
      if (dependencyExists) {
        throw new Error(`Dependency relationship already exists between tasks ${sourceTaskId} and ${targetTaskId}`);
      }
      
      // Detect circular dependencies
      const circularDependencyQuery = `
        MATCH path = (target:${NodeLabels.Task} {id: $targetTaskId})-[:${RelationshipTypes.DEPENDS_ON}*]->(source:${NodeLabels.Task} {id: $sourceTaskId})
        RETURN count(path) > 0 AS hasCycle
      `;
      
      const cycleCheckResult = await session.executeRead(async (tx) => {
        const result = await tx.run(circularDependencyQuery, { 
          sourceTaskId, 
          targetTaskId 
        });
        return result.records[0]?.get('hasCycle');
      });
      
      if (cycleCheckResult) {
        throw new Error('Adding this dependency would create a circular dependency chain');
      }
      
      // Create dependency relationship
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
      
      logger.info('Task dependency added successfully', { 
        sourceTaskId, 
        targetTaskId 
      });
      
      return dependency;
    } catch (error) {
      logger.error('Error adding task dependency', { 
        error, 
        sourceTaskId, 
        targetTaskId 
      });
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
        RETURN count(r) as deleted
      `;
      
      const result = await session.executeWrite(async (tx) => {
        return await tx.run(query, { dependencyId });
      });
      
      const deletedCount = result.records[0]?.get('deleted') as number;
      const success = deletedCount > 0;
      
      if (success) {
        logger.info('Task dependency removed successfully', { dependencyId });
      } else {
        logger.warn('Task dependency not found for removal', { dependencyId });
      }
      
      return success;
    } catch (error) {
      logger.error('Error removing task dependency', { error, dependencyId });
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
      id: string;
      taskId: string;
      title: string;
      status: string;
      priority: string;
    }[];
    dependents: {
      id: string;
      taskId: string;
      title: string;
      status: string;
      priority: string;
    }[];
  }> {
    const session = await neo4jDriver.getSession();
    
    try {
      // Check if task exists
      const exists = await Neo4jUtils.nodeExists(NodeLabels.Task, 'id', taskId);
      
      if (!exists) {
        throw new Error(`Task with ID ${taskId} not found`);
      }
      
      // Get outgoing dependencies (tasks this task depends on)
      const dependenciesQuery = `
        MATCH (source:${NodeLabels.Task} {id: $taskId})-[r:${RelationshipTypes.DEPENDS_ON}]->(target:${NodeLabels.Task})
        RETURN target.id AS taskId, 
               target.title AS title,
               target.status AS status,
               target.priority AS priority
        ORDER BY target.priority DESC, target.title
      `;
      
      // Get incoming dependencies (tasks that depend on this task)
      const dependentsQuery = `
        MATCH (source:${NodeLabels.Task})-[r:${RelationshipTypes.DEPENDS_ON}]->(target:${NodeLabels.Task} {id: $taskId})
        RETURN source.id AS taskId, 
               source.title AS title,
               source.status AS status,
               source.priority AS priority
        ORDER BY source.priority DESC, source.title
      `;
      
      const [dependenciesResult, dependentsResult] = await Promise.all([
        session.executeRead(async (tx) => {
          const result = await tx.run(dependenciesQuery, { taskId });
          return result.records;
        }),
        session.executeRead(async (tx) => {
          const result = await tx.run(dependentsQuery, { taskId });
          return result.records;
        })
      ]);
      
      // Process dependencies (outgoing)
      const dependencies = dependenciesResult.map(record => ({
        id: record.get('taskId'),
        taskId: record.get('taskId'),
        title: record.get('title'),
        status: record.get('status'),
        priority: record.get('priority')
      }));
      
      // Process dependents (incoming)
      const dependents = dependentsResult.map(record => ({
        id: record.get('taskId'),
        taskId: record.get('taskId'),
        title: record.get('title'),
        status: record.get('status'),
        priority: record.get('priority')
      }));
      
      return { dependencies, dependents };
    } catch (error) {
      logger.error('Error getting task dependencies', { error, taskId });
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
      // Check if the task exists
      const taskExists = await Neo4jUtils.nodeExists(NodeLabels.Task, 'id', taskId);
      
      if (!taskExists) {
        throw new Error(`Task with ID ${taskId} not found`);
      }
      
      // Check if the user exists
      const userExists = await Neo4jUtils.nodeExists(NodeLabels.User, 'id', userId);
      
      if (!userExists) {
        throw new Error(`User with ID ${userId} not found`);
      }
      
      // Assign the task to the user
      const query = `
        MATCH (t:${NodeLabels.Task} {id: $taskId}), (u:${NodeLabels.User} {id: $userId})
        
        // Remove previous assignment if exists
        OPTIONAL MATCH (t)-[r:${RelationshipTypes.ASSIGNED_TO}]->(:${NodeLabels.User})
        DELETE r
        
        // Create new assignment
        CREATE (t)-[:${RelationshipTypes.ASSIGNED_TO}]->(u)
        
        // Update task assignedTo field
        SET t.assignedTo = $userId,
            t.updatedAt = $updatedAt
        
        RETURN t
      `;
      
      const params = {
        taskId,
        userId,
        updatedAt: Neo4jUtils.getCurrentTimestamp()
      };
      
      const result = await session.executeWrite(async (tx) => {
        const result = await tx.run(query, params);
        return result.records;
      });
      
      const updatedTask = Neo4jUtils.processRecords<Neo4jTask>(result, 't')[0];
      
      if (!updatedTask) {
        throw new Error('Failed to assign task');
      }
      
      logger.info('Task assigned successfully', { 
        taskId, 
        userId 
      });
      
      return updatedTask;
    } catch (error) {
      logger.error('Error assigning task', { error, taskId, userId });
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
      // Check if the task exists
      const taskExists = await Neo4jUtils.nodeExists(NodeLabels.Task, 'id', taskId);
      
      if (!taskExists) {
        throw new Error(`Task with ID ${taskId} not found`);
      }
      
      // Unassign the task
      const query = `
        MATCH (t:${NodeLabels.Task} {id: $taskId})
        
        // Remove assignment relationship
        OPTIONAL MATCH (t)-[r:${RelationshipTypes.ASSIGNED_TO}]->(:${NodeLabels.User})
        DELETE r
        
        // Update task
        SET t.assignedTo = null,
            t.updatedAt = $updatedAt
        
        RETURN t
      `;
      
      const params = {
        taskId,
        updatedAt: Neo4jUtils.getCurrentTimestamp()
      };
      
      const result = await session.executeWrite(async (tx) => {
        const result = await tx.run(query, params);
        return result.records;
      });
      
      const updatedTask = Neo4jUtils.processRecords<Neo4jTask>(result, 't')[0];
      
      if (!updatedTask) {
        throw new Error('Failed to unassign task');
      }
      
      logger.info('Task unassigned successfully', { taskId });
      
      return updatedTask;
    } catch (error) {
      logger.error('Error unassigning task', { error, taskId });
      throw error;
    } finally {
      await session.close();
    }
  }
}
