import { TemplateStorage } from '../interfaces/template-storage.js';
import { Logger } from '../../logging/index.js';
import { TemplateInfo, TaskTemplate } from '../../types/template.js';
import { TaskStorage } from '../../types/storage.js';
import { SqliteStorage } from './storage.js';
import { SqliteConnection } from './database/connection.js';

/**
 * SQLite-specific template storage implementation
 */
export class SqliteTemplateStorage implements TemplateStorage {
  private connection: SqliteConnection;

  constructor(
    taskStorage: TaskStorage,
    private readonly logger: Logger
  ) {
    // Access the underlying SQLite connection from the task storage
    const sqliteStorage = taskStorage as SqliteStorage;
    if (!sqliteStorage['connection']) {
      throw new Error('TaskStorage does not have a SQLite connection');
    }
    this.connection = sqliteStorage['connection'];
  }

  /**
   * Initialize template storage
   */
  async initialize(): Promise<void> {
    try {
      await this.connection.execute(async db => {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS templates (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            version TEXT NOT NULL,
            author TEXT,
            tags TEXT,
            variables JSON NOT NULL,
            tasks JSON NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          )
        `);
      }, 'initializeTemplates');
    } catch (error) {
      this.logger.error('Failed to initialize template storage', { error });
      throw error;
    }
  }

  /**
   * Store a template
   */
  async saveTemplate(template: TaskTemplate): Promise<void> {
    try {
      await this.connection.execute(async db => {
        await db.run(
          `
          INSERT OR REPLACE INTO templates (
            id, name, description, version, author, tags,
            variables, tasks, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          [
            template.id,
            template.name,
            template.description,
            template.version,
            template.author || null,
            template.tags ? JSON.stringify(template.tags) : null,
            JSON.stringify(template.variables),
            JSON.stringify(template.tasks),
            Date.now(),
            Date.now(),
          ]
        );
      }, 'saveTemplate');

      this.logger.info('Template saved successfully', {
        templateId: template.id,
        name: template.name,
      });
    } catch (error) {
      this.logger.error('Failed to save template', { error, template });
      throw error;
    }
  }

  /**
   * Get a template by ID
   */
  async getTemplate(id: string): Promise<TaskTemplate> {
    try {
      const result = await this.connection.execute(async db => {
        return await db.get('SELECT * FROM templates WHERE id = ?', [id]);
      }, 'getTemplate');

      if (!result) {
        throw new Error(`Template not found: ${id}`);
      }

      return {
        id: result.id,
        name: result.name,
        description: result.description,
        version: result.version,
        author: result.author,
        tags: result.tags ? JSON.parse(result.tags) : undefined,
        variables: JSON.parse(result.variables),
        tasks: JSON.parse(result.tasks),
      };
    } catch (error) {
      this.logger.error('Failed to get template', { error, id });
      throw error;
    }
  }

  /**
   * List all templates, optionally filtered by tag
   */
  async listTemplates(tag?: string): Promise<TemplateInfo[]> {
    try {
      const query = tag
        ? `
          SELECT * FROM templates 
          WHERE tags LIKE ? 
          ORDER BY name ASC
        `
        : `
          SELECT * FROM templates 
          ORDER BY name ASC
        `;

      const params = tag ? [`%${tag}%`] : [];
      const results = await this.connection.execute(async db => {
        return await db.all(query, params);
      }, 'listTemplates');

      return results.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        version: row.version,
        author: row.author,
        tags: row.tags ? JSON.parse(row.tags) : undefined,
        variableCount: JSON.parse(row.variables).length,
        taskCount: JSON.parse(row.tasks).length,
      }));
    } catch (error) {
      this.logger.error('Failed to list templates', { error, tag });
      throw error;
    }
  }

  /**
   * Delete a template
   */
  async deleteTemplate(id: string): Promise<void> {
    try {
      const result = await this.connection.execute(async db => {
        return await db.run('DELETE FROM templates WHERE id = ?', [id]);
      }, 'deleteTemplate');

      if (result.changes === 0) {
        throw new Error(`Template not found: ${id}`);
      }

      this.logger.info('Template deleted successfully', {
        templateId: id,
      });
    } catch (error) {
      this.logger.error('Failed to delete template', { error, id });
      throw error;
    }
  }

  /**
   * Clean up resources
   */
  async close(): Promise<void> {
    // No cleanup needed for SQLite storage
  }
}
