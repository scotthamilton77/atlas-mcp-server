import { z } from 'zod';
import { TaskStatus, TaskType, NoteType } from '../../../shared/types/task.js';

// Note schema type
export const noteSchema = z.object({
  type: z.nativeEnum(NoteType),
  content: z.string(),
  language: z.string().optional(),
  metadata: z.record(z.unknown()).optional()
});

export type Note = z.infer<typeof noteSchema>;

// Reasoning schema type
export const reasoningSchema = z.object({
  approach: z.string().optional(),
  assumptions: z.array(z.string()).optional(),
  alternatives: z.array(z.string()).optional(),
  risks: z.array(z.string()).optional(),
  tradeoffs: z.array(z.string()).optional(),
  constraints: z.array(z.string()).optional(),
  dependencies_rationale: z.array(z.string()).optional(),
  impact_analysis: z.array(z.string()).optional()
});

export type Reasoning = z.infer<typeof reasoningSchema>;

// Metadata schema type
export const metadataSchema = z.object({
  context: z.string().optional(),
  tags: z.array(z.string()).optional(),
  created: z.string(),
  updated: z.string(),
  sessionId: z.string()
});

export type Metadata = z.infer<typeof metadataSchema>;

// Create metadata schema type
export const createMetadataSchema = z.object({
  context: z.string().optional(),
  tags: z.array(z.string()).optional()
});

export type CreateMetadata = z.infer<typeof createMetadataSchema>;

// Task type definitions with proper recursion
export type TaskBase = {
  parentId: string | null;
  name: string;
  description?: string;
  type: TaskType;
  status: TaskStatus;
  notes?: Note[];
  reasoning?: Reasoning;
  dependencies?: string[];
};

export interface Task extends TaskBase {
  id: string;
  metadata: Metadata;
  subtasks?: Task[];
}

export interface CreateTask extends TaskBase {
  metadata?: CreateMetadata;
  subtasks?: CreateTask[];
}

export interface UpdateTask extends Partial<TaskBase> {
  metadata?: CreateMetadata;
  subtasks?: UpdateTask[];
}

// Status change type
export interface StatusChange {
  id: string;
  status: TaskStatus;
  reason?: string;
  metadata: {
    changedBy: string;
    timestamp: string;
  };
}
