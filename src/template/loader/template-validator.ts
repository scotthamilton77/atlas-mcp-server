import { Logger } from '../../logging/index.js';
import { z } from 'zod';
import { TaskTemplate } from '../../types/template.js';
import { taskTemplateSchema } from '../validation/schemas/template-schemas.js';

/**
 * Template validation result with detailed feedback
 */
export interface TemplateValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
  details?: {
    metadata?: {
      invalidFields?: string[];
      missingRequired?: string[];
      securityIssues?: string[];
    };
    tasks?: {
      invalidPaths?: string[];
      missingParents?: string[];
      duplicatePaths?: string[];
      invalidDependencies?: Array<{
        task: string;
        dependency: string;
        reason: string;
      }>;
      cycles?: string[];
    };
    hierarchy?: {
      maxDepthExceeded?: boolean;
      invalidRelationships?: string[];
      recommendations?: string[];
    };
    performance?: {
      validationTime: number;
      taskCount: number;
      dependencyCount: number;
      recommendations?: string[];
    };
  };
}

/**
 * Enhanced template validator with comprehensive validation
 */
export class TemplateValidator {
  private readonly logger: Logger;

  constructor() {
    this.logger = Logger.getInstance().child({ component: 'TemplateValidator' });
  }

  /**
   * Validate a template with detailed feedback
   */
  async validateTemplate(template: unknown): Promise<TaskTemplate> {
    const startTime = Date.now();
    const result: TemplateValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      details: {
        metadata: {},
        tasks: {},
        hierarchy: {},
        performance: {
          validationTime: 0,
          taskCount: 0,
          dependencyCount: 0,
        },
      },
    };

