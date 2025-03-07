import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTool, createToolExample, createToolMetadata } from "../../../types/tool.js";
import { createWhiteboard } from "./createWhiteboard.js";
import { updateWhiteboard } from "./updateWhiteboard.js";
import { getWhiteboard } from "./getWhiteboard.js";
import { deleteWhiteboard } from "./deleteWhiteboard.js";
import {
  CreateWhiteboardSchemaShape,
  UpdateWhiteboardSchemaShape,
  GetWhiteboardSchemaShape,
  DeleteWhiteboardSchemaShape
} from "./types.js";

export const registerWhiteboardTools = (server: McpServer) => {
  // Register whiteboard.create
  registerTool(
    server,
    "whiteboard_create",
    "Create a new whiteboard workspace with optional initial data and schema validation. Can be linked to projects for organization.",
    CreateWhiteboardSchemaShape,
    createWhiteboard,
    createToolMetadata({
      examples: [
        createToolExample(
          {
            id: "notes",
            data: {
              title: "Meeting Notes",
              content: "Discussed project timeline"
            }
          },
          `{
  "id": "notes",
  "data": {
    "title": "Meeting Notes",
    "content": "Discussed project timeline"
  },
  "version": 1,
  "createdAt": "2025-02-20T13:45:30Z",
  "updatedAt": "2025-02-20T13:45:30Z"
}`,
          "Create a whiteboard for meeting notes"
        ),
        createToolExample(
          {
            id: "todo-list",
            data: { items: [] },
            schema: "object({ items: z.array(z.object({ text: z.string(), done: z.boolean() })) })"
          },
          `{
  "id": "todo-list",
  "data": { "items": [] },
  "schema": "object({ items: z.array(z.object({ text: z.string(), done: z.boolean() })) })",
  "version": 1,
  "createdAt": "2025-02-20T13:46:00Z",
  "updatedAt": "2025-02-20T13:46:00Z"
}`,
          "Create a whiteboard with schema validation"
        )
      ]
    })
  );

  // Register whiteboard.update
  registerTool(
    server,
    "whiteboard_update",
    "Update whiteboard data by merging or replacing content. Supports partial updates to specific fields or complete data replacement.",
    UpdateWhiteboardSchemaShape,
    updateWhiteboard,
    createToolMetadata({
      examples: [
        createToolExample(
          {
            id: "notes",
            data: {
              content: "Updated project timeline discussion"
            },
            merge: true
          },
          `{
  "id": "notes",
  "data": {
    "title": "Meeting Notes",
    "content": "Updated project timeline discussion"
  },
  "version": 2,
  "createdAt": "2025-02-20T13:45:30Z",
  "updatedAt": "2025-02-20T13:47:00Z"
}`,
          "Update whiteboard content"
        )
      ]
    })
  );

  // Register whiteboard.get
  registerTool(
    server,
    "whiteboard_get",
    "Retrieve whiteboard data with version control. Access either the latest version or a specific historical version by number.",
    GetWhiteboardSchemaShape,
    getWhiteboard,
    createToolMetadata({
      examples: [
        createToolExample(
          { id: "notes" },
          `{
  "id": "notes",
  "data": {
    "title": "Meeting Notes",
    "content": "Updated project timeline discussion"
  },
  "version": 2,
  "createdAt": "2025-02-20T13:45:30Z",
  "updatedAt": "2025-02-20T13:47:00Z"
}`,
          "Get latest version"
        ),
        createToolExample(
          { id: "notes", version: 1 },
          `{
  "id": "notes",
  "data": {
    "title": "Meeting Notes",
    "content": "Discussed project timeline"
  },
  "version": 1,
  "createdAt": "2025-02-20T13:45:30Z",
  "updatedAt": "2025-02-20T13:45:30Z"
}`,
          "Get specific version"
        )
      ]
    })
  );

  // Register whiteboard.delete
  registerTool(
    server,
    "whiteboard_delete",
    "Delete a whiteboard and its entire version history permanently. This operation cannot be undone.",
    DeleteWhiteboardSchemaShape,
    deleteWhiteboard,
    createToolMetadata({
      examples: [
        createToolExample(
          { id: "notes" },
          `{
  "success": true,
  "message": "Whiteboard 'notes' deleted successfully. This action cannot be undone."
}`,
          "Delete a whiteboard"
        )
      ]
    })
  );
};