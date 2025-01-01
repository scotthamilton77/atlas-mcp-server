import { watch, FSWatcher } from 'fs';
import { readFile, readdir } from 'fs/promises';
import { join, basename } from 'path';
import { nanoid } from 'nanoid';

import { TemplateStorage } from '../storage/interfaces/template-storage.js';
import { Logger } from '../logging/index.js';
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

    // Load existing templates from all directories
    for (const dir of templateDirs) {
      try {
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
   * Load templates from a directory
   */
  private async loadTemplatesFromDirectory(dir: string): Promise<void> {
    try {
      const files = await readdir(dir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            await this.loadTemplateFromFile(join(dir, file));
          } catch (error) {
            this.logger.warn(`Failed to load template file: ${file}`, {
              error,
              file: join(dir, file),
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
      const validatedTemplate = taskTemplateSchema.parse(template);

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

    // Validate all required variables are provided
    const missingVars = template.variables
      .filter(v => v.required && !(v.name in options.variables))
      .map(v => v.name);

    if (missingVars.length) {
      throw new Error(`Missing required variables: ${missingVars.join(', ')}`);
    }

    // Combine provided variables with defaults
    const variables = { ...options.variables };
    for (const v of template.variables) {
      if (!(v.name in variables) && 'default' in v) {
        variables[v.name] = v.default;
      }
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
}
