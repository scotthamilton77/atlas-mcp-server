import { Tool, ToolResponse } from '../../types/tool.js';
import { TemplateManager } from '../../template/manager.js';
import { taskTemplateSchema } from '../../types/template.js';
import { AgentBuilderTemplateParams, AgentBuilderValidationResult } from '../../types/tool.js';
import { ErrorFactory } from '../../errors/error-factory.js';

export class AgentBuilderTool implements Tool {
  name = 'agent_builder';
  description = 'Create and validate task templates programmatically';

  inputSchema = {
    type: 'object' as const,
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
          id: { type: 'string', description: 'Unique template identifier' },
          name: { type: 'string', description: 'Template name' },
          description: { type: 'string', description: 'Template description' },
          version: { type: 'string', description: 'Template version' },
          author: { type: 'string', description: 'Template author' },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Template tags for categorization',
          },
          variables: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                description: { type: 'string' },
                type: {
                  type: 'string',
                  enum: ['string', 'number', 'boolean', 'array'],
                },
                required: { type: 'boolean' },
                default: { type: 'any' },
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
                path: { type: 'string' },
                title: { type: 'string' },
                description: { type: 'string' },
                type: {
                  type: 'string',
                  enum: ['TASK', 'MILESTONE'],
                },
                metadata: { type: 'object' },
                dependencies: {
                  type: 'array',
                  items: { type: 'string' },
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
  };

  constructor(private templateManager: TemplateManager) {}

  async execute(params: {
    operation: 'create' | 'validate';
    template: AgentBuilderTemplateParams;
  }): Promise<ToolResponse> {
    try {
      // Validate template structure
      const validationResult = await this.validateTemplate(params.template);

      if (!validationResult.isValid) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: false,
                  errors: validationResult.errors,
                  warnings: validationResult.warnings,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // If only validating, return success
      if (params.operation === 'validate') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  message: 'Template validation successful',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Create template
      await this.createTemplate(params.template);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: `Template ${params.template.id} created successfully`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw ErrorFactory.createError(
        'TOOL_EXECUTION',
        `Agent builder error: ${errorMessage}`,
        'agent_builder.execute'
      );
    }
  }

  private async validateTemplate(
    template: AgentBuilderTemplateParams
  ): Promise<AgentBuilderValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Validate template ID
      const idErrors = this.validateTemplateId(template.id);
      errors.push(...idErrors);

      // Validate against schema
      taskTemplateSchema.parse(template);

      // Additional validation logic
      if (template.tasks.length === 0) {
        errors.push('Critical: Template must contain at least one task');
      }

      // Check for duplicate task paths
      const paths = new Set<string>();
      for (const task of template.tasks) {
        if (paths.has(task.path)) {
          errors.push(`Critical: Duplicate task path found: ${task.path}`);
        }
        paths.add(task.path);
      }

      // Validate dependencies
      const dependencyErrors = this.validateDependencyPaths(template.tasks);
      errors.push(...dependencyErrors);

      // Check for circular dependencies
      this.validateCircularDependencies(template.tasks, errors);

      // Add warnings for potential issues
      if (template.tasks.length > 50) {
        warnings.push('Large number of tasks may impact performance');
      }

      return {
        isValid: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      if (error instanceof Error) {
        errors.push(`Critical: Schema validation error: ${error.message}`);
      }
      return {
        isValid: false,
        errors,
      };
    }
  }

  private validateTemplateId(id: string): string[] {
    const errors: string[] = [];

    if (!id) {
      errors.push('Critical: Template ID cannot be empty');
      return errors;
    }

    if (!/^[a-zA-Z][a-zA-Z0-9-_]*$/.test(id)) {
      errors.push(
        'Critical: Invalid template ID format. Must start with a letter and contain only letters, numbers, hyphens and underscores'
      );
    }

    if (id.length > 100) {
      errors.push('Critical: Template ID exceeds maximum length of 100 characters');
    }

    return errors;
  }

  private validateDependencyPaths(tasks: AgentBuilderTemplateParams['tasks']): string[] {
    const errors: string[] = [];
    const paths = new Set<string>();

    // First pass: collect all valid paths
    for (const task of tasks) {
      paths.add(task.path);
    }

    // Second pass: validate dependencies
    for (const task of tasks) {
      if (task.dependencies) {
        if (task.dependencies.length > 50) {
          errors.push(`Critical: Task ${task.path} exceeds maximum of 50 dependencies`);
        }

        for (const dep of task.dependencies) {
          if (!paths.has(dep)) {
            errors.push(
              `Critical: Invalid dependency path in task ${task.path}: ${dep} (dependency does not exist)`
            );
          }
          if (dep === task.path) {
            errors.push(`Critical: Task ${task.path} cannot depend on itself`);
          }
        }
      }
    }

    return errors;
  }

  private validateCircularDependencies(
    tasks: AgentBuilderTemplateParams['tasks'],
    errors: string[]
  ): void {
    const graph = new Map<string, Set<string>>();

    // Build dependency graph with validation
    for (const task of tasks) {
      if (!graph.has(task.path)) {
        graph.set(task.path, new Set());
      }

      if (task.dependencies) {
        for (const dep of task.dependencies) {
          graph.get(task.path)?.add(dep);
        }
      }
    }

    // Enhanced cycle detection with path tracking
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const pathStack: string[] = [];

    const hasCycle = (node: string): boolean => {
      if (recursionStack.has(node)) {
        // Found cycle - construct the cycle path for clear error reporting
        const cycleStart = pathStack.indexOf(node);
        const cyclePath = pathStack.slice(cycleStart).concat(node);
        errors.push(`Critical: Circular dependency chain detected: ${cyclePath.join(' -> ')}`);
        return true;
      }

      if (visited.has(node)) {
        return false;
      }

      visited.add(node);
      recursionStack.add(node);
      pathStack.push(node);

      const dependencies = graph.get(node) || new Set();
      for (const dep of dependencies) {
        if (hasCycle(dep)) {
          return true;
        }
      }

      recursionStack.delete(node);
      pathStack.pop();
      return false;
    };

    // Check each unvisited node
    for (const task of tasks) {
      if (!visited.has(task.path)) {
        hasCycle(task.path);
      }
    }
  }

  private async createTemplate(template: AgentBuilderTemplateParams): Promise<void> {
    try {
      // Check if template already exists, but handle "not found" case
      try {
        const existing = await this.templateManager['storage'].getTemplate(template.id);
        if (existing) {
          throw new Error(`Template with ID ${template.id} already exists`);
        }
      } catch (error) {
        // Ignore "not found" errors as this is expected for new templates
        if (!(error instanceof Error) || !error.message.includes('not found')) {
          throw error;
        }
      }

      // Template manager handles storage and instantiation
      await this.templateManager['storage'].saveTemplate(template);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw ErrorFactory.createError(
        'TOOL_EXECUTION',
        `Failed to create template ${template.id}: ${errorMessage}`,
        'agent_builder.createTemplate'
      );
    }
  }
}
