import { watch, FSWatcher } from 'fs';
import { readFile, readdir } from 'fs/promises';
import { join, basename } from 'path';
import { nanoid } from 'nanoid';
import { Resource, ResourceTemplate } from '@modelcontextprotocol/sdk/types.js';

import { TemplateStorage } from '../storage/interfaces/template-storage.js';
import { Logger } from '../logging/index.js';
import { z } from 'zod';
import {
  TaskTemplate,
  TemplateInfo,
  taskTemplateSchema,
  TemplateInstantiationOptions,
} from '../types/template.js';
import { TaskManager } from '../task/manager/task-manager.js';
import { TaskType } from '../types/task.js';

/**
 * Manages task templates including storage, validation, and instantiation
 */
export class TemplateManager {
  private storage: TemplateStorage;
  private taskManager: TaskManager;
  private logger: Logger;
  private watchers: Map<string, FSWatcher> = new Map();

  constructor(storage: TemplateStorage, taskManager: TaskManager, logger: Logger) {
    this.storage = storage;
    this.taskManager = taskManager;
    this.logger = logger;
  }

  /**
   * Initialize the template system with multiple template directories
   */
  async initialize(templateDirs: string[]): Promise<void> {
    // Initialize storage
    await this.storage.initialize();

    this.logger.info('Initializing template directories:', {
      directories: templateDirs,
      cwd: process.cwd(),
    });

    // Load existing templates from all directories
    for (const dir of templateDirs) {
      try {
        // Check if directory exists
        const exists = await this.directoryExists(dir);
        if (!exists) {
          this.logger.warn(`Template directory does not exist: ${dir}`);
          continue;
        }

        await this.loadTemplatesFromDirectory(dir);
        await this.setupTemplateWatcher(dir);
      } catch (error) {
        this.logger.warn(`Failed to initialize templates from directory: ${dir}`, {
          error,
          directory: dir,
        });
        // Continue with other directories even if one fails
      }
    }
  }

