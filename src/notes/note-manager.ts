import { promises as fs } from 'fs';
import * as path from 'path';
import { Logger } from '../logging/index.js';
import { LoadedNote, NotesConfig } from '../types/notes.js';
import { ErrorCodes, createError } from '../errors/index.js';

export class NoteManager {
  private static instance: NoteManager;
  private readonly logger: Logger;
  private notes: Map<string, LoadedNote> = new Map();
  private configPath: string;
  private notesDir: string;

  private constructor(configPath: string, notesDir: string) {
    this.logger = Logger.getInstance().child({ component: 'NoteManager' });
    this.configPath = configPath;
    this.notesDir = notesDir;
  }

  static async getInstance(configPath?: string, notesDir?: string): Promise<NoteManager> {
    if (!NoteManager.instance) {
      if (!configPath || !notesDir) {
        throw createError(
          ErrorCodes.INVALID_INPUT,
          'Config path and notes directory must be provided when creating instance',
          'NoteManager.getInstance'
        );
      }
      NoteManager.instance = new NoteManager(configPath, notesDir);
      await NoteManager.instance.initialize();
    }
    return NoteManager.instance;
  }

  private async initialize(): Promise<void> {
    try {
      // Ensure notes directory exists
      await fs.mkdir(this.notesDir, { recursive: true });

      // Load configuration
      await this.loadConfig();

      this.logger.info('Note manager initialized', {
        notesLoaded: this.notes.size,
        notesDir: this.notesDir,
      });
    } catch (error) {
      this.logger.error('Failed to initialize note manager', { error });
      throw error;
    }
  }

  private async loadConfig(): Promise<void> {
    try {
      const configContent = await fs.readFile(this.configPath, 'utf-8');
      const config: NotesConfig = JSON.parse(configContent);

      // Clear existing notes
      this.notes.clear();

      // Load each configured note
      for (const [id, noteConfig] of Object.entries(config.notes)) {
        try {
          const notePath = path.join(this.notesDir, noteConfig.path);
          const content = await fs.readFile(notePath, 'utf-8');

          this.notes.set(id, {
            id,
            content,
            config: noteConfig,
          });

          this.logger.debug('Loaded note', { id, path: notePath });
        } catch (error) {
          this.logger.error('Failed to load note', { id, error });
        }
      }
    } catch (error) {
      this.logger.error('Failed to load notes configuration', { error });
      throw error;
    }
  }

  /**
   * Get notes that should be included in a tool's response
   */
  getNotesForTool(toolName: string): LoadedNote[] {
    const applicableNotes = Array.from(this.notes.values()).filter(note => {
      return (
        note.config.tools === '*' ||
        (Array.isArray(note.config.tools) && note.config.tools.includes(toolName))
      );
    });

    // Sort by priority if specified
    return applicableNotes.sort((a, b) => {
      const priorityA = a.config.priority ?? 0;
      const priorityB = b.config.priority ?? 0;
      return priorityB - priorityA;
    });
  }

  /**
   * Format notes as markdown for inclusion in tool response
   */
  formatNotes(notes: LoadedNote[]): string {
    if (notes.length === 0) return '';

    return notes.map(note => note.content.trim()).join('\n\n---\n\n');
  }

  /**
   * Reload configuration and notes from disk
   */
  async reloadConfig(): Promise<void> {
    await this.loadConfig();
  }
}
