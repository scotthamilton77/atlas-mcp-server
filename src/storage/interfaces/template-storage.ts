import { TemplateInfo, TaskTemplate } from '../../types/template.js';

/**
 * Interface for template storage operations
 */
export interface TemplateStorage {
  /**
   * Initialize template storage
   */
  initialize(): Promise<void>;

  /**
   * Store a template
   */
  saveTemplate(template: TaskTemplate): Promise<void>;

  /**
   * Get a template by ID
   */
  getTemplate(id: string): Promise<TaskTemplate>;

  /**
   * List all templates, optionally filtered by tag
   */
  listTemplates(tag?: string): Promise<TemplateInfo[]>;

  /**
   * Delete a template
   */
  deleteTemplate(id: string): Promise<void>;

  /**
   * Clean up resources
   */
  close(): Promise<void>;
}
