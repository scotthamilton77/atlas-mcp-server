import { Database } from 'sqlite';
import { Logger } from '../../../logging/index.js';
import { TaskErrorFactory } from '../../../errors/task-error.js';
import {
  Task,
  TaskType,
  TaskStatus,
  CreateTaskInput,
  UpdateTaskInput,
} from '../../../types/task.js';
import { SqliteConnection } from '../database/connection.js';
import { formatTimestamp } from '../../../utils/date-formatter.js';

export class TaskOperations {
  protected readonly logger: Logger;

  constructor(protected readonly connection: SqliteConnection) {
    this.logger = Logger.getInstance().child({ component: 'TaskOperations' });
    this.logger.debug('TaskOperations initialized');
  }

  /**
   * Create a new task
   */
  async createTask(input: CreateTaskInput): Promise<Task> {
    try {
      if (!input.path || !input.name || !input.type) {
        throw TaskErrorFactory.createTaskValidationError(
          'TaskOperations.createTask',
          'Missing required fields: path, name, and type are required',
          { input }
        );
      }

      const now = Date.now();
      const projectPath = input.path.split('/')[0];

      const task: Task = {
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

        // Note categories - ensure arrays are initialized
        planningNotes: input.planningNotes || [],
        progressNotes: input.progressNotes || [],
        completionNotes: input.completionNotes || [],
        troubleshootingNotes: input.troubleshootingNotes || [],

        // User metadata
        metadata: input.metadata || {},
      };

      await this.internalSaveTask(task);
      this.logger.info('Task created successfully', {
        path: task.path,
        type: task.type,
        parentPath: task.parentPath,
      });

      return task;
    } catch (error) {
      this.logger.error('Failed to create task', {
        error,
        context: {
          path: input.path,
          name: input.name,
          type: input.type,
          parentPath: input.parentPath,
        },
      });

      throw TaskErrorFactory.createTaskCreationError(
        'TaskOperations.createTask',
        error instanceof Error ? error : new Error(String(error)),
        { input }
      );
    }
  }

