/**
 * Tool descriptions shown to client LLMs
 */

export const toolDescriptions = {
    create_task: {
        name: "create_task",
        description: "IMPORTANT: Requires both an active session and task list (use create_session and create_task_list first). Creates a new task",
        parameters: {
            parentId: {
                description: "ID of the parent task, or null for root tasks. Use this for creating hierarchical task structures. Best practice: Keep hierarchies shallow (max 3-4 levels) for better maintainability."
            },
            name: {
                description: "Name of the task (max 200 characters). Best practice: Use clear, action-oriented names that describe the outcome (e.g., \"Implement user authentication\" rather than \"Auth work\").",
                required: true
            },
            description: {
                description: "Description of the task (max 2000 characters). Best practice: Include context, acceptance criteria, and any technical considerations. Use markdown for better formatting."
            },
            notes: {
                description: "Rich notes associated with the task. Best practice: Use a combination of note types - markdown for documentation, code for examples, and JSON for structured data."
            },
            reasoning: {
                description: "Reasoning and decision-making documentation. Best practice: Keep this documentation up-to-date as decisions evolve."
            },
            type: {
                description: "Type of task. Best practice: Use \"milestone\" for major deliverables, \"group\" for organizing related tasks, and \"task\" for concrete work items."
            },
            dependencies: {
                description: "List of task IDs this task depends on. Best practice: Keep dependencies minimal and explicit. Consider using task groups for better organization."
            },
            metadata: {
                description: "Additional task metadata. Best practice: Use for cross-cutting concerns and categorization."
            },
            subtasks: {
                description: "Nested subtasks for breaking down work items."
            }
        }
    },

    bulk_create_tasks: {
        name: "bulk_create_tasks",
        description: "IMPORTANT: Requires both an active session and task list (use create_session and create_task_list first). Creates multiple tasks at once",
        parameters: {
            parentId: {
                description: "ID of the parent task. Best practice: Use for creating related tasks under a common parent."
            },
            tasks: {
                description: "Array of tasks to create. Best practice: Group related tasks together and maintain consistent structure.",
                required: true
            }
        }
    },

    update_task: {
        name: "update_task",
        description: "IMPORTANT: Requires an active session. Updates an existing task",
        parameters: {
            taskId: {
                description: "ID of the task to update. Best practice: Verify task exists before updating.",
                required: true
            },
            updates: {
                description: "Updates to apply to the task.",
                required: true
            }
        }
    },

    bulk_update_tasks: {
        name: "bulk_update_tasks",
        description: "IMPORTANT: Requires an active session. Updates multiple tasks at once",
        parameters: {
            updates: {
                description: "Array of updates. Best practice: Group related updates together and consider dependency order.",
                required: true
            }
        }
    },

    get_tasks_by_status: {
        name: "get_tasks_by_status",
        description: "IMPORTANT: Requires an active session. Retrieves tasks filtered by status",
        parameters: {
            status: {
                description: "Status filter. Best practice: Use for progress tracking and identifying bottlenecks.",
                required: true
            }
        }
    },

    delete_task: {
        name: "delete_task",
        description: "IMPORTANT: Requires an active session. Deletes a task",
        parameters: {
            taskId: {
                description: "Task ID to delete. Best practice: Check for dependent tasks before deletion.",
                required: true
            }
        }
    },

    get_subtasks: {
        name: "get_subtasks",
        description: "IMPORTANT: Requires an active session. Retrieves subtasks of a task",
        parameters: {
            taskId: {
                description: "Parent task ID. Best practice: Use for progress tracking and dependency management.",
                required: true
            }
        }
    },

    get_task_tree: {
        name: "get_task_tree",
        description: "IMPORTANT: Requires an active session. Retrieves the complete task hierarchy. Best practice: Use frequently to maintain awareness of all tasks, their relationships, and current progress. Regular checks help keep the full task context fresh in memory and ensure proper task management."
    },

    create_session: {
        name: "create_session",
        description: "IMPORTANT: This must be called first before any task operations can be performed. Creates a new session to provide the required context for managing tasks and task lists",
        parameters: {
            name: {
                description: "Name of the session. Best practice: Use descriptive names that include purpose and date (e.g., \"Feature Development - March 2024\").",
                required: true
            },
            metadata: {
                description: "Additional session metadata. Best practice: Use for tracking session objectives and outcomes."
            }
        }
    },

    create_task_list: {
        name: "create_task_list",
        description: "IMPORTANT: Requires an active session (use create_session first). Creates a new task list in the current session",
        parameters: {
            name: {
                description: "Name of the task list. Best practice: Use descriptive names that reflect the purpose or theme (e.g., \"Q1 Feature Development\", \"Security Improvements\").",
                required: true
            },
            description: {
                description: "Description of the task list. Best practice: Include goals, success criteria, and any relevant timelines or constraints."
            },
            metadata: {
                description: "Additional task list metadata. Best practice: Use for cross-referencing and organization."
            },
            persistent: {
                description: "Whether the task list should persist across sessions. Best practice: Use true for long-term projects, false for temporary task groupings."
            }
        }
    },

    switch_session: {
        name: "switch_session",
        description: "Switches to a different session",
        parameters: {
            sessionId: {
                description: "ID of the session to switch to. Best practice: Save any pending changes in current session before switching.",
                required: true
            }
        }
    },

    switch_task_list: {
        name: "switch_task_list",
        description: "IMPORTANT: Requires an active session. Switches to a different task list in the current session",
        parameters: {
            taskListId: {
                description: "ID of the task list to switch to. Best practice: Verify task list exists and contains active tasks before switching.",
                required: true
            }
        }
    },

    list_sessions: {
        name: "list_sessions",
        description: "Lists all available sessions",
        parameters: {
            includeArchived: {
                description: "Whether to include archived sessions. Best practice: Use for auditing or reviewing historical work patterns."
            }
        }
    },

    list_task_lists: {
        name: "list_task_lists",
        description: "IMPORTANT: Requires an active session. Lists all task lists in the current session",
        parameters: {
            includeArchived: {
                description: "Whether to include archived task lists. Best practice: Use true when reviewing historical data or reactivating old projects."
            }
        }
    },

    archive_session: {
        name: "archive_session",
        description: "Archives a session",
        parameters: {
            sessionId: {
                description: "ID of the session to archive. Best practice: Document session outcomes and ensure all task lists are properly resolved before archiving.",
                required: true
            }
        }
    },

    archive_task_list: {
        name: "archive_task_list",
        description: "IMPORTANT: Requires an active session. Archives a task list",
        parameters: {
            taskListId: {
                description: "ID of the task list to archive. Best practice: Ensure all tasks are completed or properly transferred before archiving.",
                required: true
            }
        }
    }
};
