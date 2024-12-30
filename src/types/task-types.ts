/**
 * Task type definitions and validation
 */
export enum TaskType {
  TASK = 'TASK',
  MILESTONE = 'MILESTONE',
}

/**
 * Task type hierarchy rules
 */
export interface TaskTypeRules {
  canContainTasks: boolean;
  maxChildren: number;
  description: string;
}

/**
 * Task type configuration
 */
export const TASK_TYPE_RULES: Record<TaskType, TaskTypeRules> = {
  [TaskType.MILESTONE]: {
    canContainTasks: true,
    maxChildren: 100,
    description:
      'Container for organizing related tasks, represents major project phases or deliverables',
  },
  [TaskType.TASK]: {
    canContainTasks: false,
    maxChildren: 0,
    description: 'Atomic unit of work that cannot contain subtasks',
  },
};

/**
 * Validates parent-child relationship between task types
 */
export function validateTaskHierarchy(
  parentType: TaskType,
  childType: TaskType
): { isValid: boolean; error?: string } {
  // Only MILESTONE can contain tasks
  if (parentType === TaskType.TASK) {
    return {
      isValid: false,
      error: 'TASK type cannot contain subtasks',
    };
  }

  // MILESTONE can only contain TASK
  if (parentType === TaskType.MILESTONE && childType !== TaskType.TASK) {
    return {
      isValid: false,
      error: 'MILESTONE can only contain TASK types',
    };
  }

  return { isValid: true };
}

/**
 * Checks if a task type can have children
 */
export function canHaveChildren(type: TaskType): boolean {
  return TASK_TYPE_RULES[type].canContainTasks;
}

/**
 * Gets maximum allowed children for a task type
 */
export function getMaxChildren(type: TaskType): number {
  return TASK_TYPE_RULES[type].maxChildren;
}

/**
 * Gets human-readable description of a task type
 */
export function getTaskTypeDescription(type: TaskType): string {
  return TASK_TYPE_RULES[type].description;
}
