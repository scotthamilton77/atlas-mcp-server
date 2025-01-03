import { TemplateManager } from '../../../template/manager.js';
import { Logger } from '../../../logging/index.js';
import { AgentBuilderTool } from '../agent-builder.js';
import { ToolImplementation } from './shared/types.js';

interface AgentBuilderContext {
  templateManager: TemplateManager;
  logger: Logger;
}

export function createAgentBuilderTool(context: AgentBuilderContext): ToolImplementation {
  const tool = new AgentBuilderTool(context.templateManager);

  return {
    definition: {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    },
    handler: async (args: Record<string, unknown>) => {
      context.logger.debug('Executing agent builder tool', { args });
      return await tool.execute(args as any);
    },
  };
}
