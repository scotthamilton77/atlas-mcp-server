import { promises as fs } from 'fs';
import * as path from 'path';
import { Logger } from '../logging/index.js';
import { NotesConfig } from '../types/notes.js';
import { ErrorCodes, createError } from '../errors/index.js';

export class NotesInitializer {
  private readonly logger: Logger;

  constructor() {
    this.logger = Logger.getInstance().child({ component: 'NotesInitializer' });
  }

  /**
   * Initialize notes by copying built-in notes if they don't exist
   */
  async initializeNotes(
    notesConfigPath: string,
    notesDir: string,
    builtInNotesDir: string
  ): Promise<void> {
    try {
      try {
        // Ensure directories exist
        await fs.mkdir(notesDir, { recursive: true });
        await fs.mkdir(path.dirname(notesConfigPath), { recursive: true });

        // Verify built-in notes directory exists
        if (!(await this.fileExists(builtInNotesDir))) {
          throw new Error(`Built-in notes directory not found at ${builtInNotesDir}`);
        }

        const builtInNotesConfig = path.join(path.dirname(builtInNotesDir), 'config', 'notes.json');

        // Verify built-in notes config exists
        if (!(await this.fileExists(builtInNotesConfig))) {
          throw new Error(`Built-in notes config not found at ${builtInNotesConfig}`);
        }

        // Copy notes config if it doesn't exist
        if (!(await this.fileExists(notesConfigPath))) {
          this.logger.info('Copying built-in notes configuration', {
            from: builtInNotesConfig,
            to: notesConfigPath,
          });
          await fs.copyFile(builtInNotesConfig, notesConfigPath);
        }

        // Read notes config to get note files to copy
        const notesConfig = await this.readJsonFile<NotesConfig>(notesConfigPath);
        const noteFiles = Object.values(notesConfig.notes).map(note => note.path);

        // Copy each note file if it doesn't exist
        for (const noteFile of noteFiles) {
          const destPath = path.join(notesDir, noteFile);
          const sourcePath = path.join(builtInNotesDir, noteFile);

          // Create destination directory if needed
          await fs.mkdir(path.dirname(destPath), { recursive: true });

          if (!(await this.fileExists(sourcePath))) {
            throw new Error(`Built-in note file not found at ${sourcePath}`);
          }

          if (!(await this.fileExists(destPath))) {
            this.logger.info('Copying built-in note file', {
              from: sourcePath,
              to: destPath,
            });
            await fs.copyFile(sourcePath, destPath);
          }
        }
      } catch (error) {
        this.logger.error('Failed to initialize notes', { error });
        throw createError(
          ErrorCodes.NOTES_INIT_ERROR,
          `Failed to initialize notes: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'NotesInitializer.initializeNotes',
          undefined,
          { error }
        );
      }
    } catch (error) {
      this.logger.error('Failed to initialize notes', { error });
      throw createError(
        ErrorCodes.NOTES_INIT_ERROR,
        'Failed to initialize notes',
        'NotesInitializer.initializeNotes',
        undefined,
        { error }
      );
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async readJsonFile<T>(filePath: string): Promise<T> {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  }
}
