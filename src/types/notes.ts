/**
 * Types for user notes configuration and management
 */
export interface NoteConfig {
  // Which tools this note should be included in
  tools: '*' | string[]; // '*' means include in all tool responses

  // Path to the markdown file containing the note
  path: string;

  // Optional ordering when multiple notes apply
  priority?: number;
}

export interface NotesConfig {
  // Map of note ID to its configuration
  notes: Record<string, NoteConfig>;
}

export interface LoadedNote {
  id: string;
  content: string;
  config: NoteConfig;
}
