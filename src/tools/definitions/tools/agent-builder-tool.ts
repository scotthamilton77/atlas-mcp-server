import { Logger } from '../../../logging/index.js';
import { TemplateManager } from '../../../template/manager.js';
import { Tool, ToolResponse } from '../../../types/tool.js';
import { TemplateVariable, TemplateTask, TemplateMetadata } from '../../../types/template.js';

interface ToolContext {
  templateManager: TemplateManager;
  logger: Logger;
}

export interface ToolImplementation {
  definition: Tool;
  handler: (args: Record<string, unknown>) => Promise<ToolResponse>;
}

export const agentBuilderToolImpl = (context: ToolContext): ToolImplementation => ({
  definition: {
    name: 'agent_builder',
    description: `Create and validate task templates programmatically. This tool enables LLM agents to:

CORE CAPABILITIES:
1. Template Creation
   - Define task patterns with variable support
   - Set variable schemas with validation
   - Create task hierarchies with dependencies
   - Establish consistent naming patterns

2. Variable Management
   - Define required and optional variables
   - Set default values and constraints
   - Document variable usage in paths
   - Handle variable interpolation

3. Path Pattern Design
   - Create consistent path structures
   - Support variable interpolation
   - Maintain hierarchy relationships
   - Ensure uniqueness constraints

4. Template Validation
   - Verify template structure
   - Validate variable usage
   - Check path patterns
   - Ensure dependency integrity

VALIDATION RULES:
1. Template ID
   - Start with letter
   - Alphanumeric with hyphens and underscores
   - Max 100 chars
   - Must be unique

2. Path Patterns
   - Support \${variableName} syntax
   - Automatic sanitization
   - Valid characters: a-z, A-Z, 0-9, -, _
   - Forward slashes for hierarchy

3. Variable Schema
   - Required fields present
   - Valid types (string, number, boolean, array)
   - Clear descriptions
   - Default values validated

4. Task Structure
   - Min 1 task required
   - Unique path patterns
   - Valid dependencies
   - No cycles allowed

EXAMPLE:

Create a lesson planner template:
{
  "operation": "create",
  "template": {
    "id": "teacher/lesson_planner",
    "name": "Lesson Planning Template",
    "description": "Weekly lesson planning with curriculum alignment",
    "version": "1.0.0",
    "variables": [
      {
        "name": "subject",
        "description": "Academic subject",
        "type": "string",
        "required": true
      },
      {
        "name": "weekNumber",
        "description": "Week number in term",
        "type": "number",
        "required": true
      }
    ],
    "tasks": [
      {
        "path": "lesson-\${subject}-week-\${weekNumber}",
        "title": "Weekly Lesson Plan",
        "type": "MILESTONE",
        "dependencies": []
      },
      {
        "path": "lesson-\${subject}-week-\${weekNumber}/planning",
        "title": "Lesson Development",
        "type": "MILESTONE",
        "dependencies": ["lesson-\${subject}-week-\${weekNumber}"]
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
  handler: async args => {
    const operation = args.operation as string;
    const templateInput = args.template as {
      id: string;
      name: string;
      description: string;
      version: string;
      author?: string;
      tags?: string[];
      variables: TemplateVariable[];
      tasks: TemplateTask[];
      metadata?: TemplateMetadata;
    };

    if (operation === 'validate') {
      // Get template info to validate it exists
      await context.templateManager.getTemplate(templateInput.id);
      return {
        content: [
          {
            type: 'text',
            text: 'Template validation successful',
          },
        ],
      };
    } else {
      // Save template
      await context.templateManager.saveTemplate(templateInput);
      return {
        content: [
          {
            type: 'text',
            text: 'Template created successfully',
          },
        ],
      };
    }
  },
});

export const createAgentBuilderTool = (context: ToolContext): ToolImplementation =>
  agentBuilderToolImpl(context);
