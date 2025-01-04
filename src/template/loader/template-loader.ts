import { watch, FSWatcher } from 'fs';
import { readFile, readdir, stat } from 'fs/promises';
import { join, basename } from 'path';
import { nanoid } from 'nanoid';
import { Logger } from '../../logging/index.js';
import { TaskTemplate, isTemplateObject } from '../../types/template.js';
import { TemplateValidator } from './template-validator.js';
import { TemplateStorage } from '../../storage/interfaces/template-storage.js';
import { TemplateErrorFactory } from '../../errors/template-error.js';
import { ErrorCategory, ErrorSeverity } from '../../types/error.js';

/**
 * Handles loading and watching template files with enhanced validation
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

    const loadResults = {
      success: 0,
      failed: 0,
      errors: [] as Array<{ file: string; error: string }>,
    };

    // Load existing templates from all directories
    for (const dir of templateDirs) {
      try {
        // Check if directory exists
        const exists = await this.directoryExists(dir);
        if (!exists) {
          this.logger.warn(`Template directory does not exist: ${dir}`);
          continue;
        }

        const dirResults = await this.loadTemplatesFromDirectory(dir);
        loadResults.success += dirResults.success;
        loadResults.failed += dirResults.failed;
        loadResults.errors.push(...dirResults.errors);

        await this.setupTemplateWatcher(dir);
      } catch (error) {
        this.logger.warn(`Failed to initialize templates from directory: ${dir}`, {
          error,
          directory: dir,
        });
        // Continue with other directories even if one fails
      }
    }

    // Log final results with improved feedback
    if (loadResults.failed > 0) {
      this.logger.warn('Template loading completed with some issues', {
        successful: loadResults.success,
        failed: loadResults.failed,
        errors: loadResults.errors,
      });

      // Group errors by type for better analysis
      const errorsByType = loadResults.errors.reduce(
        (acc, curr) => {
          const errorType = curr.error.includes('validation')
            ? 'validation'
            : curr.error.includes('parsing')
              ? 'parsing'
              : 'other';
          acc[errorType] = acc[errorType] || [];
          acc[errorType].push(curr);
          return acc;
        },
        {} as Record<string, typeof loadResults.errors>
      );

      // Provide helpful feedback for each error type
      Object.entries(errorsByType).forEach(([type, errors]) => {
        const errorSummary = errors.map(e => ({
          file: e.file,
          error: e.error,
          suggestion: this.getSuggestionForError(e.error),
        }));

        this.logger.info(`${type} issues found:`, {
          count: errors.length,
          details: errorSummary,
        });
      });

      // Continue with valid templates
      this.logger.info('Proceeding with successfully loaded templates', {
        count: loadResults.success,
      });
    } else {
      this.logger.info('All templates loaded successfully', {
        templatesLoaded: loadResults.success,
      });
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
  private async loadTemplatesFromDirectory(dir: string): Promise<{
    success: number;
    failed: number;
    errors: Array<{ file: string; error: string }>;
  }> {
    const results = {
      success: 0,
      failed: 0,
      errors: [] as Array<{ file: string; error: string }>,
    };

    try {
      this.logger.info(`Loading templates from directory: ${dir}`);
      const files = await readdir(dir, { withFileTypes: true });

      for (const entry of files) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          this.logger.info(`Found subdirectory: ${entry.name}, recursing...`);
          const subResults = await this.loadTemplatesFromDirectory(fullPath);
          results.success += subResults.success;
          results.failed += subResults.failed;
          results.errors.push(...subResults.errors);
        } else if (entry.name.endsWith('.json')) {
          this.logger.info(`Found template file: ${entry.name}`);
          try {
            await this.loadTemplateFromFile(fullPath);
            results.success++;
          } catch (error) {
            results.failed++;
            results.errors.push({
              file: fullPath,
              error: error instanceof Error ? error.message : String(error),
            });
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
      throw TemplateErrorFactory.createLoadingError(
        'Failed to load templates: ' + (error instanceof Error ? error.message : String(error)),
        'TemplateLoader.loadTemplatesFromDirectory',
        {
          operation: 'template_directory_loading',
          timestamp: Date.now(),
          category: ErrorCategory.VALIDATION,
          severity: ErrorSeverity.HIGH,
          metadata: { directory: dir },
        }
      );
    }

    return results;
  }

  /**
   * Load and validate a template from a file with improved error handling
   */
  private async loadTemplateFromFile(path: string): Promise<void> {
    try {
      const content = await readFile(path, 'utf-8');
      let template: unknown;

      // Parse JSON with detailed error handling
      try {
        template = JSON.parse(content);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const lineMatch = errorMessage.match(/at position (\d+)/);
        const position = lineMatch ? parseInt(lineMatch[1]) : null;

        let detailedError = `Invalid JSON in template file: ${errorMessage}`;
        if (position !== null) {
          const context = this.getJsonErrorContext(content, position);
          detailedError += `\nError context:\n${context}`;
        }

        throw TemplateErrorFactory.createParsingError(
          detailedError,
          'TemplateLoader.loadTemplateFromFile',
          {
            operation: 'template_parsing',
            timestamp: Date.now(),
            category: ErrorCategory.VALIDATION,
            severity: ErrorSeverity.HIGH,
            metadata: {
              file: path,
              errorPosition: position,
              suggestions: this.getJsonParsingTips(errorMessage),
            },
          }
        );
      }

      // Validate and enhance template
      if (!isTemplateObject(template)) {
        throw TemplateErrorFactory.createParsingError(
          'Template must be a valid object',
          'TemplateLoader.loadTemplateFromFile',
          {
            operation: 'template_parsing',
            timestamp: Date.now(),
            category: ErrorCategory.VALIDATION,
            severity: ErrorSeverity.HIGH,
            metadata: { file: path },
          }
        );
      }

      // Generate ID if not present
      if (!('id' in template)) {
        template.id = nanoid();
      }

      // Add metadata if missing
      if (!('metadata' in template)) {
        template.metadata = {
          created: new Date().toISOString(),
          version: '1.0.0',
        };
      }

      // Validate template structure with detailed feedback
      this.logger.debug('Validating template:', {
        templateId: template.id,
        templateName: template.name,
        file: basename(path),
      });

      let validatedTemplate: TaskTemplate;
      try {
        validatedTemplate = await this.validator.validateTemplate(template);

        this.logger.debug('Template validation successful', {
          templateId: validatedTemplate.id,
          templateName: validatedTemplate.name,
          variables: validatedTemplate.variables.map(v => v.name),
          tasks: validatedTemplate.tasks.map(t => t.path),
          metadata: validatedTemplate.metadata || {},
        });
      } catch (error) {
        // Enhance error message with context and suggestions
        const errorMessage = error instanceof Error ? error.message : String(error);
        const enhancedError = this.enhanceValidationError(errorMessage, path);
        throw TemplateErrorFactory.createValidationError(
          enhancedError.message,
          'TemplateLoader.loadTemplateFromFile',
          {
            operation: 'template_validation',
            timestamp: Date.now(),
            category: ErrorCategory.VALIDATION,
            severity: ErrorSeverity.HIGH,
            metadata: {
              file: path,
              suggestions: enhancedError.suggestions,
            },
          }
        );
      }

      // Store template
      await this.storage.saveTemplate(validatedTemplate);

      this.logger.info('Template loaded successfully', {
        templateId: validatedTemplate.id,
        name: validatedTemplate.name,
        file: basename(path),
        path,
        taskCount: validatedTemplate.tasks.length,
        variableCount: validatedTemplate.variables.length,
      });
    } catch (error) {
      this.logger.error('Failed to load template file', {
        error,
        file: path,
        suggestion: this.getSuggestionForError(
          error instanceof Error ? error.message : String(error)
        ),
      });
      throw error;
    }
  }

  /**
   * Get context around JSON parsing error
   */
  private getJsonErrorContext(content: string, position: number, contextLines: number = 3): string {
    const lines = content.split('\n');
    let currentPos = 0;
    let errorLine = 0;
    let errorColumn = 0;

    // Find the line and column of the error
    for (let i = 0; i < lines.length; i++) {
      if (currentPos + lines[i].length >= position) {
        errorLine = i;
        errorColumn = position - currentPos;
        break;
      }
      currentPos += lines[i].length + 1; // +1 for newline
    }

    // Get context lines
    const start = Math.max(0, errorLine - contextLines);
    const end = Math.min(lines.length, errorLine + contextLines + 1);
    const context = lines.slice(start, end).map((line, i) => {
      const lineNumber = start + i + 1;
      const pointer = lineNumber === errorLine + 1 ? '^'.padStart(errorColumn + 1) : '';
      return `${lineNumber.toString().padStart(4)}: ${line}\n${pointer ? '     ' + pointer + '\n' : ''}`;
    });

    return context.join('');
  }

  /**
   * Get helpful suggestions for JSON parsing errors
   */
  private getJsonParsingTips(error: string): string[] {
    const tips = [];
    if (error.includes('Unexpected token')) tips.push('Check for missing or extra commas');
    if (error.includes('end of input')) tips.push('Check for missing closing brackets or braces');
    if (error.includes('Unexpected string'))
      tips.push('Ensure property names are enclosed in double quotes');
    return tips;
  }

  /**
   * Enhance validation error with context and suggestions
   */
  private enhanceValidationError(
    error: string,
    path: string
  ): { message: string; suggestions: string[] } {
    const suggestions: string[] = [];
    const enhancedMessage = `Template validation failed in ${basename(path)}:\n${error}`;

    if (error.includes('path format')) {
      suggestions.push(
        'Ensure path segments use allowed characters (alphanumeric, hyphens, underscores)',
        'Template variables should be in ${variableName} format',
        'Avoid spaces and special characters in paths'
      );
    }

    if (error.includes('duplicate')) {
      suggestions.push(
        'Check for tasks with identical paths',
        'Ensure template variable combinations will produce unique paths'
      );
    }

    if (error.includes('dependencies')) {
      suggestions.push(
        'Verify all referenced task paths exist',
        'Check for circular dependencies',
        'Ensure parent tasks are defined before child tasks'
      );
    }

    return {
      message: enhancedMessage,
      suggestions,
    };
  }

  /**
   * Get suggestion for general template errors
   */
  private getSuggestionForError(error: string): string {
    if (error.includes('validation')) {
      return 'Review template structure and ensure it matches the required schema';
    }
    if (error.includes('parsing')) {
      return 'Check JSON syntax for missing commas, quotes, or brackets';
    }
    if (error.includes('path')) {
      return 'Verify task paths follow the required format and use valid characters';
    }
    return 'Double-check template format and try again';
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
