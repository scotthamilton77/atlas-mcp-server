/**
 * Path-based task management tools handler
 */
import { TaskManager } from '../task/manager/task-manager.js';
import { Logger } from '../logging/index.js';
import { ErrorCodes, createError } from '../errors/index.js';
import { Tool, ToolResponse } from './types.js';
import { ToolDefinitions } from './definitions/tool-definitions.js';

export class ToolHandler {
  private readonly logger: Logger;
  private readonly tools: Map<string, Tool> = new Map();
  private readonly toolHandlers: Map<
    string,
    (args: Record<string, unknown>) => Promise<ToolResponse>
  > = new Map();
  private readonly toolDefinitions: ToolDefinitions;

  constructor(private readonly taskManager: TaskManager) {
    this.logger = Logger.getInstance().child({
      component: 'ToolHandler',
      context: {
        operation: 'initialization',
      },
    });

    this.toolDefinitions = new ToolDefinitions(taskManager);
    this.registerTools();

    this.logger.info('Tool registration completed', {
      count: this.tools.size,
      tools: Array.from(this.tools.keys()),
      context: {
        operation: 'registerTools',
        timestamp: Date.now(),
      },
    });
  }

  private registerTools(): void {
    const tools = this.toolDefinitions.getTools();
    for (const tool of tools) {
      const { handler, ...toolDef } = tool;
      this.tools.set(tool.name, toolDef);
      this.toolHandlers.set(tool.name, handler);
      this.logger.debug('Tool registered', {
        name: tool.name,
        schema: toolDef.inputSchema,
        context: {
          operation: 'registerTool',
          timestamp: Date.now(),
        },
      });
    }
  }

  async listTools(): Promise<{ tools: Tool[] }> {
    // Ensure all tools are registered
    if (this.tools.size === 0) {
      this.logger.warn('No tools registered, attempting registration', {
        context: {
          operation: 'listTools',
          timestamp: Date.now(),
        },
      });
      this.registerTools();
      // Wait for registration to complete
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const tools = Array.from(this.tools.values());
    this.logger.info('Tools listed', {
      count: tools.length,
      tools: tools.map(t => ({
        name: t.name,
        schema: t.inputSchema,
      })),
      context: {
        operation: 'listTools',
        timestamp: Date.now(),
      },
    });
    return { tools };
  }

  async handleToolCall(request: {
    params: { name: string; arguments?: Record<string, unknown> };
  }): Promise<{
    _meta?: Record<string, unknown>;
    content: Array<{ type: string; text: string }>;
  }> {
    const { name, arguments: args = {} } = request.params;

    const tool = this.tools.get(name);
    if (!tool) {
      throw createError(ErrorCodes.INVALID_INPUT, 'Unknown tool', 'handleToolCall', undefined, {
        tool: name,
      });
    }

    const handler = this.toolHandlers.get(name);
    if (!handler) {
      throw createError(
        ErrorCodes.INVALID_INPUT,
        'Tool handler not found',
        'handleToolCall',
        undefined,
        { tool: name }
      );
    }

    try {
      // Validate dependencies are at root level
      if (
        (name === 'create_task' || name === 'update_task') &&
        (args as any).metadata?.dependencies
      ) {
        throw createError(
          ErrorCodes.INVALID_INPUT,
          'Dependencies must be specified at root level, not in metadata',
          'handleToolCall'
        );
      }

      this.logger.debug('Executing tool', { name, args });
      const result = await handler(args);
      this.logger.debug('Tool execution completed', { name });
      return {
        _meta: {},
        ...result,
      };
    } catch (error) {
      this.logger.error('Tool execution failed', {
        tool: name,
        error,
      });
      throw error;
    }
  }

  async getStorageMetrics(): Promise<any> {
    return await this.taskManager.getStorage().getMetrics();
  }
}
