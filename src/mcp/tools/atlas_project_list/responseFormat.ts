import { ResponseFormatter, createFormattedResponse, objectToMarkdownTable } from "../../../utils/responseFormatter.js";
import { Project, ProjectListResponse } from "./types.js";

/**
 * Formatter for project list responses
 */
export class ProjectListFormatter implements ResponseFormatter<ProjectListResponse> {
  format(data: ProjectListResponse): string {
    const { projects, total, page, limit, totalPages } = data;
    
    // Create a summary section
    const summary = `## Project List\n\n` +
      `**Total Projects:** ${total}\n` +
      `**Page:** ${page} of ${totalPages}\n` +
      `**Showing:** ${Math.min(limit, projects.length)} project(s) per page\n`;
    
    if (projects.length === 0) {
      return `${summary}\n\n*No projects found matching the criteria*`;
    }
    
    // Format each project
    const projectsSections = projects.map((project, index) => {
      // Extract project properties from Neo4j structure
      const projectData = project.properties || project;
      const { name, id, status, taskType, createdAt, urls } = projectData;
      
      let projectSection = `### ${index + 1}. ${name || 'Unnamed Project'}\n\n` +
        `**ID:** ${id || 'Unknown ID'}\n` +
        `**Status:** ${status || 'Unknown Status'}\n` +
        `**Type:** ${taskType || 'Unknown Type'}\n` +
        `**Created:** ${createdAt ? new Date(createdAt).toLocaleString() : 'Unknown Date'}\n`;
      
      // Add project details table
      projectSection += `\n#### Project Details\n\n` +
        objectToMarkdownTable(projectData, {
          id: "ID", 
          name: "Name",
          description: "Description",
          status: "Status",
          urls: "URLs",
          completionRequirements: "Completion Requirements",
          outputFormat: "Output Format",
          taskType: "Task Type",
          createdAt: "Created At",
          updatedAt: "Updated At"
        });
      
      // Add tasks if included
      if (project.tasks && project.tasks.length > 0) {
        projectSection += `\n#### Tasks (${project.tasks.length})\n\n`;
        
        projectSection += project.tasks.map((task, taskIndex) => {
          return `##### ${taskIndex + 1}. ${task.title}\n\n` +
            `**ID:** ${task.id}\n` +
            `**Status:** ${task.status}\n` +
            `**Priority:** ${task.priority}\n` +
            `**Created:** ${task.createdAt ? new Date(task.createdAt).toLocaleString() : 'Unknown Date'}\n`;
        }).join("\n\n");
      }
      
      // Add knowledge if included
      if (project.knowledge && project.knowledge.length > 0) {
        projectSection += `\n#### Knowledge Items (${project.knowledge.length})\n\n`;
        
        projectSection += project.knowledge.map((item, itemIndex) => {
          return `##### ${itemIndex + 1}. ${item.domain} Knowledge\n\n` +
            `**ID:** ${item.id}\n` +
            `**Domain:** ${item.domain}\n` +
            `${item.tags ? `**Tags:** ${item.tags.join(", ")}\n` : ""}` +
            `**Created:** ${item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Unknown Date'}\n\n` +
            "```\n" + item.text + "\n```";
        }).join("\n\n");
      }
      
      return projectSection;
    }).join("\n\n---\n\n");
    
    // Add pagination info if more than one page
    let paginationInfo = "";
    if (totalPages > 1) {
      paginationInfo = `\n\n## Pagination\n\n` +
        `Showing page **${page}** of **${totalPages}**.\n` +
        `${page < totalPages ? "Use 'page' parameter to view more results." : ""}`;
    }
    
    return `${summary}\n\n${projectsSections}${paginationInfo}`;
  }
}

/**
 * Create a formatted response for the atlas_project_list tool
 * 
 * @param data The raw project list response
 * @param isError Whether this response represents an error
 * @returns Formatted MCP tool response
 */
export function formatProjectListResponse(data: any, isError = false): any {
  return createFormattedResponse(data, new ProjectListFormatter(), isError);
}
