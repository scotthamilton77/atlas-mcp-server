import { logger } from '../../../utils/logger.js';
import { getProjectById } from '../../../neo4j/projectService.js';
import { ProjectSummaryInput, ProjectSummaryResponse } from './types.js';
import { createPromptResponse } from '../../../types/mcp.js';

export const generateProjectSummary = async (
  input: ProjectSummaryInput,
  _extra: Record<string, unknown>
): Promise<ProjectSummaryResponse> => {
  try {
    logger.info("Generating project summary", { projectId: input.projectId });
    const project = await getProjectById(input.projectId);
    
    if (!project) {
      logger.warn("Project not found for summary", { projectId: input.projectId });
      return createPromptResponse(`Project with ID ${input.projectId} not found.`);
    }

    const summaryPrompt = `Generate a concise summary report for the following project:
      Name: ${project.name}
      Description: ${project.description}
      Status: ${project.status}
      Created: ${new Date(project.createdAt).toLocaleDateString()}
      Last Updated: ${new Date(project.updatedAt).toLocaleDateString()}

      Please include:
      1. Project overview and current status
      2. Key milestones or progress indicators
      3. Any recommendations or next steps`;

    logger.debug("Project summary prompt generated", { projectId: input.projectId });
    return createPromptResponse(summaryPrompt, "user");
  } catch (error: any) {
    logger.error("Error generating project summary", { error, projectId: input.projectId });
    return createPromptResponse(`Error generating project summary: ${error.message}`);
  }
};