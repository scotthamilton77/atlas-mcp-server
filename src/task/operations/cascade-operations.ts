import { Logger } from '../../logging/index.js';
import { TaskStorage } from '../../types/storage.js';
import { Task } from '../../types/task.js';
import { TaskErrorFactory } from '../../errors/task-error.js';

export class CascadeOperations {
  private readonly logger: Logger;

  constructor(private readonly storage: TaskStorage) {
    this.logger = Logger.getInstance().child({ component: 'CascadeOperations' });
  }

  /**
   * Delete a task and handle its children according to the specified strategy
   */
  async deleteWithChildren(
    path: string,
    strategy: 'cascade' | 'orphan' | 'block' = 'block'
  ): Promise<{ deleted: string[]; orphaned: string[]; blocked: string[] }> {
    const result = {
      deleted: [] as string[],
      orphaned: [] as string[],
      blocked: [] as string[],
    };

    try {
      // Get the task and its children
      const task: Task | null = await this.storage.getTask(path);
      if (!task) {
        throw TaskErrorFactory.createTaskNotFoundError(
          'CascadeOperations.deleteWithChildren',
          path
        );
      }

      const children = await this.storage.getChildren(path);

      // Get dependent tasks
      const dependentTasks = await this.storage.getDependentTasks(path);
      const dependentPaths = dependentTasks.map(t => t.path);

      // Handle based on strategy
      switch (strategy) {
        case 'cascade':
          // For cascade, update dependent tasks to remove the dependency
          for (const depTask of dependentTasks) {
            const updatedDeps = depTask.dependencies.filter(d => d !== path);
            await this.storage.updateTask(depTask.path, {
              dependencies: updatedDeps,
              metadata: {
                ...depTask.metadata,
                removedDependencies: Array.isArray(depTask.metadata?.removedDependencies)
                  ? [
                      ...depTask.metadata.removedDependencies,
                      { path, removedAt: new Date().toISOString() },
                    ]
                  : [{ path, removedAt: new Date().toISOString() }],
              },
            });
          }
          // Then delete all children recursively
          for (const child of children) {
            const childResult = await this.deleteWithChildren(child.path, 'cascade');
            result.deleted.push(...childResult.deleted);
          }
          result.deleted.push(path);
          await this.storage.deleteTask(path);
          break;

        case 'orphan':
          // For orphan, update dependent tasks to remove the dependency
          for (const depTask of dependentTasks) {
            const updatedDeps = depTask.dependencies.filter(d => d !== path);
            await this.storage.updateTask(depTask.path, {
              dependencies: updatedDeps,
              metadata: {
                ...depTask.metadata,
                removedDependencies: Array.isArray(depTask.metadata?.removedDependencies)
                  ? [
                      ...depTask.metadata.removedDependencies,
                      { path, removedAt: new Date().toISOString() },
                    ]
                  : [{ path, removedAt: new Date().toISOString() }],
              },
            });
          }
          // Then update children to remove parent reference
          for (const child of children) {
            await this.storage.updateTask(child.path, {
              parentPath: undefined,
              metadata: {
                ...child.metadata,
                orphanedAt: new Date().toISOString(),
                previousParent: path,
              },
            });
            result.orphaned.push(child.path);
          }
          result.deleted.push(path);
          await this.storage.deleteTask(path);
          break;

        case 'block':
          // For block strategy, prevent deletion if there are children OR dependent tasks
          if (children.length > 0 || dependentTasks.length > 0) {
            result.blocked.push(path);
            const reason = [];
            if (children.length > 0) {
              reason.push(`has ${children.length} child task(s)`);
            }
            if (dependentTasks.length > 0) {
              reason.push(
                `has ${dependentTasks.length} dependent task(s): ${dependentPaths.join(', ')}`
              );
            }
            throw TaskErrorFactory.createTaskOperationError(
              'CascadeOperations.deleteWithChildren',
              `Cannot delete task that ${reason.join(' and ')}`,
              {
                taskPath: path,
                childCount: children.length,
                dependentCount: dependentTasks.length,
                dependentPaths,
              }
            );
          }
          result.deleted.push(path);
          await this.storage.deleteTask(path);
          break;
      }

      this.logger.info('Task deletion completed', {
        path,
        strategy,
        deleted: result.deleted.length,
        orphaned: result.orphaned.length,
        blocked: result.blocked.length,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to delete task with children', {
        error,
        context: { path, strategy },
      });
      throw error;
    }
  }

  /**
   * Clean up orphaned tasks
   */
  async cleanupOrphans(): Promise<{
    fixed: number;
    errors: Array<{ path: string; error: string }>;
  }> {
    const result = {
      fixed: 0,
      errors: [] as Array<{ path: string; error: string }>,
    };

    try {
      // Get all tasks
      const tasks = await this.storage.getTasksByPattern('**');

      for (const task of tasks) {
        try {
          if (task.parentPath) {
            const parent = await this.storage.getTask(task.parentPath);
            if (!parent) {
              // Parent doesn't exist - remove the reference
              await this.storage.updateTask(task.path, {
                parentPath: undefined,
                metadata: {
                  ...task.metadata,
                  orphanedAt: new Date().toISOString(),
                  previousParent: task.parentPath,
                },
              });
              result.fixed++;
            }
          }
        } catch (error) {
          result.errors.push({
            path: task.path,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      this.logger.info('Orphan cleanup completed', {
        fixed: result.fixed,
        errors: result.errors.length,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to cleanup orphaned tasks', { error });
      throw TaskErrorFactory.createTaskOperationError(
        'CascadeOperations.cleanupOrphans',
        'Failed to cleanup orphaned tasks',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Validate parent-child relationships
   */
  async validateRelationships(): Promise<{
    valid: boolean;
    issues: Array<{ type: string; path: string; details: string }>;
  }> {
    const issues: Array<{ type: string; path: string; details: string }> = [];

    try {
      const tasks = await this.storage.getTasksByPattern('**');

      // Check for circular parent-child relationships
      const visited = new Set<string>();
      const recursionStack = new Set<string>();

      const checkCircular = async (path: string): Promise<boolean> => {
        if (recursionStack.has(path)) {
          issues.push({
            type: 'circular_reference',
            path,
            details: `Circular parent-child relationship detected: ${Array.from(recursionStack).join(' -> ')} -> ${path}`,
          });
          return true;
        }

        if (visited.has(path)) return false;

        visited.add(path);
        recursionStack.add(path);

        const task = await this.storage.getTask(path);
        if (task?.parentPath) {
          await checkCircular(task.parentPath);
        }

        recursionStack.delete(path);
        return false;
      };

      // Check each task
      for (const task of tasks) {
        // Validate parent exists if specified
        if (task.parentPath) {
          const parent = await this.storage.getTask(task.parentPath);
          if (!parent) {
            issues.push({
              type: 'missing_parent',
              path: task.path,
              details: `Parent task not found: ${task.parentPath}`,
            });
          }
        }

        // Check for circular references
        await checkCircular(task.path);
      }

      this.logger.info('Relationship validation completed', {
        taskCount: tasks.length,
        issueCount: issues.length,
      });

      return {
        valid: issues.length === 0,
        issues,
      };
    } catch (error) {
      this.logger.error('Failed to validate relationships', { error });
      throw TaskErrorFactory.createTaskOperationError(
        'CascadeOperations.validateRelationships',
        'Failed to validate relationships',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }
}