  /**
   * Check if a directory exists
   */
  private async directoryExists(dir: string): Promise<boolean> {
    try {
      const stats = await import('fs/promises').then(fs => fs.stat(dir));
      return stats.isDirectory();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Load templates from a directory
   */
  private async loadTemplatesFromDirectory(dir: string): Promise<void> {
    try {
      this.logger.info(`Loading templates from directory: ${dir}`);
      const files = await readdir(dir, { withFileTypes: true });
      for (const entry of files) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          this.logger.info(`Found subdirectory: ${entry.name}, recursing...`);
          await this.loadTemplatesFromDirectory(fullPath);
        } else if (entry.name.endsWith('.json')) {
          this.logger.info(`Found template file: ${entry.name}`);
          try {
            await this.loadTemplateFromFile(fullPath);
          } catch (error) {
            this.logger.warn(`Failed to load template file: ${entry.name}`, {
              error,
              file: fullPath,
            });
            // Continue with other files even if one fails
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to load templates from directory', {
        error,
        directory: dir,
      });
      throw new Error(
        'Failed to load templates: ' + (error instanceof Error ? error.message : String(error))
      );
    }
  }

  /**
   * Load and validate a template from a file
   */
  private async loadTemplateFromFile(path: string): Promise<void> {
    try {
      const content = await readFile(path, 'utf-8');
      const template = JSON.parse(content);

      // Generate ID if not present
      if (!template.id) {
        template.id = nanoid();
      }

      // Validate template structure
      this.logger.debug('Validating template:', {
        templateId: template.id,
        templateName: template.name,
        file: basename(path),
      });

      let validatedTemplate: TaskTemplate;
      try {
        this.logger.debug('Template pre-validation:', {
          id: template.id,
          name: template.name,
          variableCount: template.variables?.length ?? 0,
          taskCount: template.tasks?.length ?? 0,
          file: basename(path),
        });

        validatedTemplate = taskTemplateSchema.parse(template);

        this.logger.debug('Template validation successful', {
          templateId: validatedTemplate.id,
          templateName: validatedTemplate.name,
          variables: validatedTemplate.variables.map(v => v.name),
          tasks: validatedTemplate.tasks.map(t => t.path),
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          this.logger.error('Template validation failed:', {
            templateId: template.id,
            templateName: template.name,
            file: basename(path),
            errors: error.errors.map((e: z.ZodIssue) => ({
              path: e.path.join('.'),
              message: e.message,
              code: e.code,
            })),
          });
        } else {
          this.logger.error('Unexpected validation error:', {
            error,
            templateId: template.id,
            templateName: template.name,
            file: basename(path),
          });
        }
        throw error;
      }

      // Store template
      await this.storage.saveTemplate(validatedTemplate);

      this.logger.info('Template loaded successfully', {
        templateId: validatedTemplate.id,
        name: validatedTemplate.name,
        file: basename(path),
        path,
      });
    } catch (error) {
      this.logger.error('Failed to load template file', {
        error,
        file: path,
      });
      throw new Error(
        'Failed to load template: ' + (error instanceof Error ? error.message : String(error))
      );
    }
  }

  /**
   * Watch template directory for changes
   */
  private async setupTemplateWatcher(dir: string): Promise<void> {
    // Close existing watcher for this directory if any
    this.watchers.get(dir)?.close();

    const watcher = watch(dir, { persistent: false }, async (eventType, filename) => {
      if (filename && filename.endsWith('.json')) {
        const path = join(dir, filename);
        try {
          if (eventType === 'change' || eventType === 'rename') {
            await this.loadTemplateFromFile(path);
          }
        } catch (error) {
          this.logger.error('Error handling template file change', {
            error,
            file: filename,
            directory: dir,
          });
        }
      }
    });

    this.watchers.set(dir, watcher);
  }

  /**
   * List available templates
   */
  async listTemplates(tag?: string): Promise<TemplateInfo[]> {
    return this.storage.listTemplates(tag);
  }

  /**
   * Get a specific template by ID
   */
  async getTemplate(id: string): Promise<TaskTemplate> {
    return this.storage.getTemplate(id);
  }

  /**
   * Instantiate a template with provided variables
   */
  async instantiateTemplate(options: TemplateInstantiationOptions): Promise<void> {
    const template = await this.getTemplate(options.templateId);

    // Combine provided variables with defaults
    const variables = { ...options.variables };
    for (const v of template.variables) {
      if (!(v.name in variables) && 'default' in v) {
        variables[v.name] = v.default;
      }
    }

    // Validate all required variables are provided (after applying defaults)
    const missingVars = template.variables
      .filter(v => v.required && !(v.name in variables))
      .map(v => v.name);

    if (missingVars.length) {
      throw new Error(`Missing required variables: ${missingVars.join(', ')}`);
    }

    // Create tasks
    for (const task of template.tasks) {
      // Interpolate variables in strings
      const interpolatedTask = {
        ...task,
        path: this.interpolateVariables(task.path, variables),
        title: this.interpolateVariables(task.title, variables),
        description: task.description
          ? this.interpolateVariables(task.description, variables)
          : undefined,
        dependencies: task.dependencies?.map(d => this.interpolateVariables(d, variables)),
      };

      // Prepend parent path if provided
      if (options.parentPath) {
        interpolatedTask.path = `${options.parentPath}/${interpolatedTask.path}`;
        if (interpolatedTask.dependencies) {
          interpolatedTask.dependencies = interpolatedTask.dependencies.map(
            d => `${options.parentPath}/${d}`
          );
        }
      }

      // Create task
      await this.taskManager.createTask({
        path: interpolatedTask.path,
        name: interpolatedTask.title,
        description: interpolatedTask.description,
        type: interpolatedTask.type === 'TASK' ? TaskType.TASK : TaskType.MILESTONE,
        metadata: interpolatedTask.metadata,
        dependencies: interpolatedTask.dependencies,
      });
    }
  }

  /**
   * Interpolate variables in a string
   */
  private interpolateVariables(str: string, variables: Record<string, unknown>): string {
    return str.replace(/\${(\w+)}/g, (_, key) => {
      if (!(key in variables)) {
        throw new Error(`Variable not found: ${key}`);
      }
      return String(variables[key]);
    });
  }

  /**
   * Clean up resources
   */
  async close(): Promise<void> {
    // Close all watchers
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
    await this.storage.close();
  }

  // Resource-related methods
  async listTemplateResources(): Promise<Resource[]> {
    return [
      {
        uri: 'templates://current',
        name: 'Available Templates',
        description: 'List of all available task templates with their metadata and variables',
        mimeType: 'application/json',
      },
    ];
  }

  async getTemplateResource(uri: string): Promise<Resource> {
    if (uri !== 'templates://current') {
      throw new Error(`Invalid template resource URI: ${uri}`);
    }

    // Get full template details for each template
    const templateInfos = await this.listTemplates();
    const fullTemplates = await Promise.all(templateInfos.map(info => this.getTemplate(info.id)));

    const templateOverview = {
      timestamp: new Date().toISOString(),
      totalTemplates: fullTemplates.length,
      templates: fullTemplates.map(template => ({
        id: template.id,
        name: template.name,
        description: template.description,
        tags: template.tags,
        variables: template.variables.map(v => ({
          name: v.name,
          description: v.description,
          required: v.required,
          default: v.default,
        })),
      })),
    };

    return {
      uri,
      name: 'Available Templates',
      mimeType: 'application/json',
      text: JSON.stringify(templateOverview, null, 2),
    };
  }

  async getResourceTemplates(): Promise<ResourceTemplate[]> {
    return []; // No dynamic templates needed since we use a single resource
  }

  async resolveResourceTemplate(
    _template: string,
    _vars: Record<string, string>
  ): Promise<Resource> {
    throw new Error('Resource templates not supported - use templates://current instead');
  }
}
