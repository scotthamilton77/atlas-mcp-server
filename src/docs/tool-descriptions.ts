/**
 * Enhanced tool descriptions shown to client LLMs with improved documentation,
 * examples, and troubleshooting guidance
 */

export const toolDescriptions = {
    create_task: {
        name: "create_task",
        description: "IMPORTANT: Requires both an active session and task list (use create_session and create_task_list first). Creates a new task. Task hierarchy cannot exceed 5 levels deep.\n\nExample Usage:\n```json\n{\n  \"name\": \"Implement Navigation\",\n  \"parentId\": \"ROOT-session-001\",\n  \"type\": \"task\",\n  \"description\": \"Create responsive navigation component\"\n}\n```\n\nTroubleshooting:\n- If parentId is invalid, defaults to ROOT-{sessionId}\n- Verify parent task exists before creating child tasks\n- Keep hierarchy depth under 5 levels\n- Use proper task types (task, milestone, group)",
        parameters: {
            parentId: {
                description: "ID of the parent task, or null for root tasks. Format: either null, ROOT-{sessionId}, or valid task ID. Examples:\n- null (for root tasks)\n- ROOT-session-001 (for top-level tasks)\n- existing-task-id (for subtasks)\n\nBest practices:\n- Keep hierarchies shallow (max 5 levels)\n- Verify parent task exists\n- Use ROOT-{sessionId} for top-level tasks"
            },
            name: {
                description: "Name of the task (max 200 characters). Examples:\n- \"Implement User Authentication\"\n- \"Design System Setup\"\n- \"Performance Optimization\"\n\nBest practices:\n- Use clear, action-oriented names\n- Describe the outcome\n- Keep names concise but descriptive\n- Avoid generic terms like \"Update\" or \"Fix\"",
                required: true
            },
            description: {
                description: "Description of the task (max 2000 characters). Example:\n```markdown\n# Authentication System Implementation\n\n## Objectives\n- Secure user authentication\n- Password reset flow\n- Session management\n\n## Acceptance Criteria\n1. Users can sign up and login\n2. Password reset emails work\n3. Sessions expire after 24h\n```"
            },
            notes: {
                description: "Rich notes associated with the task. Examples:\n\nMarkdown note:\n```markdown\n## Implementation Notes\n- Using JWT for auth\n- Redis for session store\n- Rate limiting on auth endpoints\n```\n\nCode note:\n```typescript\ntype: 'code',\ncontent: 'function validatePassword(pwd: string): boolean {\n  return pwd.length >= 8;\n}',\nlanguage: 'typescript'\n```\n\nBest practices:\n- Use appropriate note types\n- Include relevant code examples\n- Keep notes focused and organized"
            },
            reasoning: {
                description: "Reasoning and decision-making documentation. Example:\n```json\n{\n  \"approach\": \"Using JWT with Redis for scalable auth\",\n  \"alternatives\": [\n    \"Session-based auth - Less scalable\",\n    \"OAuth only - More complex\"\n  ],\n  \"tradeoffs\": [\n    \"JWT size vs session lookup\",\n    \"Implementation complexity vs security\"\n  ]\n}\n```"
            },
            type: {
                description: "Type of task. Options:\n- milestone: Major project phases or deliverables\n- group: Organizational containers for related tasks\n- task: Concrete work items\n\nBest practices:\n- Use milestones for major phases\n- Use groups for logical organization\n- Use tasks for actionable items\n\nExample hierarchy:\n- Milestone: \"Q1 Development\"\n  - Group: \"Frontend Features\"\n    - Task: \"Implement Navigation\"\n    - Task: \"Build Contact Form\""
            },
            dependencies: {
                description: "List of task IDs this task depends on. Example:\n```json\n{\n  \"dependencies\": [\n    \"task-123\",  // Database setup\n    \"task-456\"   // API endpoints\n  ]\n}\n```\n\nBest practices:\n- Keep dependencies minimal\n- Document dependency rationale\n- Consider task ordering"
            },
            metadata: {
                description: "Additional task metadata. Example:\n```json\n{\n  \"context\": \"Part of authentication system\",\n  \"tags\": [\"security\", \"user-management\", \"backend\"],\n  \"priority\": \"high\",\n  \"estimated_hours\": 8\n}\n```"
            },
            subtasks: {
                description: "Nested subtasks for breaking down work items. Example:\n```json\n{\n  \"subtasks\": [\n    {\n      \"name\": \"Design Database Schema\",\n      \"type\": \"task\"\n    },\n    {\n      \"name\": \"Implement API Endpoints\",\n      \"type\": \"task\"\n    }\n  ]\n}\n```"
            }
        }
    },

    bulk_create_tasks: {
        name: "bulk_create_tasks",
        description: "IMPORTANT: Requires both an active session and task list (use create_session and create_task_list first). Creates multiple tasks at once. Limited to maximum 50 tasks per operation.\n\nExample Usage:\n```json\n{\n  \"parentId\": \"ROOT-session-001\",\n  \"tasks\": [\n    {\n      \"name\": \"Setup Development Environment\",\n      \"type\": \"task\"\n    },\n    {\n      \"name\": \"Initialize Project Structure\",\n      \"type\": \"task\"\n    }\n  ]\n}\n```\n\nTroubleshooting:\n- Maximum 50 tasks per operation\n- Break larger sets into multiple operations\n- Verify parent task exists\n- Keep hierarchy depth under 5 levels",
        parameters: {
            parentId: {
                description: "ID of the parent task. Example values:\n- null (for root tasks)\n- ROOT-session-001 (for top-level tasks)\n- existing-task-id (for subtasks)\n\nBest practices:\n- Use common parent for related tasks\n- Verify parent exists\n- Consider task organization"
            },
            tasks: {
                description: "Array of tasks to create (maximum 50). Example structure:\n```json\n[\n  {\n    \"name\": \"Task 1\",\n    \"type\": \"task\",\n    \"description\": \"Description 1\"\n  },\n  {\n    \"name\": \"Task 2\",\n    \"type\": \"task\",\n    \"description\": \"Description 2\"\n  }\n]\n```",
                required: true
            }
        }
    },

    update_task: {
        name: "update_task",
        description: "IMPORTANT: Requires an active session. Updates an existing task.\n\nExample Usage:\n```json\n{\n  \"taskId\": \"task-123\",\n  \"updates\": {\n    \"name\": \"Updated Task Name\",\n    \"status\": \"in_progress\",\n    \"description\": \"Updated description\"\n  }\n}\n```\n\nTroubleshooting:\n- Verify task exists before updating\n- Cannot update completed tasks with dependencies\n- Maintain proper task relationships",
        parameters: {
            taskId: {
                description: "ID of the task to update. Must be an existing task ID.",
                required: true
            },
            updates: {
                description: "Updates to apply to the task. Example:\n```json\n{\n  \"name\": \"New Name\",\n  \"status\": \"in_progress\",\n  \"description\": \"Updated description\",\n  \"metadata\": {\n    \"priority\": \"high\"\n  }\n}\n```",
                required: true
            }
        }
    },

    bulk_update_tasks: {
        name: "bulk_update_tasks",
        description: "IMPORTANT: Requires an active session. Updates multiple tasks at once. Limited to maximum 50 tasks per operation.\n\nExample Usage:\n```json\n{\n  \"updates\": [\n    {\n      \"taskId\": \"task-123\",\n      \"updates\": { \"status\": \"completed\" }\n    },\n    {\n      \"taskId\": \"task-456\",\n      \"updates\": { \"status\": \"in_progress\" }\n    }\n  ]\n}\n```",
        parameters: {
            updates: {
                description: "Array of updates (maximum 50 tasks). Example structure:\n```json\n[\n  {\n    \"taskId\": \"task-1\",\n    \"updates\": { \"status\": \"completed\" }\n  },\n  {\n    \"taskId\": \"task-2\",\n    \"updates\": { \"status\": \"in_progress\" }\n  }\n]\n```",
                required: true
            }
        }
    },

    get_tasks_by_status: {
        name: "get_tasks_by_status",
        description: "IMPORTANT: Requires an active session. Retrieves tasks filtered by status.\n\nExample Usage:\n```json\n{\n  \"status\": \"in_progress\"\n}\n```",
        parameters: {
            status: {
                description: "Status filter. Valid values:\n- pending\n- in_progress\n- completed\n- failed\n- blocked",
                required: true
            }
        }
    },

    delete_task: {
        name: "delete_task",
        description: "IMPORTANT: Requires an active session. Deletes a task.\n\nExample Usage:\n```json\n{\n  \"taskId\": \"task-123\"\n}\n```\n\nTroubleshooting:\n- Check for dependent tasks first\n- Cannot delete tasks with dependencies\n- Consider archiving instead of deletion",
        parameters: {
            taskId: {
                description: "Task ID to delete. Verify no dependent tasks exist.",
                required: true
            }
        }
    },

    get_subtasks: {
        name: "get_subtasks",
        description: "IMPORTANT: Requires an active session. Retrieves subtasks of a task.\n\nExample Usage:\n```json\n{\n  \"taskId\": \"task-123\"\n}\n```",
        parameters: {
            taskId: {
                description: "Parent task ID to get subtasks for.",
                required: true
            }
        }
    },

    get_task_tree: {
        name: "get_task_tree",
        description: "IMPORTANT: Requires an active session. Retrieves the complete task hierarchy.\n\nExample Usage:\n```json\n{}\n```\n\nBest practices:\n- Use regularly to monitor task structure\n- Verify task relationships\n- Check for orphaned tasks",
        parameters: {}
    },

    create_session: {
        name: "create_session",
        description: "IMPORTANT: This must be called first before any task operations can be performed.\n\nExample Usage:\n```json\n{\n  \"name\": \"Q1 Development - March 2024\",\n  \"metadata\": {\n    \"project\": \"Portfolio Website\",\n    \"team\": \"Frontend\"\n  }\n}\n```",
        parameters: {
            name: {
                description: "Name of the session. Example formats:\n- \"Q1 Development - March 2024\"\n- \"Feature Sprint - Authentication\"\n- \"Bug Fix Session - UI Issues\"",
                required: true
            },
            metadata: {
                description: "Additional session metadata. Example:\n```json\n{\n  \"project\": \"Portfolio Website\",\n  \"team\": \"Frontend\",\n  \"sprint\": \"Sprint 23\"\n}\n```"
            }
        }
    },

    create_task_list: {
        name: "create_task_list",
        description: "IMPORTANT: Requires an active session (use create_session first). Creates a new task list.\n\nExample Usage:\n```json\n{\n  \"name\": \"Q1 Feature Development\",\n  \"description\": \"Q1 2024 feature implementation tasks\",\n  \"persistent\": true\n}\n```",
        parameters: {
            name: {
                description: "Name of the task list. Examples:\n- \"Q1 Feature Development\"\n- \"Bug Fix Backlog\"\n- \"Technical Debt Items\"",
                required: true
            },
            description: {
                description: "Description of the task list. Example:\n```markdown\n# Q1 Feature Development\n\n## Goals\n- Implement core features\n- Improve performance\n- Fix critical bugs\n\n## Timeline\nJan - March 2024\n```"
            },
            metadata: {
                description: "Additional task list metadata. Example:\n```json\n{\n  \"quarter\": \"Q1-2024\",\n  \"priority\": \"high\",\n  \"team\": \"frontend\"\n}\n```"
            },
            persistent: {
                description: "Whether the task list should persist across sessions. Use:\n- true: Long-term projects\n- false: Temporary task groups"
            }
        }
    },

    switch_session: {
        name: "switch_session",
        description: "Switches to a different session.\n\nExample Usage:\n```json\n{\n  \"sessionId\": \"session-123\"\n}\n```",
        parameters: {
            sessionId: {
                description: "ID of the session to switch to. Save pending changes first.",
                required: true
            }
        }
    },

    switch_task_list: {
        name: "switch_task_list",
        description: "IMPORTANT: Requires an active session. Switches to a different task list.\n\nExample Usage:\n```json\n{\n  \"taskListId\": \"list-123\"\n}\n```",
        parameters: {
            taskListId: {
                description: "ID of the task list to switch to. Verify it exists first.",
                required: true
            }
        }
    },

    list_sessions: {
        name: "list_sessions",
        description: "Lists all available sessions.\n\nExample Usage:\n```json\n{\n  \"includeArchived\": false\n}\n```",
        parameters: {
            includeArchived: {
                description: "Whether to include archived sessions. Default: false"
            }
        }
    },

    list_task_lists: {
        name: "list_task_lists",
        description: "IMPORTANT: Requires an active session. Lists all task lists.\n\nExample Usage:\n```json\n{\n  \"includeArchived\": false\n}\n```",
        parameters: {
            includeArchived: {
                description: "Whether to include archived task lists. Default: false"
            }
        }
    },

    archive_session: {
        name: "archive_session",
        description: "Archives a session.\n\nExample Usage:\n```json\n{\n  \"sessionId\": \"session-123\"\n}\n```",
        parameters: {
            sessionId: {
                description: "ID of the session to archive. Document outcomes first.",
                required: true
            }
        }
    },

    archive_task_list: {
        name: "archive_task_list",
        description: "IMPORTANT: Requires an active session. Archives a task list.\n\nExample Usage:\n```json\n{\n  \"taskListId\": \"list-123\"\n}\n```",
        parameters: {
            taskListId: {
                description: "ID of the task list to archive. Complete or transfer tasks first.",
                required: true
            }
        }
    }
};
