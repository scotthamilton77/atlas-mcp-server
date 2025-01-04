import { Logger } from '../logging/index.js';
import { EventManager } from '../events/event-manager.js';
import { TaskVisualizer } from './task-visualizer.js';
import { Task } from '../types/task.js';
import { EventTypes, TaskEvent } from '../types/events.js';
import { TaskManager } from '../task/manager/task-manager.js';
import { PlatformCapabilities, PlatformPaths } from '../utils/platform-utils.js';
import path from 'path';

/**
 * Manages task visualization system with platform-agnostic file handling
 */
export class VisualizationManager {
  private static instance: VisualizationManager;
  private readonly logger: Logger;
  private readonly visualizer: TaskVisualizer;
  private readonly eventManager: EventManager;

  private constructor(
    private readonly taskManager: TaskManager,
    private readonly config: {
      baseDir: string;
    }
  ) {
    this.logger = Logger.getInstance().child({ component: 'VisualizationManager' });
    this.eventManager = EventManager.getInstance();

    // Use platform-agnostic path handling
    const visualizerDir = PlatformPaths.normalizePath(path.join(config.baseDir, 'visualizations'));
    this.visualizer = new TaskVisualizer({
      outputDir: visualizerDir,
      formats: ['markdown', 'json'],
      autoUpdate: true,
    });

    // Subscribe to task events
    this.eventManager.on(EventTypes.TASK_CREATED, this.handleTaskEvent.bind(this));
    this.eventManager.on(EventTypes.TASK_UPDATED, this.handleTaskEvent.bind(this));
    this.eventManager.on(EventTypes.TASK_DELETED, this.handleTaskEvent.bind(this));
    this.eventManager.on(EventTypes.CACHE_CLEARED, this.handleTasksClear.bind(this));
  }

  /**
   * Get singleton instance
   */
  static async initialize(
    taskManager: TaskManager,
    config: {
      baseDir: string;
    }
  ): Promise<VisualizationManager> {
    if (!VisualizationManager.instance) {
      VisualizationManager.instance = new VisualizationManager(taskManager, config);
      await VisualizationManager.instance.initializeVisualizationDir();
    }
    return VisualizationManager.instance;
  }

  static getInstance(): VisualizationManager {
    if (!VisualizationManager.instance) {
      throw new Error('VisualizationManager not initialized');
    }
    return VisualizationManager.instance;
  }

  /**
   * Initialize visualization directory with platform-appropriate permissions
   */
  private async initializeVisualizationDir(): Promise<void> {
    try {
      const visualizerDir = PlatformPaths.normalizePath(
        path.join(this.config.baseDir, 'visualizations')
      );
      this.logger.info('Initializing visualization directory', { dir: visualizerDir });

      // Create directory with platform-appropriate permissions
      await PlatformCapabilities.ensureDirectoryPermissions(visualizerDir, 0o755);

      // Get initial tasks
      const tasks = await this.getAllTasks();
      await this.visualizer.updateVisualizations(tasks);

      // Clean up any old files
      await this.visualizer.cleanupOldFiles();
    } catch (error) {
      this.logger.error('Failed to initialize visualization directory', { error });
      throw error;
    }
  }

  /**
   * Handle task events
   */
  private async handleTaskEvent(event: TaskEvent): Promise<void> {
    try {
      // Get all tasks after the event
      const tasks = await this.getAllTasks();
      await this.visualizer.updateVisualizations(tasks);

      // Clean up any old files
      await this.visualizer.cleanupOldFiles();

      this.logger.debug('Updated visualizations after task event', {
        eventType: event.type,
        taskCount: tasks.length,
      });
    } catch (error) {
      this.logger.error('Failed to handle task event', {
        error,
        eventType: event.type,
      });
    }
  }

  /**
   * Handle tasks clear event
   */
  private async handleTasksClear(): Promise<void> {
    try {
      await this.visualizer.updateVisualizations([]);
      this.logger.debug('Cleared visualizations');
    } catch (error) {
      this.logger.error('Failed to clear visualizations', { error });
    }
  }

  /**
   * Get all tasks from storage
   */
  private async getAllTasks(): Promise<Task[]> {
    try {
      return await this.taskManager.getTasksByPattern('**');
    } catch (error) {
      this.logger.error('Failed to get tasks', { error });
      return [];
    }
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    this.eventManager.removeAllListeners(EventTypes.TASK_CREATED);
    this.eventManager.removeAllListeners(EventTypes.TASK_UPDATED);
    this.eventManager.removeAllListeners(EventTypes.TASK_DELETED);
    this.eventManager.removeAllListeners(EventTypes.CACHE_CLEARED);
  }
}
