import { promises as fs } from 'fs';
import path from 'path';
import { Task } from '../types/task.js';
import { PlatformCapabilities, PlatformPaths } from '../utils/platform-utils.js';

interface TaskVisualizerConfig {
  outputDir: string;
  formats?: ('json' | 'markdown')[];
  autoUpdate?: boolean;
}

/**
 * Handles task visualization with platform-agnostic file operations
 */
export class TaskVisualizer {
  private readonly outputDir: string;
  private readonly formats: ('json' | 'markdown')[];
  private readonly autoUpdate: boolean;
  private currentFiles: Set<string> = new Set();

  constructor(config: TaskVisualizerConfig) {
    this.outputDir = PlatformPaths.normalizePath(config.outputDir);
    this.formats = config.formats || ['markdown'];
    this.autoUpdate = config.autoUpdate || false;
  }

  /**
   * Update task visualizations with platform-appropriate file handling
   */
  async updateVisualizations(tasks: Task[]): Promise<void> {
    const timestamp = new Date().toISOString().split('T')[0];
    const sessionId = timestamp;

    for (const format of this.formats) {
      const extension = format === 'markdown' ? 'md' : format;
      const filename = PlatformPaths.normalizePath(
        path.join(this.outputDir, `tasks-${sessionId}.${extension}`)
      );

      // Create directory with platform-appropriate permissions
      await PlatformCapabilities.ensureDirectoryPermissions(path.dirname(filename), 0o755);

      // Generate and write content
      const content =
        format === 'markdown' ? this.generateMarkdown(tasks) : this.generateJson(tasks);
      await fs.writeFile(filename, content, 'utf-8');
      this.currentFiles.add(filename);
    }
  }

  /**
   * Clean up old visualization files with platform-agnostic path handling
   */
  async cleanupOldFiles(): Promise<void> {
    try {
      const files = await fs.readdir(this.outputDir);
      const currentFiles = new Set(
        Array.from(this.currentFiles).map(file => PlatformPaths.normalizePath(file))
      );

      for (const file of files) {
        const fullPath = PlatformPaths.normalizePath(path.join(this.outputDir, file));
        if (!currentFiles.has(fullPath) && /^tasks-.*\.(json|md)$/.test(file)) {
          await fs.unlink(fullPath);
        }
      }
    } catch (error) {
      // Ignore cleanup errors
      console.warn('Failed to cleanup old visualization files:', error);
    }
  }

  private generateMarkdown(tasks: Task[]): string {
    return (
      `# Task Visualization\n\nGenerated: ${new Date().toISOString()}\n\n` +
      tasks.map(task => this.formatTaskMarkdown(task)).join('\n\n')
    );
  }

  private generateJson(tasks: Task[]): string {
    return JSON.stringify(
      {
        generated: new Date().toISOString(),
        tasks: tasks.map(task => ({
          ...task,
          visualizationMetadata: {
            platform: process.platform,
            timestamp: new Date().toISOString(),
          },
        })),
      },
      null,
      2
    );
  }

  private formatTaskMarkdown(task: Task, level = 0): string {
    const indent = '  '.repeat(level);
    const status = task.status ? ` [${task.status}]` : '';
    const metadata = task.metadata ? `\n${indent}Metadata: ${JSON.stringify(task.metadata)}` : '';

    return `${indent}- ${task.path}${status}${metadata}`;
  }
}
