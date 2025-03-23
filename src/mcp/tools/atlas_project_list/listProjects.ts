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
 * List projects according to specified filters
 * Supports both detailed view of a single project and paginated listing of projects
 * 
 * @param request The project list request parameters
 * @returns Promise resolving to the project list response
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

    // Validation
    if (mode === 'details' && !id) {
      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        'Project ID is required when using mode="details"'
      );
    }

    // Enforce pagination limits
    const validatedPage = Math.max(1, page);
    const validatedLimit = Math.min(Math.max(1, limit), 100);
    
    let projects: Project[] = [];
    let total = 0;
    let totalPages = 0;

    if (mode === 'details') {
      // Get single project by ID
      const project = await ProjectService.getProjectById(id!);
      
      if (!project) {
        throw new McpError(
          BaseErrorCode.NOT_FOUND,
          `Project with ID ${id} not found`
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

    // Include associated knowledge items if requested
    if (includeKnowledge && projects.length > 0) {
      for (const project of projects) {
        if (mode === 'details') {
          // For details mode, get complete knowledge items
          const knowledgeResult = await KnowledgeService.getKnowledge({
            projectId: project.properties.id,
            page: 1,
            limit: 100 // Reasonable limit for associated items
          });

          project.knowledge = knowledgeResult.data.map(item => ({
            id: item.id,
            text: item.text,
            tags: item.tags,
            domain: item.domain,
            createdAt: item.createdAt
          }));
        } else {
          // For list mode, get abbreviated knowledge items
          const knowledgeResult = await KnowledgeService.getKnowledge({
            projectId: project.properties.id,
            page: 1,
            limit: 5 // Just a few for summary view
          });

          project.knowledge = knowledgeResult.data.map(item => ({
            id: item.id,
            text: item.text.length > 100 ? item.text.substring(0, 100) + '...' : item.text,
            tags: item.tags,
            domain: item.domain,
            createdAt: item.createdAt
          }));
        }
      }
    }

    // Include associated tasks if requested
    if (includeTasks && projects.length > 0) {
      for (const project of projects) {
        if (mode === 'details') {
          // For details mode, get complete task items
          const tasksResult = await TaskService.getTasks({
            projectId: project.properties.id,
            page: 1,
            limit: 100, // Reasonable limit for associated items
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

    logger.info('Projects listed successfully', {
      mode,
      count: projects.length,
      total,
      includeKnowledge,
      includeTasks
    });

    return response;
  } catch (error) {
    logger.error('Error listing projects', { error });
    
    if (error instanceof McpError) {
      throw error;
    }
    
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Failed to list projects: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