  /**
   * Update an existing task
   */
  async updateTask(path: string, updates: UpdateTaskInput): Promise<Task> {
    try {
      const result = await this.connection.executeInTransaction(async () => {
        const existingTask = await this.getTask(path);
        if (!existingTask) {
          throw TaskErrorFactory.createTaskNotFoundError('TaskOperations.updateTask', path);
        }

        const now = Date.now();

        // Convert null to undefined for parentPath
        const parentPath =
          updates.parentPath === null
            ? undefined
            : typeof updates.parentPath === 'string'
              ? updates.parentPath
              : existingTask.parentPath;

        // Create updated task with proper type handling
        const updatedTask: Task = {
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
          // Handle dependencies explicitly
          dependencies:
            updates.dependencies !== undefined ? updates.dependencies : existingTask.dependencies,

          // Note categories - preserve existing notes if not updated
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

        // Handle parent-child relationship changes
        if (updates.parentPath !== undefined && updates.parentPath !== existingTask.parentPath) {
          await this.updateTaskRelationships(path, existingTask.parentPath, parentPath);
        }

        // Verify dependencies exist before saving
        if (updatedTask.dependencies && updatedTask.dependencies.length > 0) {
          for (const depPath of updatedTask.dependencies) {
            const depExists = await this.getTask(depPath);
            if (!depExists) {
              throw TaskErrorFactory.createTaskDependencyError(
                'TaskOperations.updateTask',
                `Dependency not found: ${depPath}`,
                { taskId: updatedTask.id, dependencyPath: depPath }
              );
            }
          }
        }

        await this.internalSaveTask(updatedTask);

        // Get fresh task with dependencies from database
        const savedTask = await this.getTask(path);
        if (!savedTask) {
          throw TaskErrorFactory.createTaskNotFoundError('TaskOperations.updateTask', path);
        }

        this.logger.info('Task updated successfully', {
          path,
          newStatus: updates.status,
          newParentPath: parentPath,
          dependencies: savedTask.dependencies,
        });

        return savedTask;
      });

      if (!result) {
        throw TaskErrorFactory.createTaskNotFoundError('TaskOperations.updateTask', path);
      }

      return result;
    } catch (error) {
      this.logger.error('Failed to update task', {
        error,
        context: {
          path,
          updates,
        },
      });

      throw TaskErrorFactory.createTaskUpdateError(
        'TaskOperations.updateTask',
        error instanceof Error ? error : new Error(String(error)),
        { path, updates }
      );
    }
  }

  /**
   * Get a task by path
   */
  async getTask(path: string): Promise<Task | null> {
    try {
      return await this.connection.execute(async db => {
        // Get task data
        const row = await db.get<Record<string, unknown>>(
          'SELECT * FROM tasks WHERE path = ?',
          path
        );

        if (!row) {
          this.logger.debug('Task not found', { path });
          return null;
        }

        // Get dependencies
        const dependencies = await db.all<{ dependency_path: string }[]>(
          'SELECT dependency_path FROM task_dependencies WHERE task_id = ?',
          row.id
        );

        // Add dependencies to row data
        row.dependencies = JSON.stringify(dependencies.map(d => d.dependency_path));

        return this.rowToTask(row);
      }, 'getTask');
    } catch (error) {
      this.logger.error('Failed to get task', {
        error,
        context: { path },
      });

      throw TaskErrorFactory.createTaskStorageError(
        'TaskOperations.getTask',
        error instanceof Error ? error : new Error(String(error)),
        { path }
      );
    }
  }

  /**
   * Get multiple tasks by paths
   */
  async getTasks(paths: string[]): Promise<Task[]> {
    if (paths.length === 0) return [];

    try {
      return await this.connection.execute(async db => {
        const placeholders = paths.map(() => '?').join(',');

        // Get tasks
        const rows = await db.all<Record<string, unknown>[]>(
          `SELECT * FROM tasks WHERE path IN (${placeholders})`,
          ...paths
        );

        // Get task IDs for dependency lookup
        const taskIds = rows.map(row => String(row.id));

        // Get dependencies for all tasks
        const dependencies = await db.all<{ task_id: string; dependency_path: string }[]>(
          `SELECT task_id, dependency_path FROM task_dependencies WHERE task_id IN (${placeholders})`,
          ...taskIds
        );

        // Group dependencies by task
        const dependenciesByTask = dependencies.reduce(
          (acc, dep) => {
            acc[dep.task_id] = acc[dep.task_id] || [];
            acc[dep.task_id].push(dep.dependency_path);
            return acc;
          },
          {} as Record<string, string[]>
        );

        // Add dependencies to each row
        const rowsWithDeps = rows.map(row => ({
          ...row,
          dependencies: JSON.stringify(dependenciesByTask[String(row.id)] || []),
        }));

        this.logger.debug('Retrieved multiple tasks', { count: rows.length });
        return rowsWithDeps.map(row => this.rowToTask(row));
      }, 'getTasks');
    } catch (error) {
      this.logger.error('Failed to get tasks', {
        error,
        context: { paths },
      });

      throw TaskErrorFactory.createTaskStorageError(
        'TaskOperations.getTasks',
        error instanceof Error ? error : new Error(String(error)),
        { paths }
      );
    }
  }

  /**
   * Get tasks by pattern
   */
  async getTasksByPattern(pattern: string): Promise<Task[]> {
    try {
      return await this.connection.execute(async db => {
        const sqlPattern = pattern.replace(/\*/g, '%').replace(/\?/g, '_');

        // Get tasks matching pattern
        const rows = await db.all<Record<string, unknown>[]>(
          'SELECT * FROM tasks WHERE path LIKE ?',
          sqlPattern
        );

        // Get task IDs for dependency lookup
        const taskIds = rows.map(row => String(row.id));

        if (taskIds.length === 0) {
          return [];
        }

        // Get dependencies for matched tasks
        const placeholders = taskIds.map(() => '?').join(',');
        const dependencies = await db.all<{ task_id: string; dependency_path: string }[]>(
          `SELECT task_id, dependency_path FROM task_dependencies WHERE task_id IN (${placeholders})`,
          ...taskIds
        );

        // Group dependencies by task
        const dependenciesByTask = dependencies.reduce(
          (acc, dep) => {
            acc[dep.task_id] = acc[dep.task_id] || [];
            acc[dep.task_id].push(dep.dependency_path);
            return acc;
          },
          {} as Record<string, string[]>
        );

        // Add dependencies to each row
        const rowsWithDeps = rows.map(row => ({
          ...row,
          dependencies: JSON.stringify(dependenciesByTask[String(row.id)] || []),
        }));

        this.logger.debug('Retrieved tasks by pattern', { pattern, count: rows.length });
        return rowsWithDeps.map(row => this.rowToTask(row));
      }, 'getTasksByPattern');
    } catch (error) {
      this.logger.error('Failed to get tasks by pattern', {
        error,
        context: { pattern },
      });

      throw TaskErrorFactory.createTaskStorageError(
        'TaskOperations.getTasksByPattern',
        error instanceof Error ? error : new Error(String(error)),
        { pattern }
      );
    }
  }

  /**
   * Get tasks by status
   */
  async getTasksByStatus(status: TaskStatus): Promise<Task[]> {
    try {
      return await this.connection.execute(async db => {
        // Get tasks with status
        const rows = await db.all<Record<string, unknown>[]>(
          'SELECT * FROM tasks WHERE status = ?',
          status
        );

        // Get task IDs for dependency lookup
        const taskIds = rows.map(row => String(row.id));

        if (taskIds.length === 0) {
          return [];
        }

        // Get dependencies for matched tasks
        const placeholders = taskIds.map(() => '?').join(',');
        const dependencies = await db.all<{ task_id: string; dependency_path: string }[]>(
          `SELECT task_id, dependency_path FROM task_dependencies WHERE task_id IN (${placeholders})`,
          ...taskIds
        );

        // Group dependencies by task
        const dependenciesByTask = dependencies.reduce(
          (acc, dep) => {
            acc[dep.task_id] = acc[dep.task_id] || [];
            acc[dep.task_id].push(dep.dependency_path);
            return acc;
          },
          {} as Record<string, string[]>
        );

        // Add dependencies to each row
        const rowsWithDeps = rows.map(row => ({
          ...row,
          dependencies: JSON.stringify(dependenciesByTask[String(row.id)] || []),
        }));

        this.logger.debug('Retrieved tasks by status', { status, count: rows.length });
        return rowsWithDeps.map(row => this.rowToTask(row));
      }, 'getTasksByStatus');
    } catch (error) {
      this.logger.error('Failed to get tasks by status', {
        error,
        context: { status },
      });

      throw TaskErrorFactory.createTaskStorageError(
        'TaskOperations.getTasksByStatus',
        error instanceof Error ? error : new Error(String(error)),
        { status }
      );
    }
  }

  /**
   * Get child tasks of a task
   */
  async getChildren(parentPath: string): Promise<Task[]> {
    try {
      return await this.connection.execute(async db => {
        // Get child tasks
        const rows = await db.all<Record<string, unknown>[]>(
          'SELECT * FROM tasks WHERE parent_path = ?',
          parentPath
        );

        // Get task IDs for dependency lookup
        const taskIds = rows.map(row => String(row.id));

        if (taskIds.length === 0) {
          return [];
        }

        // Get dependencies for child tasks
        const placeholders = taskIds.map(() => '?').join(',');
        const dependencies = await db.all<{ task_id: string; dependency_path: string }[]>(
          `SELECT task_id, dependency_path FROM task_dependencies WHERE task_id IN (${placeholders})`,
          ...taskIds
        );

        // Group dependencies by task
        const dependenciesByTask = dependencies.reduce(
          (acc, dep) => {
            acc[dep.task_id] = acc[dep.task_id] || [];
            acc[dep.task_id].push(dep.dependency_path);
            return acc;
          },
          {} as Record<string, string[]>
        );

        // Add dependencies to each row
        const rowsWithDeps = rows.map(row => ({
          ...row,
          dependencies: JSON.stringify(dependenciesByTask[String(row.id)] || []),
        }));

        this.logger.debug('Retrieved child tasks', { parentPath, count: rows.length });
        return rowsWithDeps.map(row => this.rowToTask(row));
      }, 'getChildren');
    } catch (error) {
      this.logger.error('Failed to get child tasks', {
        error,
        context: { parentPath },
      });

      throw TaskErrorFactory.createTaskStorageError(
        'TaskOperations.getChildren',
        error instanceof Error ? error : new Error(String(error)),
        { parentPath }
      );
    }
  }

  /**
   * Delete a task
   */
  async deleteTask(path: string): Promise<void> {
    try {
      await this.deleteTasks([path]);
      this.logger.info('Task deleted', { path });
    } catch (error) {
      this.logger.error('Failed to delete task', {
        error,
        context: { path },
      });

      throw TaskErrorFactory.createTaskStorageError(
        'TaskOperations.deleteTask',
        error instanceof Error ? error : new Error(String(error)),
        { path }
      );
    }
  }

  /**
   * Delete multiple tasks
   */
  async deleteTasks(paths: string[]): Promise<void> {
    if (paths.length === 0) return;

    try {
      await this.connection.execute(async db => {
        const placeholders = paths.map(() => '?').join(',');
        await db.run(`DELETE FROM tasks WHERE path IN (${placeholders})`, ...paths);
        this.logger.info('Multiple tasks deleted', { count: paths.length });
      }, 'deleteTasks');
    } catch (error) {
      this.logger.error('Failed to delete tasks', {
        error,
        context: { paths },
      });

      throw TaskErrorFactory.createTaskStorageError(
        'TaskOperations.deleteTasks',
        error instanceof Error ? error : new Error(String(error)),
        { paths }
      );
    }
  }

  /**
   * Save a task
   */
  async saveTask(task: Task): Promise<void> {
    await this.internalSaveTask(task);
  }

  /**
   * Save multiple tasks
   */
  async saveTasks(tasks: Task[]): Promise<void> {
    await this.internalSaveTasks(tasks);
  }

  /**
   * Internal save task implementation
   */
  protected async internalSaveTask(task: Task): Promise<void> {
    await this.internalSaveTasks([task]);
  }

  /**
   * Internal save tasks implementation
   */
  protected async internalSaveTasks(tasks: Task[]): Promise<void> {
    try {
      await this.connection.execute(async db => {
        for (const task of tasks) {
          await this.saveTaskToDb(db, task);
        }
        this.logger.debug('Tasks saved', { count: tasks.length });
      }, 'saveTasks');
    } catch (error) {
      this.logger.error('Failed to save tasks', {
        error,
        context: { taskCount: tasks.length },
      });

      throw TaskErrorFactory.createTaskStorageError(
        'TaskOperations.internalSaveTasks',
        error instanceof Error ? error : new Error(String(error)),
        { taskCount: tasks.length }
      );
    }
  }

  /**
   * Save a task to the database
   */
  private async saveTaskToDb(db: Database, task: Task): Promise<void> {
    // First save the task without dependencies
    const sql = `
      INSERT OR REPLACE INTO tasks (
        id, path, name, description, type, status,
        parent_path, reasoning, project_path,
        metadata, status_metadata,
        planning_notes, progress_notes, completion_notes, troubleshooting_notes,
        created_at, updated_at, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await db.run(sql, [
      task.id,
      task.path,
      task.name,
      task.description,
      task.type,
      task.status,
      task.parentPath,
      task.reasoning,
      task.projectPath,
      JSON.stringify(task.metadata),
      JSON.stringify(task.statusMetadata),
      JSON.stringify(task.planningNotes),
      JSON.stringify(task.progressNotes),
      JSON.stringify(task.completionNotes),
      JSON.stringify(task.troubleshootingNotes),
      task.created,
      task.updated,
      task.version,
    ]);

    // Then handle dependencies separately using the task_dependencies table
    // First delete existing dependencies
    await db.run('DELETE FROM task_dependencies WHERE task_id = ?', task.id);

    // Then insert new dependencies
    if (task.dependencies && task.dependencies.length > 0) {
      const now = Date.now();
      // First verify all dependencies exist
      for (const depPath of task.dependencies) {
        const depExists = await db.get('SELECT path FROM tasks WHERE path = ?', depPath);
        if (!depExists) {
          throw TaskErrorFactory.createTaskDependencyError(
            'TaskOperations.saveTaskToDb',
            `Dependency not found: ${depPath}`,
            { taskId: task.id, dependencyPath: depPath }
          );
        }
      }

      // Then insert dependencies
      for (const depPath of task.dependencies) {
        await db.run(
          'INSERT INTO task_dependencies (task_id, dependency_path, created_at) VALUES (?, ?, ?)',
          task.id,
          depPath,
          now
        );
      }
    }
  }

  /**
   * Update task relationships when parent path changes
   */
  private async updateTaskRelationships(
    taskPath: string,
    oldParentPath: string | undefined,
    newParentPath: string | undefined
  ): Promise<void> {
    try {
      // Update old parent if it exists
      if (oldParentPath) {
        const oldParent = await this.getTask(oldParentPath);
        if (oldParent) {
          await this.internalSaveTask({
            ...oldParent,
            updated: formatTimestamp(Date.now()),
            version: oldParent.version + 1,
          });
          this.logger.debug('Removed task from old parent', { taskPath, oldParentPath });
        }
      }

      // Update new parent if it exists
      if (newParentPath) {
        const newParent = await this.getTask(newParentPath);
        if (newParent) {
          await this.internalSaveTask({
            ...newParent,
            updated: formatTimestamp(Date.now()),
            version: newParent.version + 1,
          });
          this.logger.debug('Added task to new parent', { taskPath, newParentPath });
        }
      }
    } catch (error) {
      this.logger.error('Failed to update task relationships', {
        error,
        context: { taskPath, oldParentPath, newParentPath },
      });

      throw TaskErrorFactory.createTaskOperationError(
        'TaskOperations.updateTaskRelationships',
        'Failed to update task relationships',
        { taskPath, oldParentPath, newParentPath }
      );
    }
  }

  /**
   * Convert a database row to a Task object
   */
  protected rowToTask(row: Record<string, unknown>): Task {
    return {
      // System fields
      id: String(row.id || ''),
      path: String(row.path || ''),
      name: String(row.name || ''),
      type: String(row.type || '') as TaskType,
      status: String(row.status || '') as TaskStatus,
      created: String(row.created_at || ''),
      updated: String(row.updated_at || ''),
      version: Number(row.version || 1),
      projectPath: String(row.path || '').split('/')[0],

      // Optional fields
      description: row.description ? String(row.description) : undefined,
      parentPath: row.parent_path ? String(row.parent_path) : undefined,
      reasoning: row.reasoning ? String(row.reasoning) : undefined,
      dependencies: this.parseJSON<string[]>(String(row.dependencies || '[]'), []),

      // Status metadata
      statusMetadata: this.parseJSON(String(row.status_metadata || '{}'), {}),

      // Note categories
      planningNotes: this.parseJSON<string[]>(String(row.planning_notes || '[]'), []),
      progressNotes: this.parseJSON<string[]>(String(row.progress_notes || '[]'), []),
      completionNotes: this.parseJSON<string[]>(String(row.completion_notes || '[]'), []),
      troubleshootingNotes: this.parseJSON<string[]>(String(row.troubleshooting_notes || '[]'), []),

      // User metadata
      metadata: this.parseJSON(String(row.metadata || '{}'), {}),
    };
  }

  /**
   * Parse JSON with fallback
   */
  protected parseJSON<T>(value: string | null | undefined, defaultValue: T): T {
    if (!value) return defaultValue;
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      this.logger.warn('Failed to parse JSON', { value });
      return defaultValue;
    }
  }
}
