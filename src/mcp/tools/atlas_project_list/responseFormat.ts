import { ResponseFormatter, createFormattedResponse } from "../../../utils/responseFormatter.js";
import { Project, ProjectListResponse } from "./types.js";

/**
 * Formatter for structured project query responses
 */
export class ProjectListFormatter implements ResponseFormatter<ProjectListResponse> {
  /**
   * Get an emoji indicator for the task status
   */
  private getStatusEmoji(status: string): string {
    switch (status) {
      case 'backlog': return '📋';
      case 'todo': return '📝';
      case 'in_progress': return '🔄';
      case 'completed': return '✅';
      default: return '❓';
    }
  }
  
  /**
   * Get a visual indicator for the priority level
   */
  private getPriorityIndicator(priority: string): string {
    switch (priority) {
      case 'critical': return '[!!!]';
      case 'high': return '[!!]';
      case 'medium': return '[!]';
      case 'low': return '[-]';
      default: return '[?]';
    }
  }
  format(data: ProjectListResponse): string {
    const { projects, total, page, limit, totalPages } = data;
    
    // Generate result summary section
    const summary = `Project Portfolio\n\n` +
      `Total Entities: ${total}\n` +
      `Page: ${page} of ${totalPages}\n` +
      `Displaying: ${Math.min(limit, projects.length)} project(s) per page\n`;
    
    if (projects.length === 0) {
      return `${summary}\n\nNo project entities matched the specified criteria`;
    }
    
    // Format each project
    const projectsSections = projects.map((project, index) => {
      // Extract project properties from Neo4j entity structure
      const projectData = project.properties || project;
      const { name, id, status, taskType, createdAt } = projectData;
      
      let projectSection = `${index + 1}. ${name || 'Unnamed Project'}\n\n` +
        `ID: ${id || 'Unknown ID'}\n` +
        `Status: ${status || 'Unknown Status'}\n` +
        `Type: ${taskType || 'Unknown Type'}\n` +
        `Created: ${createdAt ? new Date(createdAt).toLocaleString() : 'Unknown Date'}\n`;
      
      // Add project details in plain text format
      projectSection += `\nProject Details\n\n`;
      
      // Add each property with proper formatting
      if (projectData.id) projectSection += `ID: ${projectData.id}\n`;
      if (projectData.name) projectSection += `Name: ${projectData.name}\n`;
      if (projectData.description) projectSection += `Description: ${projectData.description}\n`;
      if (projectData.status) projectSection += `Status: ${projectData.status}\n`;
      
      // Format URLs array
      if (projectData.urls) {
        const urlsValue = Array.isArray(projectData.urls) && projectData.urls.length > 0 
          ? JSON.stringify(projectData.urls) 
          : "None";
        projectSection += `URLs: ${urlsValue}\n`;
      }
      
      if (projectData.completionRequirements) projectSection += `Completion Requirements: ${projectData.completionRequirements}\n`;
      if (projectData.outputFormat) projectSection += `Output Format: ${projectData.outputFormat}\n`;
      if (projectData.taskType) projectSection += `Task Type: ${projectData.taskType}\n`;
      
      // Format dates
      if (projectData.createdAt) {
        const createdDate = typeof projectData.createdAt === 'string' && 
                           /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(projectData.createdAt)
          ? new Date(projectData.createdAt).toLocaleString()
          : projectData.createdAt;
        projectSection += `Created At: ${createdDate}\n`;
      }
      
      if (projectData.updatedAt) {
        const updatedDate = typeof projectData.updatedAt === 'string' && 
                           /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(projectData.updatedAt)
          ? new Date(projectData.updatedAt).toLocaleString()
          : projectData.updatedAt;
        projectSection += `Updated At: ${updatedDate}\n`;
      }
      
      // Add tasks if included
      if (project.tasks && project.tasks.length > 0) {
        projectSection += `\nTasks (${project.tasks.length})\n\n`;
        
        projectSection += project.tasks.map((task, taskIndex) => {
          // Ensure we're accessing the task properties correctly
          const taskTitle = task.title || 'Unnamed Task';
          const taskId = task.id || 'Unknown ID';
          const taskStatus = task.status || 'Unknown Status';
          const taskPriority = task.priority || 'Unknown Priority';
          const taskCreatedAt = task.createdAt ? new Date(task.createdAt).toLocaleString() : 'Unknown Date';
          
          // Get status emoji for the task
          const statusEmoji = this.getStatusEmoji(taskStatus);
          // Get priority indicator for the task
          const priorityIndicator = this.getPriorityIndicator(taskPriority);
          
          return `Task ${taskIndex + 1}. ${statusEmoji} ${priorityIndicator} ${taskTitle}\n\n` +
            `ID: ${taskId}\n` +
            `Status: ${taskStatus}\n` +
            `Priority: ${taskPriority}\n` +
            `Created: ${taskCreatedAt}\n`;
        }).join("\n\n");
      }
      
      // Add knowledge if included
      if (project.knowledge && project.knowledge.length > 0) {
        projectSection += `\nKnowledge Items (${project.knowledge.length})\n\n`;
        
        projectSection += project.knowledge.map((item, itemIndex) => {
          // Access item fields directly since they're already extracted in listProjects.ts
          return `Knowledge ${itemIndex + 1}. ${item.domain || 'Uncategorized'} Knowledge\n\n` +
            `ID: ${item.id || 'Unknown ID'}\n` +
            `Domain: ${item.domain || 'Uncategorized'}\n` +
            `${item.tags && item.tags.length > 0 ? `Tags: ${item.tags.join(", ")}\n` : ""}` +
            `Created: ${item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Unknown Date'}\n\n` +
            "Content:\n" + (item.text || 'No content available');
        }).join("\n\n");
      }
      
      return projectSection;
    }).join("\n\n----------\n\n");
    
    // Append pagination metadata for multi-page results
    let paginationInfo = "";
    if (totalPages > 1) {
      paginationInfo = `\n\nPagination Controls\n\n` +
        `Viewing page ${page} of ${totalPages}.\n` +
        `${page < totalPages ? "Use 'page' parameter to navigate to additional results." : ""}`;
    }
    
    return `${summary}\n\n${projectsSections}${paginationInfo}`;
  }
}

/**
 * Create a human-readable formatted response for the atlas_project_list tool
 * 
 * @param data The structured project query response data
 * @param isError Whether this response represents an error condition
 * @returns Formatted MCP tool response with appropriate structure
 */
export function formatProjectListResponse(data: any, isError = false): any {
  return createFormattedResponse(data, new ProjectListFormatter(), isError);
}
