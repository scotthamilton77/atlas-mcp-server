import { Logger } from '../../logging/index.js';
import { TaskStorage } from '../../types/storage.js';
import { TaskType, TaskStatus, Task } from '../../types/task.js';
import { bulkOperationsSchema } from './schemas/bulk-operations-schema.js';
import { ErrorCodes, createError } from '../../errors/index.js';
import { 
    taskMetadataSchema,
    createTaskSchema,
    updateTaskSchema,
    CreateTaskInput,
    UpdateTaskInput
} from './schemas/index.js';
import { TaskValidators } from './validators/index.js';

export interface ValidationResult {
    success: boolean;
    errors: string[];
}

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
            // Validate schema first
            const validatedInput = createTaskSchema.parse(input);

            // Check for existing task
            const existingTask = await this.storage.getTask(validatedInput.path);
            if (existingTask) {
                throw createError(
                    ErrorCodes.TASK_DUPLICATE,
                    `Task already exists at path: ${validatedInput.path}`,
                    'TaskValidator.validateCreate',
                    'A task with this path already exists. Please use a different path.'
                );
            }

            // Create dummy task for validation
            const task: Task = {
                path: validatedInput.path,
                name: validatedInput.name,
                type: validatedInput.type || TaskType.TASK,
                status: TaskStatus.PENDING,
                created: Date.now(),
                updated: Date.now(),
                version: 1,
                projectPath: validatedInput.path.split('/')[0],
                description: validatedInput.description,
                parentPath: validatedInput.parentPath,
                notes: validatedInput.notes || [],
                reasoning: validatedInput.reasoning,
                dependencies: validatedInput.dependencies || [],
                subtasks: [],
                metadata: validatedInput.metadata || {}
            };

            // Validate hierarchy if parent path provided
            if (validatedInput.parentPath) {
                await this.validators.validateHierarchy(task, validatedInput.parentPath, this.storage.getTask.bind(this.storage));
            }

            // Always validate dependencies to check for cycles
            await this.validators.validateDependencies(
                task,
                validatedInput.dependencies || [],
                this.storage.getTask.bind(this.storage)
            );

            // Validate metadata if provided
            if (validatedInput.metadata) {
                taskMetadataSchema.parse(validatedInput.metadata);
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
            // Validate schema first
            const validatedUpdates = updateTaskSchema.parse(updates);

            // Get existing task
            const existingTask = await this.storage.getTask(path);
            if (!existingTask) {
                throw createError(
                    ErrorCodes.TASK_NOT_FOUND,
                    `Task not found: ${path}`,
                    'TaskValidator.validateUpdate'
                );
            }

            // Validate type change
            if (validatedUpdates.type && validatedUpdates.type !== existingTask.type) {
                await this.validators.validateTypeChange(existingTask, validatedUpdates.type);
            }

            // Validate status change
            if (validatedUpdates.status && validatedUpdates.status !== existingTask.status) {
                await this.validators.validateStatusTransition(
                    existingTask,
                    validatedUpdates.status,
                    this.storage.getTask.bind(this.storage)
                );
            }

            // Validate dependencies change
            if (validatedUpdates.dependencies) {
                await this.validators.validateDependencies(
                    existingTask,
                    validatedUpdates.dependencies,
                    this.storage.getTask.bind(this.storage)
                );
            }

            // Validate metadata updates
            if (validatedUpdates.metadata) {
                taskMetadataSchema.parse({
                    ...existingTask.metadata,
                    ...validatedUpdates.metadata
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
            // Parse and validate schema
            const parsed = bulkOperationsSchema.parse(input);
            const errors: string[] = [];

            // Validate each operation individually
            for (const op of parsed.operations) {
                try {
                    if (op.type === 'create') {
                        await this.validateCreate(op.data as CreateTaskInput);
                    } else if (op.type === 'update') {
                        await this.validateUpdate(op.path, op.data as UpdateTaskInput);
                    }
                } catch (opError) {
                    this.logger.error('Operation validation failed', {
                        error: opError,
                        operation: op
                    });
                    errors.push(`${op.type} operation failed for path ${op.path}: ${opError instanceof Error ? opError.message : String(opError)}`);
                }
            }

            return {
                success: errors.length === 0,
                errors
            };
        } catch (error) {
            this.logger.error('Bulk operations validation failed', { error });
            const errors = error instanceof Error ? [error.message] : ['Invalid bulk operations input'];
            return { success: false, errors };
        }
    }
}
