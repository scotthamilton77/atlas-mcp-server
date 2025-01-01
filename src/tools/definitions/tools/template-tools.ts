import { Logger } from '../../../logging/index.js';
import { TemplateManager } from '../../../template/manager.js';
import { Tool, ToolResponse } from '../../../types/tool.js';

interface ToolContext {
  templateManager: TemplateManager;
  logger: Logger;
}

export interface ToolImplementation {
  definition: Tool;
  handler: (args: Record<string, unknown>) => Promise<ToolResponse>;
}

export const listTemplatesToolImpl = (context: ToolContext): ToolImplementation => ({
  definition: {
    name: 'list_templates',
    description: 'List available task templates with descriptions and metadata',
    inputSchema: {
      type: 'object',
      properties: {
        tag: {
          type: 'string',
          description: 'Optional tag to filter templates',
        },
      },
    },
  },
  handler: async args => {
    const templates = await context.templateManager.listTemplates(args.tag as string | undefined);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(templates, null, 2),
        },
      ],
    };
  },
});

export const useTemplateToolImpl = (context: ToolContext): ToolImplementation => ({
  definition: {
    name: 'use_template',
    description: 'Instantiate a template with provided variables',
    inputSchema: {
      type: 'object',
      properties: {
        templateId: {
          type: 'string',
          description: 'ID of template to use',
        },
        variables: {
          type: 'object',
          description: 'Template variables',
          additionalProperties: true,
        },
        parentPath: {
          type: 'string',
          description: 'Optional parent path for tasks',
        },
      },
      required: ['templateId', 'variables'],
    },
  },
  handler: async args => {
    await context.templateManager.instantiateTemplate({
      templateId: args.templateId as string,
      variables: args.variables as Record<string, unknown>,
      parentPath: args.parentPath as string | undefined,
    });

    return {
      content: [
        {
          type: 'text',
          text: 'Template instantiated successfully',
        },
      ],
    };
  },
});

export const getTemplateInfoToolImpl = (context: ToolContext): ToolImplementation => ({
  definition: {
    name: 'get_template_info',
    description: 'Get detailed information about a template including its variables and tasks',
    inputSchema: {
      type: 'object',
      properties: {
        templateId: {
          type: 'string',
          description: 'ID of template to get info for',
        },
      },
      required: ['templateId'],
    },
  },
  handler: async args => {
    const template = await context.templateManager.getTemplate(args.templateId as string);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(template, null, 2),
        },
      ],
    };
  },
});

export const createTemplateTools = (context: ToolContext): ToolImplementation[] => [
  listTemplatesToolImpl(context),
  useTemplateToolImpl(context),
  getTemplateInfoToolImpl(context),
];
