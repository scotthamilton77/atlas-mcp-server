import { logger } from '../../../utils/logger.js';
import { getProjectNotes as getProjectNotesDb, getProjectById } from '../../../neo4j/projectService.js';
import { 
  ProjectNotesResourceResponse, 
  ProjectNotesParamsSchema,
  ProjectNotesQuerySchema,
  ProjectNotesResourceData
} from './types.js';
import { McpError, BaseErrorCode, ProjectErrorCode } from '../../../types/errors.js';

export const getProjectNotes = async (
  uri: URL,
  variables: Record<string, unknown>
): Promise<ProjectNotesResourceResponse> => {
  try {
    // Validate URI parameters
    const validatedParams = ProjectNotesParamsSchema.parse(variables);
    
    // Parse and validate query parameters
    const queryParams: Record<string, string | number> = {};
    uri.searchParams.forEach((value, key) => {
      if (key === 'limit') {
        queryParams[key] = parseInt(value, 10);
      } else {
        queryParams[key] = value;
      }
    });

    const validatedQuery = ProjectNotesQuerySchema.parse(queryParams);

    logger.info("Getting project notes", { 
      projectId: validatedParams.projectId,
      query: validatedQuery,
      uri: uri.href
    });

    // First verify the project exists
    const project = await getProjectById(validatedParams.projectId);
    if (!project) {
      throw new McpError(
        ProjectErrorCode.PROJECT_NOT_FOUND,
        `Project with ID ${validatedParams.projectId} not found`,
        { projectId: validatedParams.projectId }
      );
    }

    // Get all notes for the project
    const allNotes = await getProjectNotesDb(validatedParams.projectId);

    // Apply filtering
    let filteredNotes = allNotes;
    
    if (validatedQuery.tag) {
      filteredNotes = filteredNotes.filter(note => 
        note.tags?.includes(validatedQuery.tag!)
      );
    }

    if (validatedQuery.since) {
      const sinceDate = new Date(validatedQuery.since);
      filteredNotes = filteredNotes.filter(note => 
        new Date(note.timestamp) > sinceDate
      );
    }

    // Apply sorting
    const sortOrder = validatedQuery.sortOrder === 'desc' ? -1 : 1;
    filteredNotes.sort((a, b) => {
      // Both sortBy options use the timestamp field since notes only have one timestamp
      const aDate = new Date(a.timestamp);
      const bDate = new Date(b.timestamp);
      return sortOrder * (aDate.getTime() - bDate.getTime());
    });

    // Apply limit
    const limitedNotes = filteredNotes.slice(0, validatedQuery.limit);

    // Collect metadata
    const allTags = Array.from(new Set(
      allNotes.flatMap(note => note.tags || [])
    )).sort();

    const timestamps = allNotes.map(note => new Date(note.timestamp).getTime());
    const oldestNote = timestamps.length ? new Date(Math.min(...timestamps)).toISOString() : undefined;
    const newestNote = timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : undefined;

    // Format the resource data
    const resourceData: ProjectNotesResourceData = {
      notes: {
        items: limitedNotes,
        total: allNotes.length,
        filtered: filteredNotes.length
      },
      metadata: {
        projectId: validatedParams.projectId,
        tags: allTags.length > 0 ? allTags : undefined,
        oldestNote,
        newestNote
      },
      query: {
        tag: validatedQuery.tag,
        since: validatedQuery.since,
        limit: validatedQuery.limit,
        sortBy: validatedQuery.sortBy,
        sortOrder: validatedQuery.sortOrder
      },
      fetchedAt: new Date().toISOString()
    };

    logger.info("Project notes retrieved successfully", { 
      projectId: validatedParams.projectId,
      total: allNotes.length,
      filtered: filteredNotes.length,
      returned: limitedNotes.length
    });

    return {
      contents: [{
        uri: uri.href,
        text: JSON.stringify(resourceData, null, 2),
        mimeType: "application/json"
      }],
      _type: "resource_response"
    };
  } catch (error) {
    // Handle specific error cases
    if (error instanceof McpError) {
      throw error;
    }

    logger.error("Error getting project notes", { 
      error: error instanceof Error ? error.message : 'Unknown error',
      projectId: variables.projectId,
      uri: uri.href
    });

    // Convert other errors to McpError
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Error getting project notes: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { projectId: variables.projectId }
    );
  }
};