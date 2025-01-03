import { TaskType, TaskStatus, UpdateTaskInput } from '../../../types/task.js';
import { ToolFactory, ToolImplementation } from './shared/types.js';
import { formatResponse } from './shared/response-formatter.js';
import { DependencyAwareBatchProcessor } from '../../../task/core/batch/dependency-aware-batch-processor.js';
import { BatchData } from '../../../task/core/batch/common/batch-utils.js';
import { ErrorCodes, createError, BaseError } from '../../../errors/index.js';

interface ValidationDetails {
  dependencies?: {
    missing?: string[];
    invalid?: string[];
    cycles?: string[];
  };
  status?: {
    currentStatus: TaskStatus;
    targetStatus: TaskStatus;
    allowedTransitions: TaskStatus[];
    blockingDependencies?: string[];
  };
}

interface ValidationMetadata {
  operation: string;
  details: ValidationDetails;
}

function getSuggestions(error: BaseError): string[] {
  const suggestions: string[] = [];
  const metadata = error.getMetadata() as ValidationMetadata | undefined;
  const details = metadata?.details;

  if (details?.dependencies?.missing) {
    suggestions.push('Create missing dependency tasks before this operation');
  }
  if (details?.dependencies?.cycles) {
    suggestions.push('Restructure dependencies to remove circular references');
  }
  if (details?.status?.blockingDependencies) {
    suggestions.push('Complete or unblock dependent tasks before status transition');
  }

  return suggestions;
}

function getRecommendations(errors: BaseError[]): string[] {
  const recommendations = new Set<string>();

  // Analyze patterns in errors
  const hasDependencyIssues = errors.some(e => {
    const metadata = e.getMetadata() as ValidationMetadata | undefined;
    return metadata?.details?.dependencies;
  });

  const hasStatusIssues = errors.some(e => {
    const metadata = e.getMetadata() as ValidationMetadata | undefined;
    return metadata?.details?.status;
  });

  const hasMultipleErrors = errors.length > 1;

  if (hasDependencyIssues) {
    recommendations.add('Review and validate all task dependencies before bulk operations');
  }
  if (hasStatusIssues) {
    recommendations.add(
      'Ensure tasks are updated in the correct order based on their dependencies'
    );
  }
  if (hasMultipleErrors) {
    recommendations.add('Consider breaking down bulk operations into smaller, focused updates');
  }

  return Array.from(recommendations);
}

/**
 * Bulk task operations tool implementation
 */
