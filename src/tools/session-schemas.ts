/**
 * Session and Task List Management Schemas
 * Defines schemas for managing work sessions and task organization
 */

/** Creates a new task list in the current session. IMPORTANT: Requires an active session - use create_session first if you haven't already. Task lists organize related tasks and provide structure for task management. */
export const createTaskListSchema = {
    type: 'object',
    properties: {
        name: {
            type: 'string',
            description: 'Name of the task list. Best practice: Use descriptive names that reflect the purpose or theme (e.g., "Q1 Feature Development", "Security Improvements").',
        },
        description: {
            type: 'string',
            description: 'Description of the task list. Best practice: Include goals, success criteria, and any relevant timelines or constraints.',
        },
        metadata: {
            type: 'object',
            properties: {
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Tags for categorizing the task list. Best practice: Use consistent prefixes (e.g., "project:", "team:", "quarter:") for better organization.',
                },
                context: {
                    type: 'string',
                    description: 'Additional context about the task list. Best practice: Include links to project documentation, milestones, or related resources.',
                }
            },
            description: 'Additional task list metadata. Best practice: Use for cross-referencing and organization.',
        },
        persistent: {
            type: 'boolean',
            description: 'Whether the task list should persist across sessions. Best practice: Use true for long-term projects, false for temporary task groupings.',
            default: true
        }
    },
    required: ['name'],
};

/** Switches to a different task list in the current session */
export const switchTaskListSchema = {
    type: 'object',
    properties: {
        taskListId: {
            type: 'string',
            description: 'ID of the task list to switch to. Best practice: Verify task list exists and contains active tasks before switching.',
        }
    },
    required: ['taskListId'],
};

/** Lists all task lists in the current session */
export const listTaskListsSchema = {
    type: 'object',
    properties: {
        includeArchived: {
            type: 'boolean',
            description: 'Whether to include archived task lists. Best practice: Use true when reviewing historical data or reactivating old projects.',
            default: false
        }
    }
};

/** Archives a task list */
export const archiveTaskListSchema = {
    type: 'object',
    properties: {
        taskListId: {
            type: 'string',
            description: 'ID of the task list to archive. Best practice: Ensure all tasks are completed or properly transferred before archiving.',
        }
    },
    required: ['taskListId'],
};

/** Creates a new session. IMPORTANT: This must be called first before any task operations can be performed. A session provides the required context for managing tasks and task lists. */
export const createSessionSchema = {
    type: 'object',
    properties: {
        name: {
            type: 'string',
            description: 'Name of the session. Best practice: Use descriptive names that include purpose and date (e.g., "Feature Development - March 2024").',
        },
        metadata: {
            type: 'object',
            properties: {
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Tags for categorizing the session. Best practice: Include project phase, team, and priority indicators.',
                },
                context: {
                    type: 'string',
                    description: 'Additional context about the session. Best practice: Document goals, participants, and key decisions made during the session.',
                }
            },
            description: 'Additional session metadata. Best practice: Use for tracking session objectives and outcomes.',
        }
    },
    required: ['name'],
};

/** Switches to a different session */
export const switchSessionSchema = {
    type: 'object',
    properties: {
        sessionId: {
            type: 'string',
            description: 'ID of the session to switch to. Best practice: Save any pending changes in current session before switching.',
        }
    },
    required: ['sessionId'],
};

/** Lists all available sessions */
export const listSessionsSchema = {
    type: 'object',
    properties: {
        includeArchived: {
            type: 'boolean',
            description: 'Whether to include archived sessions. Best practice: Use for auditing or reviewing historical work patterns.',
            default: false
        }
    }
};

/** Archives a session */
export const archiveSessionSchema = {
    type: 'object',
    properties: {
        sessionId: {
            type: 'string',
            description: 'ID of the session to archive. Best practice: Document session outcomes and ensure all task lists are properly resolved before archiving.'
        }
    },
    required: ['sessionId']
};

/**
 * Best Practices for Session Management:
 * 
 * 1. Session Organization:
 *    - Create sessions for focused work periods or project phases
 *    - Use consistent naming conventions for better tracking
 *    - Document session goals and outcomes
 * 
 * 2. Task List Management:
 *    - Group related tasks into logical task lists
 *    - Keep task lists focused and manageable
 *    - Use metadata and tags for easy filtering
 * 
 * 3. Archiving Strategy:
 *    - Archive completed sessions with proper documentation
 *    - Ensure all tasks are resolved before archiving
 *    - Use archiving for maintaining clean workspace
 * 
 * 4. Metadata Usage:
 *    - Use consistent tag prefixes
 *    - Include relevant links and context
 *    - Track important decisions and rationale
 * 
 * 5. Session Switching:
 *    - Save work before switching sessions
 *    - Verify task list status when switching
 *    - Maintain context between sessions
 */
