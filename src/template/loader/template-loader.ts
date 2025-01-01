import { watch, FSWatcher } from 'fs';
import { readFile, readdir, stat } from 'fs/promises';
import { join, basename } from 'path';
import { nanoid } from 'nanoid';
import { Logger } from '../../logging/index.js';
import { TaskTemplate } from '../../types/template.js';
import { TemplateValidator } from './template-validator.js';
import { TemplateStorage } from '../../storage/interfaces/template-storage.js';

/**
 * Handles loading and watching template files
 */
export class TemplateLoader {
  private readonly logger: Logger;
  private readonly watchers: Map<string, FSWatcher> = new Map();
  private readonly validator: TemplateValidator;

  constructor(private readonly storage: TemplateStorage) {
    this.logger = Logger.getInstance().child({ component: 'TemplateLoader' });
    this.validator = new TemplateValidator();
  }

  /**
   * Initialize template loading from multiple directories
   */
  async initialize(templateDirs: string[]): Promise<void> {
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
      const stats = await stat(dir);
      return stats.isDirectory();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Load templates from a directory recursively
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

        validatedTemplate = await this.validator.validateTemplate(template);

        this.logger.debug('Template validation successful', {
          templateId: validatedTemplate.id,
          templateName: validatedTemplate.name,
          variables: validatedTemplate.variables.map(v => v.name),
          tasks: validatedTemplate.tasks.map(t => t.path),
        });
      } catch (error) {
        this.logger.error('Template validation failed:', {
          templateId: template.id,
          templateName: template.name,
          file: basename(path),
          error,
        });
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
   * Clean up resources
   */
  async close(): Promise<void> {
    // Close all watchers
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
  }
}
