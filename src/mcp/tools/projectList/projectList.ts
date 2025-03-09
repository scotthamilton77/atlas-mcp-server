import { logger } from "../../../utils/logger.js";
import { createToolResponse } from "../../../types/mcp.js";
import { McpError, BaseErrorCode, ProjectErrorCode } from "../../../types/errors.js";
import { ToolContext } from "../../../utils/security.js";
import { ProjectListInput, ProjectListInputSchema } from "./types.js";

// Import Neo4j service functions
import {
  listProjects,
  getProjectById,
  getProjectNotes,
  getProjectLinks,
  listProjectDependencies,
  listProjectMembers
} from "../../../neo4j/projectService.js";

/**
 * Unified tool for retrieving project information in various formats
 * Consolidates all project resource endpoints into a single tool
 */
export const projectList = async (
  input: unknown,
  context: ToolContext
) => {
  try {
    // Validate input
    const validatedInput = ProjectListInputSchema.parse(input);
    
    logger.info("Project list tool called", { 
      mode: validatedInput.mode, 
      projectId: validatedInput.projectId,
      requestId: context.requestContext?.requestId
    });
    
    // Validate projectId for modes that require it
    if (validatedInput.mode !== "all" && !validatedInput.projectId) {
      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        `The 'projectId' parameter is required for mode '${validatedInput.mode}'`,
        { mode: validatedInput.mode }
      );
    }
    
    // Process based on mode
    const result = await processProjectRequest(validatedInput, context);
    
    logger.info("Project list tool completed successfully", {
      mode: validatedInput.mode,
      resultSize: JSON.stringify(result).length,
      requestId: context.requestContext?.requestId
    });
    
    return createToolResponse(JSON.stringify(result, null, 2));
  } catch (error) {
    // Handle specific error types
    if (error instanceof McpError) {
      throw error;
    }
    
    logger.error("Error in project list tool", { 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      requestId: context.requestContext?.requestId
    });
    
    // Convert to McpError
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Error retrieving project information: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};

/**
 * Process the request based on the requested mode
 */
const processProjectRequest = async (
  input: ProjectListInput,
  context: ToolContext
) => {
  const { mode } = input;
  
  switch (mode) {
    case "all":
      return handleListAllProjects(input);
    
    case "details":
      return handleProjectDetails(input);
    
    case "notes":
      return handleProjectNotes(input);
    
    case "links":
      return handleProjectLinks(input);
    
    case "dependencies":
      return handleProjectDependencies(input);
    
    case "members":
      return handleProjectMembers(input);
    
    default:
      // This shouldn't happen due to enum validation, but for type safety
      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        `Unsupported mode: ${mode}`,
        { supportedModes: ["all", "details", "notes", "links", "dependencies", "members"] }
      );
  }
};

/**
 * Handle 'all' mode - list all projects
 */
const handleListAllProjects = async (input: ProjectListInput) => {
  const options = {
    page: input.page || 1,
    limit: Math.min(input.limit || 10, 100)
  };
  
  const result = await listProjects(options);
  
  return {
    items: result.items,
    total: result.total,
    page: result.page,
    limit: result.limit
  };
};

/**
 * Handle 'details' mode - get project details
 */
const handleProjectDetails = async (input: ProjectListInput) => {
  if (!input.projectId) {
    throw new McpError(
      BaseErrorCode.VALIDATION_ERROR,
      "Project ID is required for details mode"
    );
  }
  
  const projectId = input.projectId;
  const project = await getProjectById(projectId);
  
  if (!project) {
    throw new McpError(
      ProjectErrorCode.PROJECT_NOT_FOUND,
      `Project not found with ID: ${projectId}`
    );
  }
  
  // Create result object
  const result: Record<string, any> = { ...project };
  
  // Add optional related data if requested
  if (input.includeNotes) {
    const notes = await getProjectNotes(projectId);
    result.notes = notes;
  }
  
  if (input.includeLinks) {
    const links = await getProjectLinks(projectId);
    result.links = links;
  }
  
  if (input.includeDependencies) {
    const deps = await listProjectDependencies(projectId);
    result.dependencies = deps;
  }
  
  if (input.includeMembers) {
    const members = await listProjectMembers(projectId);
    result.members = members;
  }
  
  return result;
};

/**
 * Handle 'notes' mode - get project notes
 */
const handleProjectNotes = async (input: ProjectListInput) => {
  if (!input.projectId) {
    throw new McpError(
      BaseErrorCode.VALIDATION_ERROR,
      "Project ID is required for notes mode"
    );
  }
  
  // Note: getProjectNotes doesn't support filtering directly yet
  // This would need to be implemented in the service layer
  const notes = await getProjectNotes(input.projectId);
  
  // Filter notes by tags if specified (client-side filtering for now)
  const filteredNotes = input.tags && input.tags.length > 0
    ? notes.filter(note => 
        note.tags && note.tags.some(tag => input.tags?.includes(tag))
      )
    : notes;
  
  return {
    items: filteredNotes,
    projectId: input.projectId,
    filteredByTags: input.tags && input.tags.length > 0 ? input.tags : undefined,
    totalItems: filteredNotes.length
  };
};

/**
 * Handle 'links' mode - get project links
 */
const handleProjectLinks = async (input: ProjectListInput) => {
  if (!input.projectId) {
    throw new McpError(
      BaseErrorCode.VALIDATION_ERROR,
      "Project ID is required for links mode"
    );
  }
  
  // Note: getProjectLinks doesn't support filtering directly yet
  // This would need to be implemented in the service layer
  const links = await getProjectLinks(input.projectId);
  
  // Filter links by category if specified (client-side filtering for now)
  const filteredLinks = input.category
    ? links.filter(link => link.category === input.category)
    : links;
  
  return {
    items: filteredLinks,
    projectId: input.projectId,
    filteredByCategory: input.category,
    totalItems: filteredLinks.length
  };
};

/**
 * Handle 'dependencies' mode - get project dependencies
 */
const handleProjectDependencies = async (input: ProjectListInput) => {
  if (!input.projectId) {
    throw new McpError(
      BaseErrorCode.VALIDATION_ERROR,
      "Project ID is required for dependencies mode"
    );
  }
  
  const result = await listProjectDependencies(input.projectId);
  
  return {
    projectId: input.projectId,
    dependencies: result.dependencies || [],
    dependents: result.dependents || []
  };
};

/**
 * Handle 'members' mode - get project members
 */
const handleProjectMembers = async (input: ProjectListInput) => {
  if (!input.projectId) {
    throw new McpError(
      BaseErrorCode.VALIDATION_ERROR,
      "Project ID is required for members mode"
    );
  }
  
  const members = await listProjectMembers(input.projectId);
  
  // Filter members by role if specified (client-side filtering for now)
  const filteredMembers = input.role
    ? members.filter(member => member.role === input.role)
    : members;
  
  return {
    items: filteredMembers,
    projectId: input.projectId,
    filteredByRole: input.role,
    totalItems: filteredMembers.length
  };
};