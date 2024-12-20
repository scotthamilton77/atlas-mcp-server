/**
 * Atlas MCP Server API Documentation
 * @module api
 * 
 * This module provides comprehensive documentation for the Atlas MCP Server's public API.
 * It includes interfaces, tools, error codes, configuration options, and best practices.
 */

import {
    Task,
    CreateTaskInput,
    UpdateTaskInput,
    TaskResponse,
    TaskType,
    TaskStatus
} from '../types/task.js';
import {
    Session,
    TaskList,
    CreateSessionInput,
    CreateTaskListInput,
    SessionResponse,
    TaskListResponse
} from '../types/session.js';

/**
 * Task Management API
 * @namespace TaskAPI
 */

/**
 * Creates a new task in the system
 * 
 * @param parentId - ID of the parent task, or null for root tasks
 * @param input - Task creation input
 * @returns Promise resolving to the created task
 * @throws {TaskError} If task creation fails
 * @throws {ValidationError} If input validation fails
 * 
 * Best Practices:
 * - Use clear, action-oriented task names
 * - Keep task hierarchies shallow (3-4 levels max)
 * - Document assumptions and dependencies
 * - Include acceptance criteria in descriptions
 * 
 * @example
 * ```typescript
 * const task = await createTask(null, {
 *   name: "Implement User Authentication",
 *   description: "Add OAuth2 authentication with role-based access control",
 *   type: "task",
 *   notes: [{
 *     type: "markdown",
 *     content: "## Acceptance Criteria\n- Support Google OAuth\n- Role management UI\n- JWT implementation"
 *   }]
 * });
 * ```
 */
export interface CreateTask {
    (parentId: string | null, input: CreateTaskInput): Promise<TaskResponse<Task>>;
}

/**
 * Updates an existing task
 * 
 * @param taskId - ID of the task to update
 * @param updates - Task update input
 * @returns Promise resolving to the updated task
 * @throws {TaskError} If task update fails
 * @throws {ValidationError} If update validation fails
 * 
 * Best Practices:
 * - Document reasons for status changes
 * - Update dependencies when blocking issues arise
 * - Maintain consistent metadata across updates
 * - Append rather than replace existing notes
 * 
 * @example
 * ```typescript
 * const updatedTask = await updateTask("task-id", {
 *   status: "in_progress",
 *   notes: [{
 *     type: "markdown",
 *     content: "Started implementation with Google OAuth integration"
 *   }],
 *   metadata: {
 *     tags: ["feature", "security", "in-sprint"]
 *   }
 * });
 * ```
 */
export interface UpdateTask {
    (taskId: string, updates: UpdateTaskInput): Promise<TaskResponse<Task>>;
}

/**
 * Session Management API
 * @namespace SessionAPI
 */

/**
 * Creates a new session
 * 
 * Best Practices:
 * - Use descriptive session names with dates
 * - Document session goals and participants
 * - Use consistent tag prefixes
 * - Include relevant project context
 * 
 * @example
 * ```typescript
 * const session = await createSession({
 *   name: "Sprint Planning - March 2024",
 *   metadata: {
 *     tags: ["sprint:2024-03", "team:backend"],
 *     context: "Q1 Feature Development"
 *   }
 * });
 * ```
 */
export interface CreateSession {
    (input: CreateSessionInput): Promise<SessionResponse>;
}

/**
 * Creates a new task list
 * 
 * Best Practices:
 * - Group related tasks logically
 * - Use clear, thematic names
 * - Document success criteria
 * - Consider persistence needs
 * 
 * @example
 * ```typescript
 * const taskList = await createTaskList({
 *   name: "Authentication System Overhaul",
 *   description: "Modernize auth system with OAuth2 and RBAC",
 *   persistent: true,
 *   metadata: {
 *     tags: ["project:auth", "quarter:Q1"],
 *     context: "Security Enhancement Initiative"
 *   }
 * });
 * ```
 */
export interface CreateTaskList {
    (input: CreateTaskListInput): Promise<TaskListResponse>;
}

/**
 * Tool Schemas
 * @namespace Tools
 */

/**
 * Create Task Tool
 * 
 * Creates a new task with optional subtasks and dependencies.
 * 
 * @remarks
 * This tool supports:
 * - Task hierarchy through parentId (recommended max depth: 3-4 levels)
 * - Rich documentation with multiple note types
 * - Comprehensive metadata and tagging
 * - Dependency management
 * 
 * Best Practices:
 * - Use clear, action-oriented task names
 * - Document assumptions and constraints
 * - Include acceptance criteria
 * - Maintain consistent metadata
 * - Use appropriate task types
 * 
 * @example
 * ```typescript
 * const response = await handleToolCall("create_task", {
 *   name: "Implement OAuth2 Authentication",
 *   type: "task",
 *   description: "Add secure authentication using OAuth2 protocol",
 *   notes: [{
 *     type: "markdown",
 *     content: "## Acceptance Criteria\n- Google OAuth support\n- Secure token handling"
 *   }],
 *   metadata: {
 *     tags: ["feature:auth", "priority:high"],
 *     context: "Security Enhancement Initiative"
 *   }
 * });
 * ```
 */
