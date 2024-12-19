import { z } from 'zod';

// Task Status
export enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  BLOCKED = 'blocked'
}

// Task Type
export enum TaskType {
  TASK = 'task',
  MILESTONE = 'milestone',
  GROUP = 'group'
}

// Note Types
export enum NoteType {
  TEXT = 'text',
  CODE = 'code',
  JSON = 'json',
  MARKDOWN = 'markdown'
}

// Task Note Schema
export const TaskNoteSchema = z.object({
  type: z.nativeEnum(NoteType),
  content: z.string(),
  language: z.string().optional(),
  metadata: z.record(z.unknown()).optional()
});

// Task Reasoning Schema
export const TaskReasoningSchema = z.object({
  approach: z.string().optional(),
  assumptions: z.array(z.string()).optional(),
  alternatives: z.array(z.string()).optional(),
  risks: z.array(z.string()).optional(),
  tradeoffs: z.array(z.string()).optional(),
  constraints: z.array(z.string()).optional(),
  dependencies_rationale: z.array(z.string()).optional(),
  impact_analysis: z.array(z.string()).optional()
});

// Task Metadata Schema
export const TaskMetadataSchema = z.object({
  context: z.string().optional(),
  tags: z.array(z.string()).optional(),
  created: z.string(),
  updated: z.string(),
  sessionId: z.string()
});

// Task Schema
export const TaskSchema = z.object({
  id: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  type: z.nativeEnum(TaskType),
  status: z.nativeEnum(TaskStatus),
  notes: z.array(TaskNoteSchema).optional(),
  reasoning: TaskReasoningSchema.optional(),
  dependencies: z.array(z.string().uuid()).optional(),
  metadata: TaskMetadataSchema,
  subtasks: z.array(z.lazy(() => TaskSchema)).optional()
});

export type Task = z.infer<typeof TaskSchema>;
export type TaskNote = z.infer<typeof TaskNoteSchema>;
export type TaskReasoning = z.infer<typeof TaskReasoningSchema>;
export type TaskMetadata = z.infer<typeof TaskMetadataSchema>;
