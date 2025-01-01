import fs from 'fs/promises';
import path from 'path';
import { Task } from '../types/task.js';
import { Logger } from '../logging/index.js';
import { JsonFormatter } from './formatters/json-formatter.js';
import { MarkdownFormatter } from './formatters/markdown-formatter.js';
import { TaskFormatter } from './formatters/base-formatter.js';

export interface VisualizerConfig {
  outputDir: string;
  formats: ('json' | 'markdown')[];
  autoUpdate?: boolean;
  prettify?: boolean;
}

/**
 * Manages task visualization in various formats
 */
export class TaskVisualizer {
  private readonly logger: Logger;
  private readonly formatters: Map<string, TaskFormatter>;
  private readonly config: Required<VisualizerConfig>;
  private readonly sessionFiles: Map<string, string>;

  constructor(config: VisualizerConfig) {
    this.logger = Logger.getInstance().child({ component: 'TaskVisualizer' });

    // Initialize formatters
    this.formatters = new Map<string, TaskFormatter>();
    this.formatters.set('json', new JsonFormatter());
    this.formatters.set('markdown', new MarkdownFormatter());

    // Set default config values
    this.config = {
      outputDir: config.outputDir,
      formats: config.formats,
      autoUpdate: config.autoUpdate ?? true,
      prettify: config.prettify ?? true,
    };

    // Initialize session files map
    this.sessionFiles = new Map();

    // Ensure output directory exists
    this.initializeOutputDir().catch(error => {
      this.logger.error('Failed to initialize output directory', { error });
    });
  }

  /**
   * Update visualizations for tasks
   */
  async updateVisualizations(tasks: Task[]): Promise<void> {
    try {
      await Promise.all(this.config.formats.map(format => this.writeVisualization(tasks, format)));

      this.logger.info('Task visualizations updated', {
        taskCount: tasks.length,
        formats: this.config.formats,
      });
    } catch (error) {
      this.logger.error('Failed to update visualizations', { error });
      throw error;
    }
  }

  /**
   * Write visualization in specified format
   */
  private async writeVisualization(tasks: Task[], format: string): Promise<void> {
    const formatter = this.formatters.get(format);
    if (!formatter) {
      throw new Error(`Unsupported format: ${format}`);
    }

    try {
      const content = formatter.format(tasks);
      const filename = await this.getSessionFile(format);
      await fs.writeFile(filename, content, 'utf8');

      this.logger.debug('Visualization written', {
        format,
        filename,
        taskCount: tasks.length,
      });
    } catch (error) {
      this.logger.error('Failed to write visualization', {
        error,
        format,
      });
      throw error;
    }
  }

  /**
   * Get or create session file for format
   */
  private async getSessionFile(format: string): Promise<string> {
    // Check if we already have a session file for this format
    const existing = this.sessionFiles.get(format);
    if (existing) {
      return existing;
    }

    // Create new session file
    const sessionId = new Date().toISOString().split('T')[0]; // Use date as session ID
    const extension = format === 'markdown' ? 'md' : format;
    const filename = path.join(this.config.outputDir, `tasks-${sessionId}.${extension}`);

    // Store in session files map
    this.sessionFiles.set(format, filename);

    return filename;
  }

  /**
   * Initialize output directory
   */
  private async initializeOutputDir(): Promise<void> {
    try {
      await fs.mkdir(this.config.outputDir, { recursive: true });
    } catch (error) {
      this.logger.error('Failed to create output directory', {
        error,
        dir: this.config.outputDir,
      });
      throw error;
    }
  }

  /**
   * Clean up old visualization files
   */
  async cleanupOldFiles(): Promise<void> {
    try {
      const files = await fs.readdir(this.config.outputDir);

      // Get current session files
      const currentFiles = new Set(this.sessionFiles.values());

      // Delete old files
      await Promise.all(
        files
          .map(file => path.join(this.config.outputDir, file))
          .filter(file => !currentFiles.has(file))
          .map(file => fs.unlink(file))
      );

      this.logger.debug('Cleaned up old visualization files');
    } catch (error) {
      this.logger.error('Failed to cleanup old files', { error });
      throw error;
    }
  }
}
