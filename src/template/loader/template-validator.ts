import { Logger } from '../../logging/index.js';
import { z } from 'zod';
import { TaskTemplate } from '../../types/template.js';
import { taskTemplateSchema } from '../validation/schemas/template-schemas.js';

/**
 * Handles template validation and schema checking
 */
export class TemplateValidator {
  private readonly logger: Logger;

  constructor() {
    this.logger = Logger.getInstance().child({ component: 'TemplateValidator' });
  }

  /**
   * Validate a template against the schema
   */
  async validateTemplate(template: unknown): Promise<TaskTemplate> {
    try {
      this.logger.debug('Starting template validation');

      // Validate against schema
      const validatedTemplate = taskTemplateSchema.parse(template);

      // Additional validation checks
      await this.validateTemplateStructure(validatedTemplate);

      return validatedTemplate;
    } catch (error) {
      if (error instanceof z.ZodError) {
        this.logger.error('Template schema validation failed:', {
          errors: error.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message,
            code: e.code,
          })),
        });
      }
      throw error;
    }
  }

  /**
   * Perform additional structural validation beyond schema checks
   */
  private async validateTemplateStructure(template: TaskTemplate): Promise<void> {
    // Check for duplicate task paths
    const paths = new Set<string>();
    for (const task of template.tasks) {
      if (paths.has(task.path)) {
        throw new Error(`Duplicate task path found: ${task.path}`);
      }
      paths.add(task.path);
    }

    // Check for invalid dependencies
    for (const task of template.tasks) {
      if (task.dependencies) {
        for (const dep of task.dependencies) {
          if (!paths.has(dep)) {
            throw new Error(
              `Task ${task.path} has dependency ${dep} that does not exist in template`
            );
          }
        }
      }
    }

    // Check for circular dependencies
    await this.checkCircularDependencies(template);

    // Validate variable references in strings
    this.validateVariableReferences(template);
  }

  /**
   * Check for circular dependencies in tasks
   */
  private async checkCircularDependencies(template: TaskTemplate): Promise<void> {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const checkDependencies = (taskPath: string): void => {
      if (recursionStack.has(taskPath)) {
        throw new Error(`Circular dependency detected involving task: ${taskPath}`);
      }

      if (visited.has(taskPath)) return;

      visited.add(taskPath);
      recursionStack.add(taskPath);

      const task = template.tasks.find(t => t.path === taskPath);
      if (task?.dependencies) {
        for (const dep of task.dependencies) {
          checkDependencies(dep);
        }
      }

      recursionStack.delete(taskPath);
    };

    for (const task of template.tasks) {
      checkDependencies(task.path);
    }
  }

  /**
   * Validate variable references in template strings
   */
  private validateVariableReferences(template: TaskTemplate): void {
    const variableNames = new Set(template.variables.map(v => v.name));

    const checkString = (str: string | undefined, context: string) => {
      if (!str) return;

      const matches = str.match(/\${(\w+)}/g) || [];
      for (const match of matches) {
        const varName = match.slice(2, -1);
        if (!variableNames.has(varName)) {
          throw new Error(
            `Invalid variable reference ${varName} in ${context}. Available variables: ${Array.from(
              variableNames
            ).join(', ')}`
          );
        }
      }
    };

    // Check all string fields that might contain variable references
    for (const task of template.tasks) {
      checkString(task.path, `task path: ${task.path}`);
      checkString(task.title, `task title: ${task.title}`);
      checkString(task.description, `task description for: ${task.path}`);

      // Check dependencies
      task.dependencies?.forEach(dep => {
        checkString(dep, `dependency in task: ${task.path}`);
      });

      // Check metadata strings recursively
      if (task.metadata) {
        this.validateMetadataStrings(task.metadata, variableNames, task.path);
      }
    }
  }

  /**
   * Recursively validate variable references in metadata
   */
  private validateMetadataStrings(
    metadata: Record<string, unknown>,
    variableNames: Set<string>,
    taskPath: string
  ): void {
    for (const [key, value] of Object.entries(metadata)) {
      if (typeof value === 'string') {
        const matches = value.match(/\${(\w+)}/g) || [];
        for (const match of matches) {
          const varName = match.slice(2, -1);
          if (!variableNames.has(varName)) {
            throw new Error(
              `Invalid variable reference ${varName} in metadata field ${key} of task ${taskPath}`
            );
          }
        }
      } else if (Array.isArray(value)) {
        value.forEach((item, index) => {
          if (typeof item === 'string') {
            const matches = item.match(/\${(\w+)}/g) || [];
            for (const match of matches) {
              const varName = match.slice(2, -1);
              if (!variableNames.has(varName)) {
                throw new Error(
                  `Invalid variable reference ${varName} in metadata array ${key}[${index}] of task ${taskPath}`
                );
              }
            }
          }
        });
      } else if (value && typeof value === 'object') {
        this.validateMetadataStrings(value as Record<string, unknown>, variableNames, taskPath);
      }
    }
  }
}
