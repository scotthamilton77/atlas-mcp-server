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
 * Dependency rule configuration
 */
export interface DependencyRuleConfig {
    validateCircular: boolean;
    maxDepth: number;
    allowMissing: boolean;
}

/**
 * Default dependency rule configuration
 */
export const DEFAULT_DEPENDENCY_RULE_CONFIG: DependencyRuleConfig = {
    validateCircular: true,
    maxDepth: 10,
    allowMissing: false
};

/**
 * Dependency validation rule
 */
export class DependencyRule extends AbstractBusinessRule<Task, TaskValidationError> {
    private readonly logger: Logger;
    private readonly config: DependencyRuleConfig;

    constructor(config: Partial<DependencyRuleConfig> = {}) {
        super();
        this.config = { ...DEFAULT_DEPENDENCY_RULE_CONFIG, ...config };
        this.logger = Logger.getInstance().child({ component: 'DependencyRule' });
    }

    /**
     * Validate task dependencies
     */
    async validate(
        task: Task,
        context: ValidationContext
    ): Promise<ValidationResult<TaskValidationError>> {
        try {
            const errors: TaskValidationError[] = [];
            const { dependencies } = task;

            // Skip validation if no dependencies
            if (!dependencies?.length) {
                return createValidationResult(errors);
            }

            // Get shared task map
            const taskMap = (context.shared?.get('tasks') as Map<string, Task>) ?? new Map();

            // Validate each dependency
            for (const dependencyId of dependencies) {
                // Check dependency exists
                const dependency = taskMap.get(dependencyId);
                if (!dependency && !this.config.allowMissing) {
                    errors.push(
                        this.createError(
                            ValidationErrorCodes.INVALID_REFERENCE,
                            `Dependency not found: ${dependencyId}`,
                            ['dependencies'],
                            task,
                            { dependencyId }
                        )
                    );
                    continue;
                }

                // Check circular dependencies
                if (this.config.validateCircular && dependency) {
                    const visited = new Set<string>();
                    if (this.hasCircularDependency(task.id, dependency, taskMap, visited)) {
                        errors.push(
                            this.createError(
                                ValidationErrorCodes.INVALID_REFERENCE,
                                `Circular dependency detected: ${task.id} -> ${dependencyId}`,
                                ['dependencies'],
                                task,
                                { dependencyId, visited: Array.from(visited) }
                            )
                        );
                    }
                }

                // Check dependency status
                if (dependency?.status === 'failed') {
                    errors.push(
                        this.createError(
                            ValidationErrorCodes.INVALID_STATE,
                            `Dependency failed: ${dependencyId}`,
                            ['dependencies'],
                            task,
                            { dependencyId, status: dependency.status }
                        )
                    );
                }
            }

            return createValidationResult(errors);
        } catch (error) {
            this.logger.error('Dependency validation failed', { error, task });
            throw this.createError(
                ValidationErrorCodes.RUNTIME_ERROR,
                'Dependency validation failed',
                [],
                task,
                { error: error instanceof Error ? error.message : String(error) }
            );
        }
    }

    /**
     * Check for circular dependencies
     */
    private hasCircularDependency(
        startId: string,
        current: Task,
        taskMap: Map<string, Task>,
        visited: Set<string>
    ): boolean {
        // Check max depth
        if (visited.size >= this.config.maxDepth) {
            return false;
        }

        // Check if we've found a cycle
        if (visited.has(current.id)) {
            return current.id === startId;
        }

        // Mark current task as visited
        visited.add(current.id);

        // Check dependencies recursively
        const { dependencies = [] } = current;
        for (const dependencyId of dependencies) {
            const dependency = taskMap.get(dependencyId);
            if (dependency && this.hasCircularDependency(startId, dependency, taskMap, visited)) {
                return true;
            }
        }

        // Remove current task from visited set
        visited.delete(current.id);
        return false;
    }
}

/**
 * Create dependency rule instance
 */
export function createDependencyRule(
    config?: Partial<DependencyRuleConfig>
): DependencyRule {
    return new DependencyRule(config);
}
