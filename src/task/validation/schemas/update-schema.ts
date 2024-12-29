import { z } from 'zod';
import { taskMetadataSchema } from './metadata-schema.js';
import { TaskType, TaskStatus } from '../../../types/task.js';

/**
 * Schema for task update input
 */
export const updateTaskSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  type: z.nativeEnum(TaskType).optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  notes: z.array(z.string().max(1000)).max(100).optional(),
  reasoning: z.string().max(2000).optional(),
  dependencies: z.array(z.string()).max(50).optional(),
  metadata: taskMetadataSchema.optional(),
});

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
