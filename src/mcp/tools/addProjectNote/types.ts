import { z } from "zod";
import { McpToolResponse } from '../../../types/mcp.js';

// Base note schema shape for reuse
const NoteSchemaShape = {
  text: z.string().min(1).describe(
    "Note content (non-empty text)."
  ),
  tags: z.array(z.string()).optional().describe(
    "Optional tags for categorization (simple strings without spaces)."
  )
} as const;

// Single note schema
const SingleNoteSchema = z.object({
  mode: z.literal("single"),
  projectId: z.string(),
  ...NoteSchemaShape
}).describe(
  "Add a single note to a project."
);

// Bulk note schema
const BulkNoteSchema = z.object({
  mode: z.literal("bulk"),
  projectId: z.string(),
  notes: z.array(z.object(NoteSchemaShape)).min(1).max(100)
}).describe(
  "Add multiple notes to a project in a single operation."
);

// Schema shapes for tool registration
export const AddProjectNoteSchemaShape = {
  mode: z.enum(["single", "bulk"]).describe(
    "'single' for one note, 'bulk' for multiple notes."
  ),
  projectId: z.string().describe(
    "Project ID to add notes to (must start with 'proj_')."
  ),
  text: z.string().min(1).optional().describe(
    "Required for single mode: Note content."
  ),
  tags: z.array(z.string()).optional().describe(
    "Optional tags for categorization."
  ),
  notes: z.array(z.object(NoteSchemaShape)).min(1).max(100).optional().describe(
    "Required for bulk mode: Array of 1-100 notes, each with content and optional tags."
  )
} as const;

// Schema for validation
export const AddProjectNoteSchema = z.discriminatedUnion("mode", [
  SingleNoteSchema,
  BulkNoteSchema
]);

export type AddProjectNoteInput = z.infer<typeof AddProjectNoteSchema>;
export type AddProjectNoteResponse = McpToolResponse;

export interface ProjectNote {
  id: string;        // Unique note identifier
  projectId: string; // Associated project ID
  text: string;      // Note content
  tags: string[];    // Categorization tags
  timestamp: string; // Creation time (ISO 8601)
}