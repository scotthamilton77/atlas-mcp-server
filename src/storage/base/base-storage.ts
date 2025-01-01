import { Task, TaskStatus, CreateTaskInput, UpdateTaskInput } from '../../types/task.js';
import { formatTimestamp } from '../../utils/date-formatter.js';

/**
 * Base storage implementation with common functionality
 */
export abstract class BaseStorage {
  /**
   * Create a task with proper defaults
   */
  protected createTaskWithDefaults(input: CreateTaskInput): Task {
    const now = Date.now();
    const projectPath = input.path.split('/')[0];

    return {
      // System fields
      id: `task_${now}_${Math.random().toString(36).substr(2, 9)}`,
      path: input.path,
      name: input.name,
      type: input.type,
      status: TaskStatus.PENDING,
      created: formatTimestamp(now),
      updated: formatTimestamp(now),
      version: 1,
      projectPath,

      // Optional fields
      description: input.description,
      parentPath: input.parentPath,
      reasoning: input.reasoning,
      dependencies: input.dependencies || [],

      // Status metadata
      statusMetadata: input.statusMetadata || {},

      // Note categories
      planningNotes: input.planningNotes || [],
      progressNotes: input.progressNotes || [],
      completionNotes: input.completionNotes || [],
      troubleshootingNotes: input.troubleshootingNotes || [],

      // User metadata
      metadata: input.metadata || {},
    };
  }

  /**
   * Update a task with proper type handling
   */
  protected updateTaskWithDefaults(existingTask: Task, updates: UpdateTaskInput): Task {
    const now = Date.now();

    // Convert null to undefined for parentPath
    const parentPath =
      updates.parentPath === null
        ? undefined
        : typeof updates.parentPath === 'string'
          ? updates.parentPath
          : existingTask.parentPath;

    return {
      ...existingTask,
      ...updates,
      // Update system fields
      updated: formatTimestamp(now),
      version: existingTask.version + 1,
      // Handle parentPath explicitly to ensure correct type
      parentPath,
      // Keep user metadata separate
      metadata: {
        ...existingTask.metadata,
        ...updates.metadata,
      },
      // Ensure arrays are initialized
      dependencies: updates.dependencies || existingTask.dependencies,

      // Note categories
      planningNotes: updates.planningNotes || existingTask.planningNotes,
      progressNotes: updates.progressNotes || existingTask.progressNotes,
      completionNotes: updates.completionNotes || existingTask.completionNotes,
      troubleshootingNotes: updates.troubleshootingNotes || existingTask.troubleshootingNotes,

      // Status metadata
      statusMetadata: {
        ...existingTask.statusMetadata,
        ...updates.statusMetadata,
      },
    };
  }
}
