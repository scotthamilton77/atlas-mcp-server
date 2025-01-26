/**
 * Tool definitions and handlers for LLM agent task management
 */
import { TaskManager } from '../../task/manager/task-manager.js';
import { TemplateManager } from '../../template/manager.js';
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
  createTemplateTools,
  createAgentBuilderTool,
  ToolImplementation,
} from './tools/index.js';
import { createSamplingTools } from './tools/sampling-tools.js';
import { SamplingHandler } from '../sampling-handler.js';

export class ToolDefinitions {
  private readonly logger: Logger;
  private readonly tools: ToolImplementation[];

  constructor(taskManager: TaskManager, templateManager: TemplateManager) {
    this.logger = Logger.getInstance().child({
      component: 'ToolDefinitions',
    });

    // Initialize handlers
    const samplingHandler = new SamplingHandler();

    // Initialize contexts
    const taskContext = { taskManager, logger: this.logger };
    const templateContext = { templateManager, logger: this.logger };
    const samplingContext = { samplingHandler, logger: this.logger };

    this.tools = [
      // Task tools
      createTaskTool(taskContext),
      updateTaskTool(taskContext),
      getTasksByStatusTool(taskContext),
      getTasksByPathTool(taskContext),
      getChildrenTool(taskContext),
      deleteTaskTool(taskContext),
      bulkTaskOperationsTool(taskContext),
      clearAllTasksTool(taskContext),
      vacuumDatabaseTool(taskContext),
      repairRelationshipsTool(taskContext),
      // Template tools
      ...createTemplateTools(templateContext),
      createAgentBuilderTool(templateContext),
      // Sampling tools
      ...createSamplingTools(samplingContext),
    ];

    this.logger.info('Tool registration completed', {
      count: this.tools.length,
      tools: this.tools.map(t => t.definition.name),
    });
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
