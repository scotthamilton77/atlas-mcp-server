import { Resource, ResourceTemplate } from '@modelcontextprotocol/sdk/types.js';
import { TaskManager } from '../task/manager/task-manager.js';
import { TaskType } from '../types/task-types.js';
import { TemplateStorage } from '../storage/interfaces/template-storage.js';
import {
  TaskTemplate,
  TemplateInfo,
  TemplateInstantiationOptions,
  TemplateTask,
} from '../types/template.js';
import { TemplateLoader } from './loader/template-loader.js';
import { VariableInterpolator } from './interpolation/variable-interpolator.js';
import { MetadataTransformer } from './interpolation/metadata-transformer.js';

/**
 * Manages task templates including storage, validation, and instantiation
 */
export class TemplateManager {
  private readonly loader: TemplateLoader;
  private readonly interpolator: VariableInterpolator;
  private readonly transformer: MetadataTransformer;
  private readonly processingTemplates: Set<string> = new Set();

  constructor(
    private readonly storage: TemplateStorage,
    private readonly taskManager: TaskManager
  ) {
    this.loader = new TemplateLoader(storage);
    this.interpolator = new VariableInterpolator();
    this.transformer = new MetadataTransformer();
  }

  /**
   * Initialize the template system
   */
  async initialize(templateDirs: string[]): Promise<void> {
    await this.storage.initialize();
    await this.loader.initialize(templateDirs);
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
    if (this.processingTemplates.has(options.templateId)) {
      throw new Error(`Circular template reference detected: ${options.templateId}`);
    }

    this.processingTemplates.add(options.templateId);

    try {
      const template = await this.getTemplate(options.templateId);

      // Combine provided variables with defaults
      const variables = { ...options.variables };
      for (const v of template.variables) {
        if (!(v.name in variables) && 'default' in v) {
          variables[v.name] = v.default;
        }
      }

      // Validate required variables
      const missingVars = this.interpolator.validateRequiredVariables(
        template.variables,
        variables
      );
      if (missingVars.length) {
        throw new Error(`Missing required variables: ${missingVars.join(', ')}`);
      }

      // Create tasks
      for (const task of template.tasks) {
        await this.processTemplateTask(task, variables, options.parentPath);
      }
    } finally {
      this.processingTemplates.delete(options.templateId);
    }
  }

  /**
   * Process a single template task
   */
  private async processTemplateTask(
    task: TemplateTask,
    variables: Record<string, unknown>,
    parentPath?: string
  ): Promise<void> {
    // Interpolate variables in strings and metadata first
    const interpolatedTask = {
      path: this.interpolator.interpolateString(task.path, variables),
      title: this.interpolator.interpolateString(task.title, variables),
      type: task.type,
      description: task.description
        ? this.interpolator.interpolateString(task.description, variables)
        : undefined,
      dependencies: task.dependencies?.map(d => this.interpolator.interpolateString(d, variables)),
      metadata: task.metadata
        ? this.interpolator.interpolateMetadata(task.metadata, variables)
        : undefined,
    };

    // Prepend parent path if provided
    if (parentPath) {
      interpolatedTask.path = `${parentPath}/${interpolatedTask.path}`;
      if (interpolatedTask.dependencies) {
        interpolatedTask.dependencies = interpolatedTask.dependencies.map(
          d => `${parentPath}/${d}`
        );
      }
    }

    // Transform the interpolated metadata
    const transformedMetadata = interpolatedTask.metadata
      ? this.transformer.transform(interpolatedTask.metadata)
      : undefined;

    // Check for nested template reference
    const templateRef =
      transformedMetadata && this.transformer.extractTemplateRef(transformedMetadata);

    if (templateRef) {
      // Create the task without the templateRef
      const cleanMetadata = this.transformer.removeTemplateRef(transformedMetadata);
      await this.taskManager.createTask({
        path: interpolatedTask.path,
        name: interpolatedTask.title,
        description: interpolatedTask.description,
        type: interpolatedTask.type === 'TASK' ? TaskType.TASK : TaskType.MILESTONE,
        metadata: cleanMetadata,
        dependencies: interpolatedTask.dependencies,
      });

      // Process nested template
      await this.instantiateTemplate({
        templateId: templateRef.template,
        variables: templateRef.variables,
        parentPath: interpolatedTask.path,
      });
    } else {
      // Create task normally
      await this.taskManager.createTask({
        path: interpolatedTask.path,
        name: interpolatedTask.title,
        description: interpolatedTask.description,
        type: interpolatedTask.type === 'TASK' ? TaskType.TASK : TaskType.MILESTONE,
        metadata: transformedMetadata,
        dependencies: interpolatedTask.dependencies,
      });
    }
  }

  /**
   * Clean up resources
   */
  async close(): Promise<void> {
    await this.loader.close();
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
