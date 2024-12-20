/**
 * Atlas MCP Server API Documentation
 * @module api
 * 
 * This module provides comprehensive documentation for the Atlas MCP Server's public API.
 * It includes interfaces, tools, error codes, and configuration options.
 */

import {
    Task,
    CreateTaskInput,
    UpdateTaskInput,
    TaskResponse,
    TaskType,
    TaskStatus
} from '../types/task.js';

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
 * @example
 * ```typescript
 * const task = await createTask(null, {
 *   name: "My Task",
 *   description: "Task description",
 *   type: "task"
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
 * @example
 * ```typescript
 * const updatedTask = await updateTask("task-id", {
 *   status: "in_progress",
 *   description: "Updated description"
 * });
 * ```
 */
export interface UpdateTask {
    (taskId: string, updates: UpdateTaskInput): Promise<TaskResponse<Task>>;
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
 * - Task hierarchy through parentId (recommended max depth: 5 levels)
 * - Task dependencies
 * - Rich task notes
 * - Task metadata
 * 
 * Best Practices:
 * - Keep task hierarchies to 5 levels or less for better organization and maintainability
 * - Use group tasks as containers for related subtasks
 * - Consider splitting deep hierarchies into separate task groups
 * 
 * @example
 * ```typescript
 * const response = await handleToolCall("create_task", {
 *   parentId: null,
 *   name: "Root Task",
 *   type: "group",
 *   subtasks: [{
 *     name: "Subtask",
 *     type: "task"
 *   }]
 * });
 * ```
 */
export const CREATE_TASK_SCHEMA = {
    name: "create_task",
    description: "Creates a new task",
    inputSchema: {
        type: "object",
        properties: {
            parentId: {
                type: ["string", "null"],
                description: "ID of parent task. For better organization, keep hierarchy depth to 5 levels or less"
            },
            name: {
                type: "string",
                description: "Task name"
            },
            description: {
                type: "string",
                description: "Task description"
            },
            type: {
                type: "string",
                enum: ["task", "milestone", "group"],
                description: "Task type"
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
 */
export const TASK_ERROR_CODES = {
    /** Task not found */
    TASK_NOT_FOUND: {
        code: "TASK_NOT_FOUND",
        message: "Task not found",
        recovery: "Verify the task ID exists"
    },
    /** Task validation failed */
    TASK_VALIDATION: {
        code: "TASK_VALIDATION",
        message: "Task validation failed",
        recovery: "Check input data against schema"
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
 */
export const STORAGE_ERROR_CODES = {
    /** Storage read failed */
    STORAGE_READ: {
        code: "STORAGE_READ",
        message: "Failed to read from storage",
        recovery: "Check storage permissions and path"
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
                description: "Server name"
            },
            version: {
                type: "string",
                description: "Server version"
            },
            host: {
                type: "string",
                description: "Server host"
            },
            port: {
                type: "number",
                description: "Server port"
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
 * @example
 * ```typescript
 * const config = {
 *   storage: {
 *     baseDir: "./storage",
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
                description: "Base storage directory"
            },
            maxSessions: {
                type: "number",
                description: "Maximum sessions to keep"
            },
            sessionTTL: {
                type: "number",
                description: "Session time-to-live in seconds"
            },
            backupEnabled: {
                type: "boolean",
                description: "Enable backups"
            },
            maxBackups: {
                type: "number",
                description: "Maximum backups to keep"
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
 * @example
 * ```typescript
 * const config = {
 *   logging: {
 *     level: "INFO",
 *     logDir: "./logs",
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
                description: "Minimum log level"
            },
            logDir: {
                type: "string",
                description: "Log directory path"
            },
            console: {
                type: "boolean",
                description: "Enable console logging"
            },
            file: {
                type: "boolean",
                description: "Enable file logging"
            },
            maxFiles: {
                type: "number",
                description: "Maximum log files"
            },
            maxFileSize: {
                type: "number",
                description: "Maximum file size in bytes"
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
 * @example
 * ```typescript
 * const config = {
 *   security: {
 *     sessionSecret: "your-secret-key",
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
                description: "Session encryption secret"
            },
            rateLimiting: {
                type: "object",
                properties: {
                    enabled: {
                        type: "boolean",
                        description: "Enable rate limiting"
                    },
                    maxRequests: {
                        type: "number",
                        description: "Maximum requests per window"
                    },
                    windowMs: {
                        type: "number",
                        description: "Time window in milliseconds"
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
