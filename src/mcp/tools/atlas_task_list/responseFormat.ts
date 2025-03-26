import { Neo4jTask } from "../../../services/neo4j/types.js";
import { ResponseFormatter, createFormattedResponse } from "../../../utils/responseFormatter.js";
import { TaskListResponse } from "./types.js";

/**
 * Formatter for task list responses
 */
export class TaskListFormatter implements ResponseFormatter<TaskListResponse> {
  format(data: TaskListResponse): string {
    const { tasks, total, page, limit, totalPages } = data;
    
    // Create a summary section with pagination info
    const summary = `Task List\n\n` +
      `Found ${total} task(s)\n` +
      `Page ${page} of ${totalPages} (${limit} per page)\n`;
    
    // Early return if no tasks found
    if (tasks.length === 0) {
      return `${summary}\nNo tasks found matching the specified criteria.`;
    }
    
    // Create a table of tasks
    let tasksSection = "Tasks:\n\n";
    
    tasksSection += tasks.map((rawTask, index) => {
      // Neo4j records have a properties field containing the actual data
      const task = (rawTask as any).properties || rawTask;
      
      const statusEmoji = this.getStatusEmoji(task.status);
      const priorityIndicator = this.getPriorityIndicator(task.priority);
      
      return `${index + 1}. ${statusEmoji} ${priorityIndicator} ${task.title}\n` +
        `   ID: ${task.id}\n` +
        `   Status: ${task.status}\n` +
        `   Priority: ${task.priority}\n` +
        (task.assignedTo ? `   Assigned To: ${task.assignedTo}\n` : "") +
        (task.tags && task.tags.length > 0 ? `   Tags: ${task.tags.join(', ')}\n` : "") +
        `   Type: ${task.taskType}\n` +
        `   Created: ${new Date(task.createdAt).toLocaleString()}\n`;
    }).join("\n");
    
    // Add help text for pagination
    let paginationHelp = "";
    if (totalPages > 1) {
      paginationHelp = `\nTo view more tasks, use 'page' parameter (current: ${page}, total pages: ${totalPages}).`;
    }
    
    return `${summary}\n${tasksSection}${paginationHelp}`;
  }
  
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
}

/**
 * Create a formatted, human-readable response for the atlas_task_list tool
 * 
 * @param data The task list response data
 * @param isError Whether this response represents an error condition
 * @returns Formatted MCP tool response with appropriate structure
 */
export function formatTaskListResponse(data: TaskListResponse, isError = false): any {
  return createFormattedResponse(data, new TaskListFormatter(), isError);
}
