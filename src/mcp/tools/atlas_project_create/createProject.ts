import { ProjectService } from '../../../services/neo4j/projectService.js';
import { ProjectDependencyType } from '../../../services/neo4j/types.js'; // Import the enum
import { BaseErrorCode, McpError, ProjectErrorCode } from "../../../types/errors.js";
import { ResponseFormat, createToolResponse } from "../../../types/mcp.js";
import { logger, requestContextService } from "../../../utils/index.js"; // Import requestContextService
import { ToolContext } from "../../../types/tool.js";
import { AtlasProjectCreateInput, AtlasProjectCreateSchema } from "./types.js";
import { formatProjectCreateResponse } from "./responseFormat.js";

export const atlasCreateProject = async (
  input: unknown,
  context: ToolContext
) => {
  let validatedInput: AtlasProjectCreateInput | undefined;
  const reqContext = context.requestContext ?? requestContextService.createRequestContext({ toolName: 'atlasCreateProject' });
  
  try {
    // Parse and validate input against schema
    validatedInput = AtlasProjectCreateSchema.parse(input);
    
    // Handle single vs bulk project creation based on mode
    if (validatedInput.mode === 'bulk') {
      // Execute bulk creation operation
      logger.info("Initializing multiple projects", { 
        ...reqContext,
        count: validatedInput.projects.length
      });

      const results = {
        success: true,
        message: `Successfully created ${validatedInput.projects.length} projects`,
        created: [] as any[],
        errors: [] as any[]
      };

      // Process each project sequentially to maintain consistency
      for (let i = 0; i < validatedInput.projects.length; i++) {
        const projectData = validatedInput.projects[i];
        try {
          const createdProject = await ProjectService.createProject({
            name: projectData.name,
            description: projectData.description,
            status: projectData.status || 'active',
            urls: projectData.urls || [],
            completionRequirements: projectData.completionRequirements,
            outputFormat: projectData.outputFormat,
            taskType: projectData.taskType,
            id: projectData.id // Use client-provided ID if available
          });
          
          results.created.push(createdProject);
          
          // Create dependency relationships if specified
          if (projectData.dependencies && projectData.dependencies.length > 0) {
            for (const dependencyId of projectData.dependencies) {
              try {
                await ProjectService.addProjectDependency(
                  createdProject.id,
                  dependencyId,
                  ProjectDependencyType.REQUIRES, // Use enum member
                  'Dependency created during project creation'
                );
              } catch (error) {
                const depErrorContext = requestContextService.createRequestContext({
                  ...reqContext,
                  originalErrorMessage: error instanceof Error ? error.message : String(error),
                  originalErrorStack: error instanceof Error ? error.stack : undefined,
                  projectId: createdProject.id,
                  dependencyIdAttempted: dependencyId
                });
                logger.warning(`Failed to create dependency for project ${createdProject.id} to ${dependencyId}`, depErrorContext);
              }
            }
          }
        } catch (error) {
          results.success = false;
          results.errors.push({
            index: i,
            project: projectData,
            error: {
              code: error instanceof McpError ? error.code : BaseErrorCode.INTERNAL_ERROR,
              message: error instanceof Error ? error.message : 'Unknown error',
              details: error instanceof McpError ? error.details : undefined
            }
          });
        }
      }
      
      if (results.errors.length > 0) {
        results.message = `Created ${results.created.length} of ${validatedInput.projects.length} projects with ${results.errors.length} errors`;
      }
      
      logger.info("Bulk project initialization completed", { 
        ...reqContext,
        successCount: results.created.length,
        errorCount: results.errors.length,
        projectIds: results.created.map(p => p.id)
      });

      // Conditionally format response
      if (validatedInput.responseFormat === ResponseFormat.JSON) {
        return createToolResponse(JSON.stringify(results, null, 2));
      } else {
        return formatProjectCreateResponse(results);
      }
    } else {
      // Process single project creation
      const { mode, id, name, description, status, urls, completionRequirements, dependencies, outputFormat, taskType } = validatedInput;
      
      logger.info("Initializing new project", {
        ...reqContext,
        name, 
        status
      });

      const project = await ProjectService.createProject({
        id, // Use client-provided ID if available
        name,
        description,
        status: status || 'active',
        urls: urls || [],
        completionRequirements,
        outputFormat,
        taskType
      });
      
      // Create dependency relationships if specified
      if (dependencies && dependencies.length > 0) {
        for (const dependencyId of dependencies) {
          try {
            await ProjectService.addProjectDependency(
              project.id,
                  dependencyId,
                  ProjectDependencyType.REQUIRES, // Use enum member
                  'Dependency created during project creation'
                );
              } catch (error) {
                const depErrorContext = requestContextService.createRequestContext({
                  ...reqContext,
                  originalErrorMessage: error instanceof Error ? error.message : String(error),
                  originalErrorStack: error instanceof Error ? error.stack : undefined,
                  projectId: project.id,
                  dependencyIdAttempted: dependencyId
                });
                logger.warning(`Failed to create dependency for project ${project.id} to ${dependencyId}`, depErrorContext);
              }
            }
          }
      
      logger.info("Project initialized successfully", {
        ...reqContext,
        projectId: project.id
      });

      // Conditionally format response
      if (validatedInput.responseFormat === ResponseFormat.JSON) {
        return createToolResponse(JSON.stringify(project, null, 2));
      } else {
        return formatProjectCreateResponse(project);
      }
    }
  } catch (error) {
    // Handle specific error cases
    if (error instanceof McpError) {
      throw error;
    }

    logger.error("Failed to initialize project(s)", error as Error, {
      ...reqContext,
      inputReceived: validatedInput ?? input // Log validated or raw input
    });

    // Handle duplicate name error specifically
    if (error instanceof Error && error.message.includes('duplicate')) {
      throw new McpError(
        ProjectErrorCode.DUPLICATE_NAME,
        `A project with this name already exists`,
        { name: validatedInput?.mode === 'single' ? validatedInput?.name : validatedInput?.projects?.[0]?.name }
      );
    }

    // Convert other errors to McpError
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Error creating project(s): ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};
