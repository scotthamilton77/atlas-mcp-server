import { McpError } from '../../../types/errors.js';
import { BaseErrorCode } from '../../../types/errors.js';
import { logger } from '../../../utils/logger.js';
import { 
  KnowledgeService,
  ProjectService,
  TaskService
} from '../../../services/neo4j/index.js';
import { Project, ProjectListRequest, ProjectListResponse } from './types.js';

/**
 * Retrieve and filter project entities based on specified criteria
 * Provides two query modes: detailed entity retrieval or paginated collection listing
 * 
 * @param request The project query parameters including filters and pagination controls
 * @returns Promise resolving to structured project entities with optional related resources
 */
export async function listProjects(request: ProjectListRequest): Promise<ProjectListResponse> {
  try {
    const {
      mode = 'all',
      id,
      page = 1,
      limit = 20,
      includeKnowledge = false,
      includeTasks = false,
      taskType,
      status
    } = request;

    // Parameter validation
    if (mode === 'details' && !id) {
      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        'Project identifier is required when using mode="details"'
      );
    }

    // Sanitize pagination parameters
    const validatedPage = Math.max(1, page);
    const validatedLimit = Math.min(Math.max(1, limit), 100);
    
    let projects: Project[] = [];
    let total = 0;
    let totalPages = 0;

    if (mode === 'details') {
      // Retrieve specific project entity by identifier
      const project = await ProjectService.getProjectById(id!);
      
      if (!project) {
        throw new McpError(
          BaseErrorCode.NOT_FOUND,
          `Project with identifier ${id} not found`
        );
      }

      projects = [project as unknown as Project];
      total = 1;
      totalPages = 1;
    } else {
      // Get paginated list of projects with filters
      const projectsResult = await ProjectService.getProjects({
        status,
        taskType,
        page: validatedPage,
        limit: validatedLimit
      });

      projects = projectsResult.data as unknown as Project[];
      total = projectsResult.total;
      totalPages = projectsResult.totalPages;
    }

    // Process knowledge resource associations if requested
    if (includeKnowledge && projects.length > 0) {
      for (const project of projects) {
        if (mode === 'details') {
          // For detailed view, retrieve comprehensive knowledge resources
          const knowledgeResult = await KnowledgeService.getKnowledge({
            projectId: project.properties.id,
            page: 1,
            limit: 100 // Reasonable threshold for associated resources
          });

          // Add debug logging
          logger.info('Knowledge items retrieved', { 
            projectId: project.properties.id,
            count: knowledgeResult.data.length,
            firstItem: knowledgeResult.data[0] ? JSON.stringify(knowledgeResult.data[0]) : 'none'
          });

          // Handle raw Neo4j record structure which includes properties field
          project.knowledge = knowledgeResult.data.map(item => {
            // Neo4j records have a properties field containing the actual data
            // TypeScript doesn't know about this structure since Neo4jKnowledge doesn't include it
            const rawItem = item as any;
            const knowledgeProps = rawItem.properties || rawItem;
            
            // More explicit mapping with debug info
            logger.debug('Processing knowledge item', { 
              id: knowledgeProps.id,
              domain: knowledgeProps.domain,
              textLength: knowledgeProps.text ? knowledgeProps.text.length : 0
            });
            
            return {
              id: knowledgeProps.id,
              text: knowledgeProps.text,
              tags: knowledgeProps.tags,
              domain: knowledgeProps.domain,
              createdAt: knowledgeProps.createdAt
            };
          });
        } else {
          // For list mode, get abbreviated knowledge items
          const knowledgeResult = await KnowledgeService.getKnowledge({
            projectId: project.properties.id,
            page: 1,
            limit: 5 // Just a few for summary view
          });

          project.knowledge = knowledgeResult.data.map(item => {
            // Neo4j records have a properties field containing the actual data
            const rawItem = item as any;
            const knowledgeProps = rawItem.properties || rawItem;
            
            return {
              id: knowledgeProps.id,
              text: knowledgeProps.text && knowledgeProps.text.length > 100 ? 
                    knowledgeProps.text.substring(0, 100) + '...' : 
                    knowledgeProps.text,
              tags: knowledgeProps.tags,
              domain: knowledgeProps.domain,
              createdAt: knowledgeProps.createdAt
            };
          });
        }
      }
    }

    // Process task entity associations if requested
    if (includeTasks && projects.length > 0) {
      for (const project of projects) {
        if (mode === 'details') {
          // For detailed view, retrieve prioritized task entities
          const tasksResult = await TaskService.getTasks({
            projectId: project.properties.id,
            page: 1,
            limit: 100, // Reasonable threshold for associated entities
            sortBy: 'priority',
            sortDirection: 'desc'
          });

          project.tasks = tasksResult.data.map(item => ({
            id: item.id,
            title: item.title,
            status: item.status,
            priority: item.priority,
            createdAt: item.createdAt
          }));
        } else {
          // For list mode, get abbreviated task items
          const tasksResult = await TaskService.getTasks({
            projectId: project.properties.id,
            page: 1,
            limit: 5, // Just a few for summary view
            sortBy: 'priority',
            sortDirection: 'desc'
          });

          project.tasks = tasksResult.data.map(item => ({
            id: item.id,
            title: item.title,
            status: item.status,
            priority: item.priority,
            createdAt: item.createdAt
          }));
        }
      }
    }

    // Construct the response
    const response: ProjectListResponse = {
      projects,
      total,
      page: validatedPage,
      limit: validatedLimit,
      totalPages
    };

    logger.info('Project query executed successfully', {
      mode,
      count: projects.length,
      total,
      includeKnowledge,
      includeTasks
    });

    return response;
  } catch (error) {
    logger.error('Project query execution failed', { error });
    
    if (error instanceof McpError) {
      throw error;
    }
    
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Failed to retrieve project entities: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