export const bulkTaskOperationsTool: ToolFactory = (context): ToolImplementation => ({
  definition: {
    name: 'bulk_task_operations',
    description: `Execute multiple task operations atomically.

Performance Optimization:
- Operations processed in dependency order
- Single-operation batches for consistency
- Full transaction rollback on failure
- Retry mechanism: 3 retries, 1s delay

Validation:
- Cross-operation dependency validation
- Status transition rules enforced
- Parent-child relationships validated
- Flexible metadata structure

Best Practices:
- Group related operations
- Order operations by dependencies
- Include clear operation reasoning
- Handle parent-child updates together
- Consider status propagation effects

Operation Limits:
- Path: max length 1000 chars, max depth 10
- Dependencies: max 50 per task
- Notes: max 100 per category

Example:
{
  "operations": [
    {
      "type": "create",
      "path": "project/backend/oauth2",
      "data": {
        "title": "Implement OAuth2 Authentication",
        "type": "MILESTONE",
        "description": "Replace JWT auth with OAuth2 implementation",
        "planningNotes": [
          "Research OAuth2 providers",
          "Define integration requirements"
        ],
        "metadata": {
          "reasoning": "OAuth2 provides better security and standardization"
        }
      }
    },
    {
      "type": "create",
      "path": "project/backend/oauth2/provider-setup",
      "data": {
        "title": "Configure OAuth2 Providers",
        "dependencies": ["project/backend/oauth2"],
        "planningNotes": [
          "List required OAuth2 providers",
          "Document configuration requirements"
        ],
        "metadata": {
          "reasoning": "Provider setup required before implementation"
        }
      }
    },
    {
      "type": "update",
      "path": "project/backend/auth",
      "data": {
        "status": "CANCELLED",
        "completionNotes": [
          "Functionality replaced by OAuth2 implementation"
        ],
        "metadata": {
          "reasoning": "Replaced by OAuth2 implementation"
        }
      }
    }
  ],
  "reasoning": "Transitioning authentication system to OAuth2. Creating necessary task structure and updating existing tasks to reflect the change."
}`,
    inputSchema: {
      type: 'object',
      properties: {
        operations: {
          type: 'array',
          description: `Sequence of atomic task operations with validation:

Operation Constraints:
- Path: max length 1000 chars, max depth 10 levels
- Dependencies: max 50 per task
- Notes: max 100 per category, each max 1000 chars
- Metadata fields: max 100 entries each

Create Operations:
- title: Task name (required)
- description: Task details
- type: TASK/MILESTONE
- dependencies: Required tasks
- metadata: Flexible task tracking fields
- notes: Task documentation

Update Operations:
- Status changes validate dependencies
- Parent-child relationships enforced
- Flexible metadata updates
- Note updates supported

Delete Operations:
- Cascades to all child tasks
- Updates dependent references
- Validates relationship integrity

Execution:
- Operations processed in dependency order
- Full transaction rollback on failure
- Retry mechanism: 3 retries, 1s delay
- Atomic - all succeed or all fail`,
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['create', 'update', 'delete'],
                description: `Operation type:
- create: Add new task with full context
- update: Modify existing task properties
- delete: Remove task and children`,
              },
              path: {
                type: 'string',
                description: `Task path for operation:
- Must be valid path format
- Create: Sets new task location
- Update: Identifies target task
- Delete: Specifies task to remove`,
              },
              data: {
                type: 'object',
                description: `Operation-specific data:
Create/Update fields:
- title: Task name
- description: Task details
- type: TASK/MILESTONE
- status: Task state
- dependencies: Required tasks
- planningNotes: Planning notes
- progressNotes: Progress notes
- completionNotes: Completion notes
- troubleshootingNotes: Troubleshooting notes
- metadata: Additional context
Delete: No additional data needed`,
              },
            },
            required: ['type', 'path'],
          },
        },
        reasoning: {
          type: 'string',
          description: `Explanation for bulk operation. Best practices:
- Document overall goal and rationale
- Explain relationships between operations
- Note impact on existing tasks and dependencies
- Record migration details and backup locations
- Include validation and testing strategy
- Document rollback procedures if needed`,
        },
      },
      required: ['operations'],
    },
  },
  handler: async (args: Record<string, unknown>) => {
    const { operations } = args as {
      operations: Array<{
        type: 'create' | 'update' | 'delete';
        path: string;
        data?: Record<string, unknown>;
      }>;
    };

    const batchProcessor = new DependencyAwareBatchProcessor(
      {
        validator: null,
        logger: context.logger,
        storage: context.taskManager.getStorage(),
      },
      {
        maxBatchSize: 1,
        concurrentBatches: 1,
        maxRetries: 3,
        retryDelay: 1000,
      }
    );

    const result = await batchProcessor.processInBatches(
      operations.map(op => ({
        id: op.path,
        data: op,
        dependencies: (op.data?.dependencies as string[]) || [],
      })),
      1,
      async (operation: BatchData) => {
        const op = operation.data as { type: string; path: string; data?: Record<string, unknown> };

        switch (op.type) {
          case 'create': {
            await context.taskManager.createTask({
              path: op.path,
              name: (op.data?.title as string) || op.path.split('/').pop() || '',
              type: ((op.data?.type as string) || 'TASK').toUpperCase() as TaskType,
              description: op.data?.description as string,
              dependencies: (op.data?.dependencies as string[]) || [],
              metadata: (op.data?.metadata as Record<string, unknown>) || {},
              statusMetadata: {},
              planningNotes: Array.isArray(op.data?.planningNotes)
                ? (op.data.planningNotes as string[])
                : [],
              progressNotes: Array.isArray(op.data?.progressNotes)
                ? (op.data.progressNotes as string[])
                : [],
              completionNotes: Array.isArray(op.data?.completionNotes)
                ? (op.data.completionNotes as string[])
                : [],
              troubleshootingNotes: Array.isArray(op.data?.troubleshootingNotes)
                ? (op.data.troubleshootingNotes as string[])
                : [],
            });
            break;
          }
          case 'update': {
            // First get existing task to preserve required fields
            const existingTask = await context.taskManager.getTask(op.path);
            if (!existingTask) {
              throw createError(
                ErrorCodes.TASK_NOT_FOUND,
                `Task not found at path: ${op.path}`,
                'bulk_task_operations'
              );
            }

            // Create update object preserving all required fields
            const updateData: UpdateTaskInput = {
              // Required fields
              name: existingTask.name,
              type: existingTask.type,
              status: existingTask.status,

              // Optional fields
              description: existingTask.description,
              dependencies: existingTask.dependencies,
              metadata: { ...existingTask.metadata },
              statusMetadata: { ...existingTask.statusMetadata },
              planningNotes: [...existingTask.planningNotes],
              progressNotes: [...existingTask.progressNotes],
              completionNotes: [...existingTask.completionNotes],
              troubleshootingNotes: [...existingTask.troubleshootingNotes],
            };

            // Apply updates only if they are provided
            if (typeof op.data?.title === 'string') {
              updateData.name = op.data.title;
            }
            if (op.data?.type) {
              updateData.type = (op.data.type as string).toUpperCase() as TaskType;
            }
            if (op.data?.description !== undefined) {
              updateData.description = op.data.description as string;
            }
            if (op.data?.status !== undefined) {
              updateData.status = op.data.status as TaskStatus;
            }
            if (Array.isArray(op.data?.dependencies)) {
              updateData.dependencies = op.data.dependencies as string[];
            }
            if (Array.isArray(op.data?.planningNotes)) {
              updateData.planningNotes = op.data.planningNotes as string[];
            }
            if (Array.isArray(op.data?.progressNotes)) {
              updateData.progressNotes = op.data.progressNotes as string[];
            }
            if (Array.isArray(op.data?.completionNotes)) {
              updateData.completionNotes = op.data.completionNotes as string[];
            }
            if (Array.isArray(op.data?.troubleshootingNotes)) {
              updateData.troubleshootingNotes = op.data.troubleshootingNotes as string[];
            }
            if (op.data?.metadata) {
              updateData.metadata = {
                ...updateData.metadata,
                ...(op.data.metadata as Record<string, unknown>),
              };
            }
            if (op.data?.statusMetadata) {
              updateData.statusMetadata = {
                ...updateData.statusMetadata,
                ...(op.data.statusMetadata as Record<string, unknown>),
              };
            }

            await context.taskManager.updateTask(op.path, updateData);
            break;
          }
          case 'delete':
            await context.taskManager.deleteTask(op.path);
            break;
          default:
            throw createError(
              ErrorCodes.INVALID_INPUT,
              `Invalid operation type: ${op.type}`,
              'bulk_task_operations'
            );
        }
      }
    );

    // Process errors and create validation summaries
    const processedErrors = (result.errors || []).map(error => {
      if (!(error instanceof BaseError)) {
        // Convert standard errors to BaseErrors
        return createError(
          ErrorCodes.OPERATION_FAILED,
          error.message,
          'bulk_task_operations',
          'Operation failed',
          {
            operation: 'bulk_task_operations',
            details: {
              originalError: error,
            },
          }
        );
      }
      return error;
    });

    // Create validation summaries
    const dependencyIssues = processedErrors
      .filter(error => {
        const metadata = error.getMetadata() as ValidationMetadata | undefined;
        return metadata?.details?.dependencies;
      })
      .map(error => {
        const metadata = error.getMetadata() as ValidationMetadata | undefined;
        return {
          path: error.getOperation(),
          dependencies: metadata?.details?.dependencies,
        };
      });

    const statusIssues = processedErrors
      .filter(error => {
        const metadata = error.getMetadata() as ValidationMetadata | undefined;
        return metadata?.details?.status;
      })
      .map(error => {
        const metadata = error.getMetadata() as ValidationMetadata | undefined;
        return {
          path: error.getOperation(),
          status: metadata?.details?.status,
        };
      });

    return formatResponse(
      {
        success: result.metadata?.successCount === operations.length,
        processedCount: result.metadata?.successCount || 0,
        failedCount: result.metadata?.errorCount || 0,
        errors: processedErrors.map(error => ({
          code: error.code,
          message: error.message,
          operation: error.getOperation(),
          severity: error.getSeverity(),
          timestamp: error.getTimestamp(),
          metadata: error.getMetadata(),
          suggestions: getSuggestions(error),
        })),
        validationSummary: {
          dependencyIssues: dependencyIssues.length ? dependencyIssues : undefined,
          statusIssues: statusIssues.length ? statusIssues : undefined,
        },
        recommendations: getRecommendations(processedErrors),
      },
      context.logger
    );
  },
});
