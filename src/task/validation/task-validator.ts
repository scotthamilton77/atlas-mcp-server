import { Logger } from '../../logging/index.js';
import { TaskStorage } from '../../types/storage.js';
import { TaskType, TaskStatus, ValidationResult } from '../../types/task.js';
import { bulkOperationsSchema } from './schemas/bulk-operations-schema.js';
import { ErrorCodes, createError } from '../../errors/index.js';
import { 
    taskMetadataSchema,
    createTaskSchema,
    updateTaskSchema,
    CreateTaskInput,
    UpdateTaskInput,
    BaseTask
} from './schemas/index.js';
import { TaskValidators } from './validators/index.js';

/**
 * Main task validator that coordinates all validation rules
 */
export class TaskValidator {
    private readonly logger: Logger;
    private readonly validators: TaskValidators;

    constructor(private readonly storage: TaskStorage) {
        this.logger = Logger.getInstance().child({ component: 'TaskValidator' });
        this.validators = new TaskValidators();
    }

    /**
     * Validates task creation input
     */
    async validateCreate(input: CreateTaskInput): Promise<void> {
        try {
            // Validate schema
            createTaskSchema.parse(input);

            // Create dummy task for validation
            const task: BaseTask = {
                path: input.path,
                name: input.name,
                type: input.type || TaskType.TASK,
                status: TaskStatus.PENDING,
                created: Date.now(),
                updated: Date.now(),
                version: 1,
                projectPath: input.path.split('/')[0],
                dependencies: input.dependencies || [],
                subtasks: [],
                metadata: input.metadata || {}
            };

            // Validate hierarchy if parent path provided
            await this.validators.validateHierarchy(task, input.parentPath, this.storage.getTask.bind(this.storage));

            // Validate dependencies if provided
            if (input.dependencies?.length) {
                await this.validators.validateDependencies(task, input.dependencies, this.storage.getTask.bind(this.storage));
            }

            // Validate metadata if provided
            if (input.metadata) {
                taskMetadataSchema.parse(input.metadata);
            }
        } catch (error) {
            this.logger.error('Task creation validation failed', {
                error,
                input
            });
            throw error;
        }
    }

    /**
     * Validates task update input
     */
    async validateUpdate(path: string, updates: UpdateTaskInput): Promise<void> {
        try {
            // Get existing task
            const existingTask = await this.storage.getTask(path);
            if (!existingTask) {
                throw createError(
                    ErrorCodes.TASK_NOT_FOUND,
                    `Task not found: ${path}`,
                    'TaskValidator.validateUpdate'
                );
            }

            // Validate schema
            updateTaskSchema.parse(updates);

            // Convert to base task type
            const task: BaseTask = {
                ...existingTask,
                dependencies: existingTask.dependencies || [],
                subtasks: existingTask.subtasks || [],
                metadata: existingTask.metadata || {}
            };

            // Validate type change
            if (updates.type && updates.type !== existingTask.type) {
                await this.validators.validateTypeChange(task, updates.type);
            }

            // Validate status change
            if (updates.status && updates.status !== existingTask.status) {
                const siblings = await this.storage.getSubtasks(existingTask.parentPath || '');
                await this.validators.validateStatus(
                    task,
                    updates.status,
                    this.storage.getTask.bind(this.storage),
                    siblings
                );
            }

            // Validate dependencies change
            if (updates.dependencies) {
                await this.validators.validateDependencies(
                    task,
                    updates.dependencies,
                    this.storage.getTask.bind(this.storage)
                );
            }

            // Validate metadata updates
            if (updates.metadata) {
                taskMetadataSchema.parse({
                    ...existingTask.metadata,
                    ...updates.metadata
                });
            }
        } catch (error) {
            this.logger.error('Task update validation failed', {
                error,
                path,
                updates
            });
            throw error;
        }
    }

    /**
     * Validates bulk operations input
     */
    async validateBulkOperations(input: unknown): Promise<ValidationResult> {
        try {
            bulkOperationsSchema.parse(input);
            return { success: true, errors: [] };
        } catch (error) {
            const errors = error instanceof Error ? [error.message] : ['Invalid bulk operations input'];
            return { success: false, errors };
        }
    }
}