export const CREATE_TASK_SCHEMA = {
    name: "create_task",
    description: "Creates a new task with comprehensive documentation and organization features",
    inputSchema: {
        type: "object",
        properties: {
            parentId: {
                type: ["string", "null"],
                description: "ID of parent task. Best practice: Keep hierarchy depth to 3-4 levels for maintainability"
            },
            name: {
                type: "string",
                description: "Task name. Best practice: Use clear, action-oriented names describing the outcome"
            },
            description: {
                type: "string",
                description: "Task description. Best practice: Include context, acceptance criteria, and technical considerations"
            },
            type: {
                type: "string",
                enum: ["task", "milestone", "group"],
                description: "Task type. Best practice: Use appropriate types for better organization"
            }
        },
        required: ["name"]
    }
};

/**
 * Error Codes
 * @namespace Errors
 */

/**
 * Task Error Codes
 * 
 * @remarks
 * These error codes are used for task-related operations:
 * 
 * - TASK_NOT_FOUND: Task with specified ID does not exist
 * - TASK_VALIDATION: Task data validation failed
 * - TASK_DEPENDENCY: Invalid task dependency
 * - TASK_STATUS: Invalid status transition
 * - TASK_DUPLICATE: Task with same name exists
 * - TASK_INVALID_TYPE: Invalid task type
 * - TASK_INVALID_STATUS: Invalid status value
 * - TASK_INVALID_PARENT: Invalid parent task
 * 
 * Best Practices for Error Handling:
 * - Validate task existence before operations
 * - Check dependency cycles
 * - Verify status transitions
 * - Handle concurrent modifications
 */
export const TASK_ERROR_CODES = {
    /** Task not found */
    TASK_NOT_FOUND: {
        code: "TASK_NOT_FOUND",
        message: "Task not found",
        recovery: "Verify the task ID exists and you have access permissions"
    },
    /** Task validation failed */
    TASK_VALIDATION: {
        code: "TASK_VALIDATION",
        message: "Task validation failed",
        recovery: "Check input data against schema and best practices"
    }
    // ... other task error codes
};

/**
 * Storage Error Codes
 * 
 * @remarks
 * These error codes are used for storage operations:
 * 
 * - STORAGE_READ: Failed to read from storage
 * - STORAGE_WRITE: Failed to write to storage
 * - STORAGE_INIT: Storage initialization failed
 * - STORAGE_DELETE: Failed to delete from storage
 * - STORAGE_PERMISSION: Permission denied
 * - STORAGE_NOT_FOUND: Storage path not found
 * 
 * Best Practices for Storage:
 * - Implement proper error recovery
 * - Use appropriate retry strategies
 * - Maintain data consistency
 * - Handle concurrent access
 */
export const STORAGE_ERROR_CODES = {
    /** Storage read failed */
    STORAGE_READ: {
        code: "STORAGE_READ",
        message: "Failed to read from storage",
        recovery: "Check storage permissions, path, and connection status"
    }
    // ... other storage error codes
};

/**
 * Configuration Options
 * @namespace Config
 */

/**
 * Server Configuration
 * 
 * @remarks
 * Configuration options for the server:
 * 
 * ```typescript
 * interface ServerConfig {
 *   name: string;      // Server name
 *   version: string;   // Server version
 *   host: string;      // Server host
 *   port: number;      // Server port
 * }
 * ```
 * 
 * Best Practices:
 * - Use semantic versioning
 * - Configure appropriate timeouts
 * - Enable security features
 * - Set up proper logging
 * 
 * @example
 * ```typescript
 * const config = {
 *   server: {
 *     name: "atlas-mcp-server",
 *     version: "1.0.0",
 *     host: "localhost",
 *     port: 3000
 *   }
 * };
 * ```
 */
export const SERVER_CONFIG = {
    /** Server configuration schema */
    schema: {
        type: "object",
        properties: {
            name: {
                type: "string",
                description: "Server name. Best practice: Use descriptive, consistent naming"
            },
            version: {
                type: "string",
                description: "Server version. Best practice: Follow semantic versioning"
            },
            host: {
                type: "string",
                description: "Server host. Best practice: Use environment-specific configuration"
            },
            port: {
                type: "number",
                description: "Server port. Best practice: Use standard ports or environment variables"
            }
        },
        required: ["name", "version", "host", "port"]
    },
    /** Default server configuration */
    defaults: {
        name: "atlas-mcp-server",
        version: "0.1.0",
        host: "localhost",
        port: 3000
    }
};

/**
 * Storage Configuration
 * 
 * @remarks
 * Configuration options for storage:
 * 
 * ```typescript
 * interface StorageConfig {
 *   baseDir: string;           // Base storage directory
 *   maxSessions: number;       // Maximum sessions to keep
 *   sessionTTL: number;        // Session time-to-live
 *   backupEnabled: boolean;    // Enable backups
 *   maxBackups: number;        // Maximum backups to keep
 * }
 * ```
 * 
 * Best Practices:
 * - Configure appropriate backup intervals
 * - Set reasonable retention policies
 * - Use absolute paths
 * - Enable WAL mode for better concurrency
 * 
 * @example
 * ```typescript
 * const config = {
 *   storage: {
 *     baseDir: "/var/lib/atlas-mcp",
 *     maxSessions: 100,
 *     sessionTTL: 86400,
 *     backupEnabled: true,
 *     maxBackups: 5
 *   }
 * };
 * ```
 */
