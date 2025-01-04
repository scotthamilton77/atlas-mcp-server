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
      name: 'agent_builder',
      description: `Create and validate task templates programmatically. This tool enables LLM agents to:

CORE CAPABILITIES:
1. Template Creation
   - Define task patterns
   - Set variable schemas
   - Create task hierarchies
   - Establish dependencies

2. Template Validation
   - Verify template structure
   - Check dependencies
   - Validate variables
   - Ensure consistency

3. Pattern Management
   - Create reusable patterns for tasks as reusable task templates
   - Define best practices
   - Standardize workflows
   - Maintain templates

VALIDATION RULES:
1. Template ID
   - Start with letter
   - Alphanumeric with - _
   - Max 100 chars
   - Must be unique

2. Task Structure
   - Min 1 task required
   - Unique paths
   - Valid dependencies
   - No cycles allowed

3. Variable Schema
   - Required fields present
   - Valid types
   - Clear descriptions
   - Default values valid

EXAMPLE:

Create a template for web development projects:
{
  "operation": "create",
  "template": {
    "id": "web-project",
    "name": "Web Development Project",
    "description": "Standard web project setup with configurable features",
    "version": "1.0.0",
    "variables": [
      {
        "name": "projectName",
        "description": "Project name",
        "type": "string",
        "required": true
      },
      {
        "name": "useTypeScript",
        "description": "Use TypeScript",
        "type": "boolean",
        "required": false,
        "default": true
      }
    ],
    "tasks": [
      {
        "path": "project/setup",
        "title": "Project Setup",
        "type": "MILESTONE",
        "dependencies": []
      }
    ]
  }
}`,
      inputSchema: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: ['create', 'validate'],
            description: 'Operation to perform',
          },
          template: {
            type: 'object',
            description: 'Template definition',
            properties: {
              id: {
                type: 'string',
                description: 'Unique template identifier',
              },
              name: {
                type: 'string',
                description: 'Template name',
              },
              description: {
                type: 'string',
                description: 'Template description',
              },
              version: {
                type: 'string',
                description: 'Template version',
              },
              author: {
                type: 'string',
                description: 'Template author',
              },
              tags: {
                type: 'array',
                items: {
                  type: 'string',
                },
                description: 'Template tags for categorization',
              },
              variables: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: {
                      type: 'string',
                    },
                    description: {
                      type: 'string',
                    },
                    type: {
                      type: 'string',
                      enum: ['string', 'number', 'boolean', 'array'],
                    },
                    required: {
                      type: 'boolean',
                    },
                    default: {
                      type: 'any',
                    },
                  },
                  required: ['name', 'description', 'type', 'required'],
                },
                description: 'Template variables',
              },
              tasks: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    path: {
                      type: 'string',
                    },
                    title: {
                      type: 'string',
                    },
                    description: {
                      type: 'string',
                    },
                    type: {
                      type: 'string',
                      enum: ['TASK', 'MILESTONE'],
                    },
                    metadata: {
                      type: 'object',
                    },
                    dependencies: {
                      type: 'array',
                      items: {
                        type: 'string',
                      },
                    },
                  },
                  required: ['path', 'title', 'type'],
                },
                description: 'Template tasks',
              },
            },
            required: ['id', 'name', 'description', 'version', 'variables', 'tasks'],
          },
        },
        required: ['operation', 'template'],
      },
    },
    handler: async (args: Record<string, unknown>) => {
      context.logger.debug('Executing agent builder tool', { args });
      return await tool.execute(args as any);
    },
  };
}
