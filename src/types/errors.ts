import { z } from "zod";
import { McpToolResponse, McpContent } from "./mcp.js";

// Base error codes that all tools can use
export enum BaseErrorCode {
  UNAUTHORIZED = 'UNAUTHORIZED',
  RATE_LIMITED = 'RATE_LIMITED',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  NOT_FOUND = 'NOT_FOUND'
}

// Project-specific error codes
export enum ProjectErrorCode {
  DUPLICATE_NAME = 'DUPLICATE_NAME',
  INVALID_STATUS = 'INVALID_STATUS',
  PROJECT_NOT_FOUND = 'PROJECT_NOT_FOUND',
  DEPENDENCY_CYCLE = 'DEPENDENCY_CYCLE',
  INVALID_DEPENDENCY = 'INVALID_DEPENDENCY'
}

// Note-specific error codes
export enum NoteErrorCode {
  INVALID_TAGS = 'INVALID_TAGS',
  NOTE_NOT_FOUND = 'NOTE_NOT_FOUND'
}

// Link-specific error codes
export enum LinkErrorCode {
  INVALID_URL = 'INVALID_URL',
  LINK_NOT_FOUND = 'LINK_NOT_FOUND',
  DUPLICATE_URL = 'DUPLICATE_URL'
}

// Member-specific error codes
export enum MemberErrorCode {
  INVALID_ROLE = 'INVALID_ROLE',
  MEMBER_NOT_FOUND = 'MEMBER_NOT_FOUND',
  DUPLICATE_MEMBER = 'DUPLICATE_MEMBER'
}

// Base MCP error class
export class McpError extends Error {
  constructor(
    public code: BaseErrorCode | ProjectErrorCode | NoteErrorCode | LinkErrorCode | MemberErrorCode,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'McpError';
  }

  toResponse(): McpToolResponse {
    const content: McpContent = {
      type: "text",
      text: `Error [${this.code}]: ${this.message}${
        this.details ? `\nDetails: ${JSON.stringify(this.details, null, 2)}` : ''
      }`
    };

    return {
      content: [content],
      isError: true,
      _type: "tool_response"
    };
  }
}

// Error schema for validation
export const ErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional()
});

export type ErrorResponse = z.infer<typeof ErrorSchema>;