    try {
      this.logger.debug('Starting template validation');

      // Schema validation
      const validatedTemplate = taskTemplateSchema.parse(template);

      // Track performance metrics
      result.details!.performance!.taskCount = validatedTemplate.tasks.length;
      result.details!.performance!.dependencyCount = validatedTemplate.tasks.reduce(
        (count, task) => count + (task.dependencies?.length || 0),
        0
      );

      // Validate task paths and hierarchy
      const paths = new Set<string>();
      for (const task of validatedTemplate.tasks) {
        // Sanitize and validate path format
        const sanitizedPath = this.sanitizePath(task.path);
        if (sanitizedPath !== task.path) {
          result.warnings!.push(`Path sanitized: "${task.path}" -> "${sanitizedPath}"`);
          task.path = sanitizedPath;
        }

        if (!this.validatePathFormat(sanitizedPath)) {
          result.warnings!.push(`Path format issues in: ${sanitizedPath}`);
          // Don't fail validation, just warn about format issues
        }

        // Check for duplicate paths
        if (paths.has(sanitizedPath)) {
          result.isValid = false;
          result.errors.push(`Duplicate task path: ${sanitizedPath}`);
          result.details!.tasks!.duplicatePaths = result.details!.tasks!.duplicatePaths || [];
          result.details!.tasks!.duplicatePaths.push(sanitizedPath);
        }
        paths.add(sanitizedPath);

        // Check parent path exists (more lenient with template variables)
        const parentPath = this.getParentPath(sanitizedPath);
        if (parentPath && !this.hasMatchingPath(parentPath, paths)) {
          result.warnings!.push(
            `Parent path may be missing: ${parentPath} for task: ${sanitizedPath}`
          );
          // Don't fail validation, just warn about potential hierarchy issues
        }

        // Check dependencies exist (more lenient with template variables)
        if (task.dependencies) {
          for (const dep of task.dependencies) {
            const sanitizedDep = this.sanitizePath(dep);
            if (!this.hasMatchingPath(sanitizedDep, paths)) {
              result.warnings!.push(
                `Dependency path may be missing: ${sanitizedDep} in task: ${sanitizedPath}`
              );
              // Don't fail validation, just warn about potential dependency issues
            }
          }
        }
      }

      // Check for circular dependencies
      const cycles = this.detectDependencyCycles(validatedTemplate.tasks);
      if (cycles.length > 0) {
        result.warnings!.push('Potential circular dependencies detected');
        result.details!.tasks!.cycles = cycles;
        // Don't fail validation, just warn about potential cycles
      }

      // Performance recommendations
      if (validatedTemplate.tasks.length > 50) {
        result.warnings!.push('Large number of tasks may impact performance');
        result.details!.performance!.recommendations = [
          'Consider breaking template into smaller, focused templates',
          'Review task hierarchy for optimization opportunities',
          'Minimize dependency chains',
        ];
      }

      // Calculate final validation time
      result.details!.performance!.validationTime = Date.now() - startTime;

      // Log validation results
      if (result.warnings!.length > 0) {
        this.logger.warn('Template validation completed with warnings:', {
          templateId: validatedTemplate.id,
          warnings: result.warnings,
        });
      }

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
   * Validate and normalize path format
   */
  private validatePathFormat(path: string): boolean {
    // Extract template variables
    const templateVars = path.match(/\${[a-zA-Z][a-zA-Z0-9_]*}/g) || [];

    // Replace template variables with placeholders for validation
    let normalizedPath = path;
    templateVars.forEach((variable, index) => {
      normalizedPath = normalizedPath.replace(variable, `var${index}`);
    });

    // Basic path structure validation
    if (!/^[a-zA-Z0-9]/.test(normalizedPath)) {
      this.logger.warn('Path should start with alphanumeric character:', { path });
      return false;
    }

    // Check allowed characters (excluding template variables)
    if (!/^[a-zA-Z0-9][a-zA-Z0-9\-_/]*$/.test(normalizedPath)) {
      this.logger.warn('Path contains potentially invalid characters:', {
        path,
        allowedPattern: 'alphanumeric, hyphens, underscores, and forward slashes',
      });
      return false;
    }

    // Check segment length
    const segments = normalizedPath.split('/');
    const longSegments = segments.filter(s => s.length > 50);
    if (longSegments.length > 0) {
      this.logger.warn('Path segments exceed recommended length:', {
        path,
        maxLength: 50,
        longSegments,
      });
      return false;
    }

    // Check depth
    if (segments.length > 10) {
      this.logger.warn('Path exceeds recommended depth:', {
        path,
        maxDepth: 10,
        actualDepth: segments.length,
      });
      return false;
    }

    return true;
  }

  /**
   * Sanitize path for consistent format
   */
  private sanitizePath(path: string): string {
    // Normalize separators
    let sanitized = path.replace(/\\/g, '/');

    // Remove consecutive slashes
    sanitized = sanitized.replace(/\/+/g, '/');

    // Remove trailing slash
    sanitized = sanitized.replace(/\/$/, '');

    // Replace invalid characters with hyphens (preserving template variables)
    const parts: string[] = [];
    let currentPart = '';
    let inVariable = false;

    for (let i = 0; i < sanitized.length; i++) {
      const char = sanitized[i];

      if (char === '$' && sanitized[i + 1] === '{') {
        if (currentPart) {
          parts.push(currentPart);
          currentPart = '';
        }
        inVariable = true;
        currentPart = char;
      } else if (inVariable) {
        currentPart += char;
        if (char === '}') {
          parts.push(currentPart);
          currentPart = '';
          inVariable = false;
        }
      } else {
        if (/[a-zA-Z0-9\-_/]/.test(char)) {
          currentPart += char;
        } else {
          currentPart += '-';
        }
      }
    }

    if (currentPart) {
      parts.push(currentPart);
    }

    sanitized = parts.join('');

    // Replace multiple hyphens with single hyphen
    sanitized = sanitized.replace(/-+/g, '-');

    return sanitized;
  }

  /**
   * Get parent path handling template variables
   */
  private getParentPath(path: string): string | null {
    const segments = path.split('/');
    if (segments.length <= 1) return null;
    return segments.slice(0, -1).join('/');
  }

  /**
   * Check if a path with template variables exists in the set
   */
  private hasMatchingPath(path: string, paths: Set<string>): boolean {
    // Direct match
    if (paths.has(path)) return true;

    // Convert path to regex pattern
    const pattern = path.replace(/\${[^}]+}/g, '[^/]+');
    const regex = new RegExp(`^${pattern}$`);

    // Check for matching paths
    for (const existingPath of paths) {
      if (regex.test(existingPath)) return true;
    }

    return false;
  }

  /**
   * Detect circular dependencies in tasks
   */
  private detectDependencyCycles(tasks: TaskTemplate['tasks']): string[] {
    const cycles: string[] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const pathStack: string[] = [];

    const visit = (taskPath: string) => {
      if (recursionStack.has(taskPath)) {
        // Found cycle - capture the path
        const cycleStart = pathStack.indexOf(taskPath);
        cycles.push([...pathStack.slice(cycleStart), taskPath].join(' -> '));
        return;
      }

      if (visited.has(taskPath)) {
        return;
      }

      visited.add(taskPath);
      recursionStack.add(taskPath);
      pathStack.push(taskPath);

      const task = tasks.find(t => t.path === taskPath);
      if (task?.dependencies) {
        for (const dep of task.dependencies) {
          visit(dep);
        }
      }

      recursionStack.delete(taskPath);
      pathStack.pop();
    };

    for (const task of tasks) {
      visit(task.path);
    }

    return cycles;
  }
}
