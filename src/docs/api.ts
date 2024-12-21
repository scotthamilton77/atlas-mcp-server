/**
 * API documentation module
 * Provides documentation for the task management API
 */

/**
 * API version
 */
export const API_VERSION = '1.0.0';

/**
 * API documentation sections
 */
export const API_SECTIONS = {
    TASKS: 'tasks',
    STORAGE: 'storage',
    LOGGING: 'logging'
} as const;

/**
 * API documentation
 */
export const API_DOCS = {
    [API_SECTIONS.TASKS]: {
        description: 'Task management operations',
        endpoints: {
            'POST /tasks': {
                description: 'Create a new task',
                parameters: {
                    path: 'Optional task path. Generated from name if not provided.',
                    name: 'Task name (required)',
                    description: 'Task description',
                    type: 'Task type (task, milestone, group)',
                    dependencies: 'List of task paths this task depends on',
                    metadata: 'LLM task metadata including reasoning, tools used, and resources accessed'
                }
            },
            'GET /tasks/{path}': {
                description: 'Get a task by path',
                parameters: {
                    path: 'Task path'
                }
            },
            'PUT /tasks/{path}': {
                description: 'Update a task',
                parameters: {
                    path: 'Task path',
                    updates: 'Task properties to update'
                }
            },
            'DELETE /tasks/{path}': {
                description: 'Delete a task',
                parameters: {
                    path: 'Task path'
                }
            },
            'GET /tasks/pattern/{pattern}': {
                description: 'Get tasks by path pattern',
                parameters: {
                    pattern: 'Path pattern to match'
                }
            },
            'GET /tasks/status/{status}': {
                description: 'Get tasks by status',
                parameters: {
                    status: 'Task status'
                }
            }
        }
    },
    [API_SECTIONS.STORAGE]: {
        description: 'Storage operations',
        endpoints: {
            'POST /storage/vacuum': {
                description: 'Vacuum storage to reclaim space',
                parameters: {}
            },
            'POST /storage/analyze': {
                description: 'Analyze storage for optimization',
                parameters: {}
            },
            'GET /storage/metrics': {
                description: 'Get storage metrics',
                parameters: {}
            }
        }
    },
    [API_SECTIONS.LOGGING]: {
        description: 'Logging operations',
        endpoints: {
            'GET /logs': {
                description: 'Query logs',
                parameters: {
                    from: 'Start timestamp',
                    to: 'End timestamp',
                    levels: 'Log levels to include',
                    search: 'Search text',
                    limit: 'Maximum number of entries',
                    offset: 'Number of entries to skip'
                }
            },
            'POST /logs/rotate': {
                description: 'Rotate log files',
                parameters: {}
            }
        }
    }
};

/**
 * API error codes
 */
export const API_ERROR_CODES = {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    NOT_FOUND: 'NOT_FOUND',
    ALREADY_EXISTS: 'ALREADY_EXISTS',
    INVALID_STATE: 'INVALID_STATE',
    INTERNAL_ERROR: 'INTERNAL_ERROR'
} as const;

/**
 * API error messages
 */
export const API_ERROR_MESSAGES = {
    [API_ERROR_CODES.VALIDATION_ERROR]: 'Validation failed',
    [API_ERROR_CODES.NOT_FOUND]: 'Resource not found',
    [API_ERROR_CODES.ALREADY_EXISTS]: 'Resource already exists',
    [API_ERROR_CODES.INVALID_STATE]: 'Invalid state for operation',
    [API_ERROR_CODES.INTERNAL_ERROR]: 'Internal server error'
} as const;

/**
 * API response format
 */
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: {
        code: keyof typeof API_ERROR_CODES;
        message: string;
        details?: unknown;
    };
    metadata: {
        timestamp: number;
        requestId: string;
    };
}