export const STORAGE_CONFIG = {
    /** Storage configuration schema */
    schema: {
        type: "object",
        properties: {
            baseDir: {
                type: "string",
                description: "Base storage directory. Best practice: Use absolute paths"
            },
            maxSessions: {
                type: "number",
                description: "Maximum sessions. Best practice: Balance resource usage"
            },
            sessionTTL: {
                type: "number",
                description: "Session TTL in seconds. Best practice: Set appropriate expiration"
            },
            backupEnabled: {
                type: "boolean",
                description: "Enable backups. Best practice: Enable for production"
            },
            maxBackups: {
                type: "number",
                description: "Maximum backups. Best practice: Consider storage capacity"
            }
        },
        required: ["baseDir"]
    },
    /** Default storage configuration */
    defaults: {
        maxSessions: 100,
        sessionTTL: 86400,
        backupEnabled: true,
        maxBackups: 5
    }
};

/**
 * Logging Configuration
 * 
 * @remarks
 * Configuration options for logging:
 * 
 * ```typescript
 * interface LoggingConfig {
 *   level: LogLevel;          // Minimum log level
 *   logDir?: string;         // Log directory
 *   console: boolean;        // Console logging
 *   file: boolean;          // File logging
 *   maxFiles: number;       // Maximum log files
 *   maxFileSize: number;    // Maximum file size
 * }
 * ```
 * 
 * Best Practices:
 * - Use appropriate log levels
 * - Implement log rotation
 * - Include contextual information
 * - Configure proper file permissions
 * 
 * @example
 * ```typescript
 * const config = {
 *   logging: {
 *     level: "INFO",
 *     logDir: "/var/log/atlas-mcp",
 *     console: true,
 *     file: true,
 *     maxFiles: 5,
 *     maxFileSize: 10485760
 *   }
 * };
 * ```
 */
export const LOGGING_CONFIG = {
    /** Logging configuration schema */
    schema: {
        type: "object",
        properties: {
            level: {
                type: "string",
                enum: ["DEBUG", "INFO", "WARN", "ERROR", "FATAL"],
                description: "Minimum log level. Best practice: Use INFO for production"
            },
            logDir: {
                type: "string",
                description: "Log directory path. Best practice: Use absolute paths"
            },
            console: {
                type: "boolean",
                description: "Enable console logging. Best practice: Enable for development"
            },
            file: {
                type: "boolean",
                description: "Enable file logging. Best practice: Enable for production"
            },
            maxFiles: {
                type: "number",
                description: "Maximum log files. Best practice: Configure rotation policy"
            },
            maxFileSize: {
                type: "number",
                description: "Maximum file size in bytes. Best practice: Consider disk space"
            }
        },
        required: ["level"]
    },
    /** Default logging configuration */
    defaults: {
        level: "INFO",
        console: true,
        file: true,
        maxFiles: 5,
        maxFileSize: 10 * 1024 * 1024 // 10MB
    }
};

/**
 * Security Configuration
 * 
 * @remarks
 * Configuration options for security:
 * 
 * ```typescript
 * interface SecurityConfig {
 *   sessionSecret: string;    // Session encryption secret
 *   rateLimiting: {
 *     enabled: boolean;      // Enable rate limiting
 *     maxRequests: number;   // Max requests per window
 *     windowMs: number;      // Time window in ms
 *   }
 * }
 * ```
 * 
 * Best Practices:
 * - Use strong session secrets
 * - Enable rate limiting
 * - Configure appropriate timeouts
 * - Implement proper access controls
 * 
 * @example
 * ```typescript
 * const config = {
 *   security: {
 *     sessionSecret: process.env.SESSION_SECRET,
 *     rateLimiting: {
 *       enabled: true,
 *       maxRequests: 100,
 *       windowMs: 60000
 *     }
 *   }
 * };
 * ```
 */
export const SECURITY_CONFIG = {
    /** Security configuration schema */
    schema: {
        type: "object",
        properties: {
            sessionSecret: {
                type: "string",
                description: "Session encryption secret. Best practice: Use environment variables"
            },
            rateLimiting: {
                type: "object",
                properties: {
                    enabled: {
                        type: "boolean",
                        description: "Enable rate limiting. Best practice: Enable in production"
                    },
                    maxRequests: {
                        type: "number",
                        description: "Maximum requests per window. Best practice: Tune based on usage"
                    },
                    windowMs: {
                        type: "number",
                        description: "Time window in milliseconds. Best practice: Balance security and usability"
                    }
                },
                required: ["enabled", "maxRequests", "windowMs"]
            }
        },
        required: ["sessionSecret"]
    },
    /** Default security configuration */
    defaults: {
        rateLimiting: {
            enabled: true,
            maxRequests: 100,
            windowMs: 60000
        }
    }
};
