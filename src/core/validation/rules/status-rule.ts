import { Task } from '../../../shared/types/task.js';
import { Logger } from '../../../logging/index.js';
import {
    ValidationContext,
    ValidationResult,
    TaskValidationError,
    ValidationErrorCodes,
    AbstractBusinessRule,
    createValidationResult
} from '../types.js';

/**
 * Status rule configuration
 */
export interface StatusRuleConfig {
    allowTransitions: boolean;
    validateParent: boolean;
    validateChildren: boolean;
}

/**
 * Default status rule configuration
 */
export const DEFAULT_STATUS_RULE_CONFIG: StatusRuleConfig = {
    allowTransitions: true,
    validateParent: true,
    validateChildren: true
};

/**
 * Valid status transitions
 */
const VALID_TRANSITIONS = new Map<string, Set<string>>([
    ['pending', new Set(['in_progress', 'blocked'])],
    ['in_progress', new Set(['completed', 'failed', 'blocked'])],
    ['blocked', new Set(['in_progress'])],
    ['failed', new Set(['in_progress'])],
    ['completed', new Set()]
]);

/**
 * Status validation rule
 */
export class StatusRule extends AbstractBusinessRule<Task, TaskValidationError> {
    private readonly logger: Logger;
    private readonly config: StatusRuleConfig;

    constructor(config: Partial<StatusRuleConfig> = {}) {
        super();
        this.config = { ...DEFAULT_STATUS_RULE_CONFIG, ...config };
        this.logger = Logger.getInstance().child({ component: 'StatusRule' });
    }

    /**
     * Validate task status
     */
    async validate(
        task: Task,
        context: ValidationContext
    ): Promise<ValidationResult<TaskValidationError>> {
        try {
            const errors: TaskValidationError[] = [];
            const { status } = task;

            // Get shared task map
            const taskMap = (context.shared?.get('tasks') as Map<string, Task>) ?? new Map();

            // Check status exists
            if (!status) {
                errors.push(
                    this.createError(
                        ValidationErrorCodes.MISSING_FIELD,
                        'Status is required',
                        ['status'],
                        task
                    )
                );
                return createValidationResult(errors);
            }

            // Check status is valid
            if (!VALID_TRANSITIONS.has(status)) {
                errors.push(
                    this.createError(
                        ValidationErrorCodes.INVALID_VALUE,
                        `Invalid status: ${status}`,
                        ['status'],
                        task,
                        { status }
                    )
                );
                return createValidationResult(errors);
            }

            // Check status transition
            if (this.config.allowTransitions) {
                const operation = context.operation;
                const oldTask = taskMap.get(task.id);
                if (oldTask && operation === 'update') {
                    const validTransitions = VALID_TRANSITIONS.get(oldTask.status) ?? new Set();
                    if (!validTransitions.has(status)) {
                        errors.push(
                            this.createError(
                                ValidationErrorCodes.INVALID_STATE,
                                `Invalid status transition: ${oldTask.status} -> ${status}`,
                                ['status'],
                                task,
                                {
                                    oldStatus: oldTask.status,
                                    newStatus: status,
                                    validTransitions: Array.from(validTransitions)
                                }
                            )
                        );
                    }
                }
            }

            // Check parent status
            if (this.config.validateParent && task.parentId) {
                const parent = taskMap.get(task.parentId);
                if (parent) {
                    if (parent.status === 'failed' && status !== 'failed') {
                        errors.push(
                            this.createError(
                                ValidationErrorCodes.INVALID_STATE,
                                'Parent task has failed',
                                ['status'],
                                task,
                                { parentId: parent.id, parentStatus: parent.status }
                            )
                        );
                    }
                    if (parent.status === 'blocked' && status === 'in_progress') {
                        errors.push(
                            this.createError(
                                ValidationErrorCodes.INVALID_STATE,
                                'Parent task is blocked',
                                ['status'],
                                task,
                                { parentId: parent.id, parentStatus: parent.status }
                            )
                        );
                    }
                }
            }

            // Check children status
            if (this.config.validateChildren) {
                const children = Array.from(taskMap.values()).filter(t => t.parentId === task.id);
                if (children.length > 0) {
                    if (status === 'completed' && children.some(c => c.status !== 'completed')) {
                        errors.push(
                            this.createError(
                                ValidationErrorCodes.INVALID_STATE,
                                'Cannot complete task with incomplete children',
                                ['status'],
                                task,
                                {
                                    childStatuses: children.map(c => ({
                                        id: c.id,
                                        status: c.status
                                    }))
                                }
                            )
                        );
                    }
                }
            }

            return createValidationResult(errors);
        } catch (error) {
            this.logger.error('Status validation failed', { error, task });
            throw this.createError(
                ValidationErrorCodes.RUNTIME_ERROR,
                'Status validation failed',
                [],
                task,
                { error: error instanceof Error ? error.message : String(error) }
            );
        }
    }
}

/**
 * Create status rule instance
 */
export function createStatusRule(
    config?: Partial<StatusRuleConfig>
): StatusRule {
    return new StatusRule(config);
}
