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
 * Relationship rule configuration
 */
export interface RelationshipRuleConfig {
    validateParent: boolean;
    validateChildren: boolean;
    maxChildren: number;
    maxDepth: number;
}

/**
 * Default relationship rule configuration
 */
export const DEFAULT_RELATIONSHIP_RULE_CONFIG: RelationshipRuleConfig = {
    validateParent: true,
    validateChildren: true,
    maxChildren: 100,
    maxDepth: 10
};

/**
 * Relationship validation rule
 */
export class RelationshipRule extends AbstractBusinessRule<Task, TaskValidationError> {
    private readonly logger: Logger;
    private readonly config: RelationshipRuleConfig;

    constructor(config: Partial<RelationshipRuleConfig> = {}) {
        super();
        this.config = { ...DEFAULT_RELATIONSHIP_RULE_CONFIG, ...config };
        this.logger = Logger.getInstance().child({ component: 'RelationshipRule' });
    }

    /**
     * Validate task relationships
     */
    async validate(
        task: Task,
        context: ValidationContext
    ): Promise<ValidationResult<TaskValidationError>> {
        try {
            const errors: TaskValidationError[] = [];

            // Get shared task map
            const taskMap = (context.shared?.get('tasks') as Map<string, Task>) ?? new Map();

            // Validate parent relationship
            if (this.config.validateParent) {
                await this.validateParentRelationship(task, taskMap, errors);
            }

            // Validate children relationships
            if (this.config.validateChildren) {
                await this.validateChildrenRelationships(task, taskMap, errors);
            }

            return createValidationResult(errors);
        } catch (error) {
            this.logger.error('Relationship validation failed', { error, task });
            throw this.createError(
                ValidationErrorCodes.RUNTIME_ERROR,
                'Relationship validation failed',
                [],
                task,
                { error: error instanceof Error ? error.message : String(error) }
            );
        }
    }

    /**
     * Validate parent relationship
     */
    private async validateParentRelationship(
        task: Task,
        taskMap: Map<string, Task>,
        errors: TaskValidationError[]
    ): Promise<void> {
        const { parentId } = task;

        // Skip if no parent
        if (!parentId) {
            return;
        }

        // Check parent exists
        const parent = taskMap.get(parentId);
        if (!parent) {
            errors.push(
                this.createError(
                    ValidationErrorCodes.INVALID_REFERENCE,
                    `Parent task not found: ${parentId}`,
                    ['parentId'],
                    task,
                    { parentId }
                )
            );
            return;
        }

        // Check for self-reference
        if (parentId === task.id) {
            errors.push(
                this.createError(
                    ValidationErrorCodes.INVALID_REFERENCE,
                    'Task cannot be its own parent',
                    ['parentId'],
                    task,
                    { parentId }
                )
            );
            return;
        }

        // Check parent status
        if (parent.status === 'failed') {
            errors.push(
                this.createError(
                    ValidationErrorCodes.INVALID_STATE,
                    'Cannot add task to failed parent',
                    ['parentId'],
                    task,
                    { parentId, parentStatus: parent.status }
                )
            );
        }

        // Check hierarchy depth
        const depth = this.getHierarchyDepth(task.id, taskMap);
        if (depth > this.config.maxDepth) {
            errors.push(
                this.createError(
                    ValidationErrorCodes.CONSTRAINT_ERROR,
                    `Maximum hierarchy depth exceeded: ${depth}`,
                    ['parentId'],
                    task,
                    { maxDepth: this.config.maxDepth, currentDepth: depth }
                )
            );
        }
    }

    /**
     * Validate children relationships
     */
    private async validateChildrenRelationships(
        task: Task,
        taskMap: Map<string, Task>,
        errors: TaskValidationError[]
    ): Promise<void> {
        // Get direct children
        const children = Array.from(taskMap.values()).filter(t => t.parentId === task.id);

        // Check children count
        if (children.length > this.config.maxChildren) {
            errors.push(
                this.createError(
                    ValidationErrorCodes.CONSTRAINT_ERROR,
                    `Maximum children count exceeded: ${children.length}`,
                    ['children'],
                    task,
                    { maxChildren: this.config.maxChildren, currentCount: children.length }
                )
            );
        }

        // Check children status
        if (task.status === 'failed') {
            const activeChildren = children.filter(
                child => child.status !== 'failed' && child.status !== 'completed'
            );
            if (activeChildren.length > 0) {
                errors.push(
                    this.createError(
                        ValidationErrorCodes.INVALID_STATE,
                        'Failed task cannot have active children',
                        ['status'],
                        task,
                        {
                            activeChildren: activeChildren.map(c => ({
                                id: c.id,
                                status: c.status
                            }))
                        }
                    )
                );
            }
        }
    }

    /**
     * Get hierarchy depth for a task
     */
    private getHierarchyDepth(taskId: string, taskMap: Map<string, Task>, visited = new Set<string>()): number {
        // Check for cycles
        if (visited.has(taskId)) {
            return 0;
        }

        // Mark task as visited
        visited.add(taskId);

        // Get task
        const task = taskMap.get(taskId);
        if (!task || !task.parentId) {
            return 1;
        }

        // Recursively get parent depth
        return 1 + this.getHierarchyDepth(task.parentId, taskMap, visited);
    }
}

/**
 * Create relationship rule instance
 */
export function createRelationshipRule(
    config?: Partial<RelationshipRuleConfig>
): RelationshipRule {
    return new RelationshipRule(config);
}
