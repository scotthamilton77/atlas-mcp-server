import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AddProjectNoteSchemaShape, AddProjectNoteSchema } from './types.js';
import { addProjectNote } from './addProjectNote.js';
import { registerTool, createToolExample, createToolMetadata } from '../../../types/tool.js';
import { z } from 'zod';

export const registerAddProjectNoteTool = (server: McpServer) => {
  registerTool(
    server,
    "project.note.add",
    "Add notes to track project progress and decisions. Use 'single' mode for one note or 'bulk' mode for multiple. " +
    "Notes can include optional tags for categorization.",
    AddProjectNoteSchemaShape,
    addProjectNote,
    createToolMetadata({
      examples: [
        createToolExample(
          {
            mode: "single",
            projectId: "proj_123",
            text: "Initial project setup completed. Development environment configured."
          },
          `{
  "id": "note_abc",
  "projectId": "proj_123",
  "text": "Initial project setup completed. Development environment configured.",
  "tags": [],
  "timestamp": "2025-02-20T13:45:30Z"
}`,
          "Add a basic note"
        ),
        createToolExample(
          {
            mode: "bulk",
            projectId: "proj_789",
            notes: [
              {
                text: "Sprint planning completed",
                tags: ["planning", "sprint"]
              },
              {
                text: "Team capacity reviewed",
                tags: ["planning", "team"]
              }
            ]
          },
          `{
  "success": true,
  "message": "Successfully added 2 notes",
  "notes": [
    {
      "id": "note_ghi",
      "projectId": "proj_789",
      "text": "Sprint planning completed",
      "tags": ["planning", "sprint"],
      "timestamp": "2025-02-20T15:00:00Z"
    },
    {
      "id": "note_jkl",
      "projectId": "proj_789",
      "text": "Team capacity reviewed",
      "tags": ["planning", "team"],
      "timestamp": "2025-02-20T15:00:00Z"
    }
  ]
}`,
          "Add multiple notes with tags"
        )
      ],
      requiredPermission: "project:note:add",
      returnSchema: z.union([
        // Single note response
        z.object({
          id: z.string().describe("Note ID (note_ prefix)"),
          projectId: z.string().describe("Associated project ID"),
          text: z.string().describe("Note content"),
          tags: z.array(z.string()).describe("Categorization tags"),
          timestamp: z.string().describe("Creation time")
        }),
        // Bulk creation response
        z.object({
          success: z.boolean().describe("Operation success"),
          message: z.string().describe("Result message"),
          notes: z.array(z.object({
            id: z.string().describe("Note ID"),
            projectId: z.string().describe("Project ID"),
            text: z.string().describe("Content"),
            tags: z.array(z.string()).describe("Tags"),
            timestamp: z.string().describe("Created")
          })).describe("Created notes")
        })
      ]),
      rateLimit: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 30 // 30 notes per minute (single or bulk)
      }
    })
  );
};