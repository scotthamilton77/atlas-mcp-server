import { z } from "zod";
import { Project } from '../neo4j/projectService.js';

// Common response types
export interface McpContent {
  [key: string]: unknown;
  type: "text";
  text: string;
}

export interface McpToolResponse {
  [key: string]: unknown;
  content: McpContent[];
  _meta?: Record<string, unknown>;
  isError?: boolean;
}

// Project status enum
export const ProjectStatus = {
  ACTIVE: "active",
  PENDING: "pending",
  COMPLETED: "completed",
  ARCHIVED: "archived"
} as const;

// Project-specific schemas
export const ProjectInputSchema = {
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.enum([ProjectStatus.ACTIVE, ProjectStatus.PENDING, ProjectStatus.COMPLETED, ProjectStatus.ARCHIVED]).default(ProjectStatus.ACTIVE)
} as const;

export const UpdateProjectInputSchema = {
  id: z.string(),
  updates: z.object(ProjectInputSchema).partial()
} as const;

export const ProjectIdInputSchema = {
  projectId: z.string()
} as const;

// Resource response types
export interface ResourceContent {
  [key: string]: unknown;
  uri: string;
  text: string;
  mimeType?: string;
}

export interface ResourceResponse {
  [key: string]: unknown;
  contents: ResourceContent[];
  _meta?: Record<string, unknown>;
}

// Prompt response types
export interface PromptMessageContent {
  [key: string]: unknown;
  type: "text";
  text: string;
}

export interface PromptMessage {
  [key: string]: unknown;
  role: "user" | "assistant";
  content: PromptMessageContent;
}

export interface PromptResponse {
  [key: string]: unknown;
  messages: PromptMessage[];
  _meta?: Record<string, unknown>;
}

// Helper functions
export const createToolResponse = (text: string, isError?: boolean): McpToolResponse => ({
  content: [{
    type: "text",
    text,
    _type: "text"
  }],
  isError,
  _type: "tool_response"
});

export const createResourceResponse = (uri: string, text: string, mimeType?: string): ResourceResponse => ({
  contents: [{
    uri,
    text,
    mimeType,
    _type: "resource_content"
  }],
  _type: "resource_response"
});

export const createPromptResponse = (text: string, role: "user" | "assistant" = "assistant"): PromptResponse => ({
  messages: [{
    role,
    content: {
      type: "text",
      text,
      _type: "prompt_content"
    },
    _type: "prompt_message"
  }],
  _type: "prompt_response"
});