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
    description: `List available task templates with descriptions and metadata. This tool enables LLM agents to:

CORE CAPABILITIES:
1. Template Discovery
   - List available templates with full metadata
   - Filter by category or domain
   - View variable requirements
   - Check path patterns and dependencies
   - Understand template structure

VALIDATION RULES:
1. Tag Requirements
   - Optional filter for template categories
   - Case-sensitive exact matching
   - Multiple tags supported with AND logic
   - Returns all templates if no tag specified

2. Response Format
   - Template ID and version
   - Required and optional variables
   - Path patterns with variable placeholders
   - Dependency rules and constraints
   - Usage examples and recommendations

EXAMPLE:

Find education-focused templates:
{
  "tag": "education"
}

Response includes:
{
  "templates": [
    {
      "id": "teacher/lesson_planner",
      "name": "Lesson Planning Template",
      "description": "Weekly lesson planning with curriculum alignment",
      "variables": {
        "subject": "string (required)",
        "weekNumber": "number (required)",
        "gradeLevel": "string (required)"
      },
      "pathPattern": "lesson-\${subject}-week-\${weekNumber}/*",
      "tags": ["education", "planning"]
    }
  ]
}`,
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
    description: `Instantiate a template with provided variables. This tool enables LLM agents to:

CORE CAPABILITIES:
1. Template Usage
   - Create task structures with variable interpolation
   - Generate consistent task hierarchies
   - Maintain relationships and dependencies
   - Support extensible task patterns

EXAMPLE:

1. Create a lesson planning root:
{
  "path": "math-semester1",
  "name": "Mathematics Semester 1",
  "type": "MILESTONE",
  "description": "First semester mathematics curriculum"
}

2. Use the lesson planner template:
{
  "templateId": "teacher/lesson_planner",
  "variables": {
    "subject": "math",
    "weekNumber": 1,
    "gradeLevel": "9th",
    "standardsFramework": "common-core"
  },
  "parentPath": "math-semester1"
}`,
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
          description:
            'Optional parent path for tasks. IMPORTANT: Must exist before using template.',
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
    description: `Get detailed information about a template. This tool enables LLM agents to:

CORE CAPABILITIES:
1. Template Analysis
   - View complete template structure
   - Examine variable requirements
   - Understand path patterns
   - Review task relationships
   - Check validation rules

2. Variable Documentation
   - Required vs optional variables
   - Type constraints and validation
   - Default values and enums
   - Usage in path patterns

3. Path Pattern Analysis
   - Variable interpolation points
   - Hierarchy structure
   - Dependency patterns
   - Naming conventions

VALIDATION RULES:
1. Template ID
   - Must exist in system
   - Case-sensitive matching
   - Format validation
   - Version checking

2. Response Format
   - Full template definition
   - Variable requirements
   - Task structure
   - Validation rules
   - Usage examples

EXAMPLE:

Get details of lesson planner template:
{
  "templateId": "teacher/lesson_planner"
}

Response includes:
{
  "id": "teacher/lesson_planner",
  "version": "1.0.0",
  "variables": [
    {
      "name": "subject",
      "type": "string",
      "required": true,
      "description": "Academic subject"
    },
    {
      "name": "weekNumber",
      "type": "number",
      "required": true,
      "description": "Week number in term"
    }
  ],
  "pathPattern": "lesson-\${subject}-week-\${weekNumber}/*",
  "tasks": [
    {
      "path": "lesson-\${subject}-week-\${weekNumber}/planning",
      "type": "MILESTONE",
      "children": [...]
    }
  ]
}`,
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
