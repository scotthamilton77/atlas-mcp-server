/**
 * Tool definitions and handlers for LLM agent task management
 */
import { TaskManager } from '../../task/manager/task-manager.js';
import { Logger } from '../../logging/index.js';
import { Tool, ToolResponse } from '../../types/tool.js';
import {
  createTaskTool,
  updateTaskTool,
  getTasksByStatusTool,
  getTasksByPathTool,
  getChildrenTool,
  deleteTaskTool,
  bulkTaskOperationsTool,
  clearAllTasksTool,
  vacuumDatabaseTool,
  repairRelationshipsTool,
  ToolImplementation,
} from './tools/index.js';

export class ToolDefinitions {
  private readonly logger: Logger;
  private readonly tools: ToolImplementation[];

  constructor(taskManager: TaskManager) {
    this.logger = Logger.getInstance().child({
      component: 'ToolDefinitions',
    });

    // Initialize all tools with context
    const context = { taskManager, logger: this.logger };
    this.tools = [
      createTaskTool(context),
      updateTaskTool(context),
      getTasksByStatusTool(context),
      getTasksByPathTool(context),
      getChildrenTool(context),
      deleteTaskTool(context),
      bulkTaskOperationsTool(context),
      clearAllTasksTool(context),
      vacuumDatabaseTool(context),
      repairRelationshipsTool(context),
    ];
  }

  /**
   * Get all tool definitions with their handlers
   */
  getTools(): Array<Tool & { handler: (args: Record<string, unknown>) => Promise<ToolResponse> }> {
    return this.tools.map(tool => ({
      ...tool.definition,
      handler: tool.handler,
    }));
  }
}
