import { z } from "zod";
import { McpToolResponse } from '../../../types/mcp.js';

// Base whiteboard schema that accepts any JSON data
export const WhiteboardDataSchema = z.any();

// Create whiteboard schema
export const CreateWhiteboardSchemaShape = {
  id: z.string().min(1).describe(
    "Unique whiteboard identifier (non-empty)."
  ),
  data: WhiteboardDataSchema.optional().describe(
    "Initial JSON data (timestamps managed by server)."
  ),
  projectId: z.string().optional().describe(
    "Optional project ID to link to (must start with 'proj_')."
  )
} as const;

export const CreateWhiteboardSchema = z.object(CreateWhiteboardSchemaShape);
export type CreateWhiteboardInput = z.infer<typeof CreateWhiteboardSchema>;

// Update whiteboard schema
export const UpdateWhiteboardSchemaShape = {
  id: z.string().min(1).describe(
    "Whiteboard ID to update."
  ),
  data: WhiteboardDataSchema.describe(
    "JSON data to store (for partial updates, provide only changed fields)."
  ),
  merge: z.boolean().default(true).describe(
    "true: merge with existing data, false: replace all data."
  )
} as const;

export const UpdateWhiteboardSchema = z.object(UpdateWhiteboardSchemaShape);
export type UpdateWhiteboardInput = z.infer<typeof UpdateWhiteboardSchema>;

// Get whiteboard schema
export const GetWhiteboardSchemaShape = {
  id: z.string().min(1).describe(
    "Whiteboard ID to retrieve."
  ),
  version: z.number().int().positive().optional().describe(
    "Optional version number (defaults to latest). Must be a positive integer."
  ).refine((val) => {
    if (val === undefined) return true;
    return Number.isInteger(val) && val > 0;
  }, "Version must be a positive integer"
  )
} as const;

export const GetWhiteboardSchema = z.object(GetWhiteboardSchemaShape);
export type GetWhiteboardInput = z.infer<typeof GetWhiteboardSchema>;

// Delete whiteboard schema
export const DeleteWhiteboardSchemaShape = {
  id: z.string().min(1).describe(
    "Whiteboard ID to delete."
  )
} as const;

export const DeleteWhiteboardSchema = z.object(DeleteWhiteboardSchemaShape);
export type DeleteWhiteboardInput = z.infer<typeof DeleteWhiteboardSchema>;

// Response types
export type WhiteboardResponse = McpToolResponse;

// Whiteboard data structure
export interface Whiteboard {
  id: string;          // Unique identifier
  data: any;           // Whiteboard content
  projectId?: string;  // Associated project
  version: number;     // Current version
  createdAt: string;   // Creation timestamp
  updatedAt: string;   // Last update timestamp
}

// Whiteboard version data structure
export interface WhiteboardVersion {
  id: string;          // Version ID (wv_ prefix)
  whiteboardId: string;// Parent whiteboard
  version: number;     // Version number
  data: any;           // Version content
  createdAt: string;   // Version timestamp
  projectId?: string;  // Associated project
}