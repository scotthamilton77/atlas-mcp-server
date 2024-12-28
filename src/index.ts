import { Logger } from './logging/index.js';
import { TaskManager } from './task/manager/task-manager.js';
import { createStorage } from './storage/index.js';
import { AtlasServer } from './server/index.js';
import { EventManager } from './events/event-manager.js';
import { EventTypes } from './types/events.js';
import { BaseError, ErrorCodes, createError } from './errors/index.js';
import { SerializableError } from './types/events.js';
import { ConfigManager } from './config/index.js';
import { join, dirname } from 'path';
import { promises as fs } from 'fs';

import { TaskStorage } from './types/storage.js';
import { CreateTaskInput, UpdateTaskInput, TaskStatus } from './types/task.js';
import { LogLevels, LogLevel } from './types/logging.js';
import { PlatformPaths, PlatformCapabilities } from './utils/platform-utils.js';

let server: AtlasServer;
let storage: TaskStorage;
let taskManager: TaskManager;
let eventManager: EventManager;
let logger: Logger;

// Helper function to convert Error to SerializableError
function toSerializableError(error: unknown): SerializableError {
    if (error instanceof Error) {
        // Create a base serializable error with required properties
        const serializableError: SerializableError = {
            name: error.name,
            message: error.message
        };

        // Add optional stack trace if available
        if (error.stack) {
            serializableError.stack = error.stack;
        }

        // Copy any additional enumerable properties
        for (const key of Object.keys(error)) {
            serializableError[key] = (error as any)[key];
        }

        return serializableError;
    }

    // For non-Error objects, create a new Error and convert it
    const baseError = new Error(String(error));
    return {
        name: baseError.name,
        message: baseError.message,
        stack: baseError.stack
    };
}

async function main(): Promise<void> {
    try {
        // Load environment variables from .env file if present
        try {
            const { config } = await import('dotenv');
            config();
        } catch (error) {
            // Ignore error if .env file doesn't exist
        }

// Get platform-agnostic paths
const documentsDir = PlatformPaths.getDocumentsDir();
const logDir = process.env.ATLAS_STORAGE_DIR ? 
    join(process.env.ATLAS_STORAGE_DIR, 'logs') : 
    join(documentsDir, 'Cline', 'mcp-workspace', 'ATLAS', 'logs');

// Create log directory with platform-appropriate permissions
await fs.mkdir(logDir, { 
    recursive: true, 
    mode: PlatformCapabilities.getFileMode(0o755)
});

        // Get log level from environment or default to info
        const logLevel = process.env.ATLAS_LOG_LEVEL?.toLowerCase();
        const validLogLevel = Object.values(LogLevels).map(l => l.toLowerCase()).includes(logLevel || '')
            ? logLevel as LogLevel 
            : LogLevels.INFO;

        // Initialize logger with file-only output for MCP clients
        logger = await Logger.initialize({
            console: false, // Disable console output
            file: true,
            minLevel: validLogLevel,
            logDir: logDir,
            maxFileSize: 5 * 1024 * 1024,
            maxFiles: 5,
            noColors: true,
            eventManager: eventManager // Ensure events go through event manager
        });

        // Ensure no console output in error handlers
        process.on('uncaughtException', (error) => {
            logger?.error('Uncaught Exception:', error);
            process.exit(1);
        });

        process.on('unhandledRejection', (reason) => {
            logger?.error('Unhandled Rejection:', reason);
            process.exit(1);
        });

        // Redirect console methods to logger
        console.log = (...args) => logger?.info(args.join(' '));
        console.info = (...args) => logger?.info(args.join(' '));
        console.warn = (...args) => logger?.warn(args.join(' '));
        console.error = (...args) => logger?.error(args.join(' '));
        console.debug = (...args) => logger?.debug(args.join(' '));

        // Add debug log to verify level
        logger.debug('Logger initialized with level', { level: validLogLevel });

        // Initialize event manager
        eventManager = await EventManager.initialize();

        // Update logger with event manager
        logger.setEventManager(eventManager);

        // Increase event listener limits to prevent warnings
        process.setMaxListeners(20);

        const configManager = await ConfigManager.initialize({
            logging: {
                console: false,
                file: true,
                level: validLogLevel,
                maxFiles: 5,
                maxSize: 5242880, // 5MB
                dir: logDir
            },
            storage: {
                baseDir: process.env.ATLAS_STORAGE_DIR || join(PlatformPaths.getDocumentsDir(), 'Cline', 'mcp-workspace', 'ATLAS'),
                name: process.env.ATLAS_STORAGE_NAME || 'atlas-tasks',
                connection: {
                    maxRetries: 1,
                    retryDelay: 500,
                    busyTimeout: 2000
                },
                performance: {
                    checkpointInterval: 60000,
                    cacheSize: 1000,
                    mmapSize: 64 * 1024 * 1024, // 64MB
                    pageSize: 4096,
                    maxMemory: 256 * 1024 * 1024 // 256MB max SQLite memory
                }
            }
        });

const config = configManager.getConfig();

// Ensure storage directory exists with proper permissions
const storageDir = config.storage?.baseDir || join(documentsDir, 'Cline', 'mcp-workspace', 'ATLAS');
await fs.mkdir(storageDir, { 
    recursive: true,
    mode: PlatformCapabilities.getFileMode(0o755)
});

try {
            // Emit system startup event
            eventManager.emitSystemEvent({
                type: EventTypes.SYSTEM_STARTUP,
                timestamp: Date.now(),
                metadata: {
                    version: '1.0.0',
                    environment: process.env.NODE_ENV || 'development'
                }
            });

            // Initialize storage with mutex
            storage = await createStorage(config.storage!);
            
            // Initialize task manager with existing storage instance
            taskManager = await TaskManager.getInstance(storage);

            // Run maintenance after initialization
            await storage.vacuum();
            await storage.analyze();
            await storage.checkpoint();

            // Initialize server only if it doesn't exist
            if (!server) {
                server = await AtlasServer.getInstance(
                {
                    name: 'atlas-mcp-server',
                    version: '1.0.0',
                    maxRequestsPerMinute: 600,
                    requestTimeout: 30000,
                    shutdownTimeout: 5000,
                    health: {
                        checkInterval: 300000,     // 5 minutes
                        failureThreshold: 5,       // 5 strikes
                        shutdownGracePeriod: 10000, // 10 seconds
                        clientPingTimeout: 300000   // 5 minutes
                    }
                },
                {
                    listTools: async () => ({
                        tools: [
                            // Task CRUD operations
                            {
                                name: 'create_task',
                                description: 'Create a new task in the hierarchical task structure. Use create_task to organize and track work items as part of larger workflows. Be sure to think through the requirements from the user as you create tasks. Utilize reasoning and notes as needed.\n\nBest Practices:\n- Structure paths based on context:\n  • System operations: "system/component/action"\n  • Project development: "project/feature/task"\n  • Product releases: "product/version/milestone"\n- Use TASK for concrete work items, MILESTONE for major checkpoints\n- Keep reasoning and description separate for better organization\n- Include clear success criteria and implementation details\n- Track dependencies for workflow orchestration\n\nExample 1 - API Integration Task:\n{\n  "path": "system/external-api/github/setup-webhook",\n  "name": "Configure GitHub Webhook Integration",\n  "reasoning": "Webhook integration needed to enable automated PR review workflows and real-time repository event handling",\n  "description": "Success Criteria:\\n1. Webhook endpoint configured and responding\\n2. Events being received and parsed\\n3. Response latency < 500ms\\n\\nRollback Plan:\\n1. Delete webhook configuration\\n2. Remove endpoint handlers\\n3. Clean up stored credentials",\n  "type": "TASK",\n  "dependencies": [\n    "system/external-api/github/authenticate",\n    "system/webhook-handler/initialize"\n  ],\n  "metadata": {\n    "system": "github-integration",\n    "component": "webhooks",\n    "credentials_path": "/secure/github/webhook-secret",\n    "retry_config": {\n      "max_attempts": 3,\n      "backoff_ms": 1000\n    }\n  }\n}\n\nExample 2 - Project Feature:\n{\n  "path": "project/portfolio/hero-section",\n  "name": "Interactive Hero Section",\n  "reasoning": "Create an engaging first impression that showcases technical capabilities and modern design principles",\n  "description": "Implementation Details:\\n1. Particle system background\\n2. Smooth text animations\\n3. Responsive layout\\n4. Performance optimized\\n\\nTechnical Stack:\\n- Three.js for particles\\n- GSAP for animations\\n- CSS Grid layout\\n- Intersection Observer",\n  "type": "MILESTONE",\n  "metadata": {\n    "priority": "high",\n    "stack": {\n      "graphics": "three.js",\n      "animation": "gsap",\n      "layout": "css-grid"\n    },\n    "performance": {\n      "target_fps": 60,\n      "max_particles": 100\n    }\n  }\n}',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        path: { 
                                            type: 'string',
                                            description: 'Required: Unique path that identifies the task in the hierarchy. Use format "system/component/action" for automated workflows or "project/feature/task" for development work. Examples:\n- "system/services/api/deploy"\n- "project/auth/implement-oauth"'
                                        },
                                        name: { 
                                            type: 'string',
                                            description: 'Required: Clear, descriptive name for the task. Should indicate the specific action or goal. Examples:\n- "Deploy API Service v2"\n- "Implement OAuth Authentication"'
                                        },
                                        description: { 
                                            type: 'string',
                                            description: 'Optional but recommended: Detailed technical explanation including:\n- Success criteria\n- Implementation steps\n- Technical details\n- Rollback procedures\n- Error handling approach'
                                        },
                                        type: { 
                                            type: 'string', 
                                            enum: ['TASK', 'MILESTONE'],
                                            description: 'Optional: Task classification:\n- TASK: Concrete work item (default)\n  Use for: API endpoints, database migrations, service deployments\n- MILESTONE: Major checkpoint\n  Use for: Release versions, feature completions, system transitions'
                                        },
                                        parentPath: { 
                                            type: 'string',
                                            description: 'Optional: Path of the parent task for hierarchical organization. Examples:\n- Child task: "system/api/endpoints/users" under "system/api/endpoints"\n- Feature task: "project/auth/oauth/google" under "project/auth/oauth"'
                                        },
                                        dependencies: { 
                                            type: 'array', 
                                            items: { 
                                                type: 'string',
                                                description: 'Task path that must complete before this task can start. Use valid existing paths'
                                            },
                                            description: 'Optional: Tasks that must complete first. Order from upstream to downstream. Examples:\n- Service dependencies: ["system/database/migrate", "system/cache/initialize"]\n- Feature dependencies: ["project/auth/core", "project/api/endpoints"]'
                                        },
                                        metadata: { 
                                            type: 'object',
                                            description: 'Optional: Additional task context and configuration. Common fields:\n- priority: "high", "medium", "low"\n- owner: "team-name" or "service-name"\n- tags: ["feature", "backend", "database"]\n- timeouts: { "execution": 3600, "retry": 300 }\n- metrics: ["latency", "error_rate", "throughput"]\n- alerts: { "error_threshold": 0.01, "latency_ms": 500 }'
                                        }
                                    },
                                    required: ['path', 'name']
                                }
                            },
                            {
                                name: 'update_task',
                                description: 'Update task properties to reflect system state changes and operation progress. Use update_task when you need to modify task status, track progress, or update metadata based on system events or user requirements. Think through the implications of each update.\n\nBest Practices:\n- Update only fields that reflect actual changes\n- Keep reasoning and description separate\n- Track progress with measurable metrics\n- Maintain system state consistency\n- Consider downstream impacts\n\nExample 1 - API Integration Progress:\n{\n  "path": "system/external-api/github/setup-webhook",\n  "updates": {\n    "status": "IN_PROGRESS",\n    "reasoning": "Initial OAuth setup and endpoint registration completed, proceeding with event configuration",\n    "description": "Progress:\\n- OAuth credentials obtained\\n- Endpoint registered\\n- Pending: Event type configuration\\n\\nNext Actions:\\n1. Configure event subscriptions\\n2. Test webhook delivery\\n3. Set up error handling",\n    "metadata": {\n      "completion_steps": {\n        "oauth_setup": true,\n        "endpoint_registration": true,\n        "event_configuration": false,\n        "webhook_testing": false\n      },\n      "last_verified": "2024-01-15T10:30:00Z",\n      "remaining_steps": 2\n    }\n  }\n}\n\nExample 2 - Error Recovery:\n{\n  "path": "system/data-pipeline/daily-etl",\n  "updates": {\n    "status": "FAILED",\n    "reasoning": "Critical connection timeout after multiple retry attempts indicates potential infrastructure issue",\n    "description": "Diagnostics:\\n- 3 retry attempts failed\\n- Last error: Connection refused\\n- No data processed\\n\\nRecovery Plan:\\n1. Switch to backup API endpoint\\n2. Reduce batch size\\n3. Increase timeout window",\n    "metadata": {\n      "error_details": {\n        "type": "connection_timeout",\n        "attempts": 3,\n        "last_error": "ECONNREFUSED"\n      },\n      "recovery_action": "failover_to_backup",\n      "retry_config": {\n        "batch_size": 100,\n        "timeout_ms": 5000\n      }\n    }\n  }\n}',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        path: { 
                                            type: 'string',
                                            description: 'Required: Path of the task to update. Must be an existing task path like "system/services/api" or "project/auth/oauth"'
                                        },
                                        updates: {
                                            type: 'object',
                                            description: 'Required: Changes to apply to the task. Include only fields that need updating. Each update should have clear reasoning',
                                            properties: {
                                                    name: { 
                                                        type: 'string',
                                                        description: 'Optional: New display name. Update when:\n- Clarifying task purpose\n- Reflecting changed requirements\n- Improving task identification'
                                                    },
                                        description: { 
                                            type: 'string',
                                            description: 'Optional but recommended: Detailed technical explanation including:\n- Success criteria\n- Implementation steps\n- Technical details\n- Rollback procedures\n- Error handling approach'
                                        },
                                        reasoning: {
                                            type: 'string',
                                            description: 'Optional but recommended: Clear explanation of why this task is needed and its intended purpose. This helps maintain context and aids in decision making.'
                                        },
                                                    status: { 
                                                        type: 'string', 
                                                        enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'BLOCKED'],
                                                        description: 'Optional: New task state with strict transition rules:\n\n' +
                                                                   'Status Flow:\n' +
                                                                   '1. PENDING (Initial State)\n' +
                                                                   '   → Can transition to: IN_PROGRESS, BLOCKED\n' +
                                                                   '   → Cannot skip to COMPLETED (must track progress)\n\n' +
                                                                   '2. IN_PROGRESS (Active State)\n' +
                                                                   '   → Can transition to: COMPLETED, FAILED, BLOCKED\n' +
                                                                   '   → Required before completion\n\n' +
                                                                   '3. BLOCKED (Dependency State)\n' +
                                                                   '   → Can transition to: PENDING, IN_PROGRESS\n' +
                                                                   '   → Auto-set when dependencies incomplete\n\n' +
                                                                   '4. COMPLETED (Terminal State)\n' +
                                                                   '   → Must come from IN_PROGRESS\n' +
                                                                   '   → Requires all dependencies completed\n\n' +
                                                                   '5. FAILED (Terminal State)\n' +
                                                                   '   → Can retry by setting to PENDING\n\n' +
                                                                   'Best Practices:\n' +
                                                                   '- Always start tasks as PENDING\n' +
                                                                   '- Mark as IN_PROGRESS when work begins\n' +
                                                                   '- Use BLOCKED for dependency issues\n' +
                                                                   '- Complete dependencies before marking COMPLETED'
                                                    },
                                                    dependencies: { 
                                                        type: 'array', 
                                                        items: { 
                                                            type: 'string',
                                                            description: 'Task path that must complete first. Use valid existing paths'
                                                        },
                                                        description: 'Optional: New dependency list. Common updates:\n- Adding new requirements\n- Removing completed dependencies\n- Reordering execution sequence\n- Fixing broken dependencies'
                                                    },
                                                    metadata: { 
                                                        type: 'object',
                                                        description: 'Optional: Additional task context. Common updates:\n- Progress metrics (completion %, items processed)\n- Performance data (duration, resource usage)\n- Error details (type, count, timestamp)\n- System state (versions, configurations)\n- Alert thresholds (error rate, latency)'
                                                    }
                                            }
                                        }
                                    },
                                    required: ['path', 'updates']
                                }
                            },
                            {
                                name: 'delete_task',
                                description: 'Delete a task and all its subtasks recursively. Use delete_task when you need to remove completed workflows or clean up failed task hierarchies. Think through the impact on dependent tasks and running workflows.\n\nBest Practices:\n- Verify task completion status\n- Check dependent workflows\n- Consider archiving instead\n- Back up task data first\n- Update dependencies after\n\nExample 1 - Clean Up Completed Workflow:\n{\n  "path": "system/deployment/v1.0",\n  "reasoning": "Deployment tasks are no longer needed after successful v2 migration",\n  "description": "Verification:\\n- All subtasks completed\\n- New version deployed\\n- No active dependencies"\n}\n\nExample 2 - Remove Failed Pipeline:\n{\n  "path": "system/pipeline/failed-etl",\n  "reasoning": "Pipeline recovery attempts exhausted, need to clean up for fresh start",\n  "description": "Checks:\\n- Recovery attempts exhausted\\n- Data backed up\\n- Dependencies updated"\n}',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        path: { 
                                            type: 'string',
                                            description: 'Required: Path of task hierarchy to remove. Choose carefully as deletion:\n- Removes the specified task and ALL subtasks\n- Cannot be undone after confirmation\n- May impact dependent workflows\n- Should be verified for completion\n\nCommon targets:\n- Completed releases: "system/deployment/v1.0"\n- Failed workflows: "system/pipeline/failed-etl"\n- Deprecated features: "project/legacy/old-auth"\n- Test environments: "system/testing/integration-env"'
                                        }
                                    },
                                    required: ['path']
                                }
                            },
                            {
                                name: 'get_tasks_by_status',
                                description: 'Retrieve all tasks with a specific status. Use get_tasks_by_status when you need to monitor workflow progress, investigate issues, or generate system health reports. Think through which status will provide the most relevant task set.\n\nStatus Values:\n- PENDING: Tasks awaiting start conditions\n- IN_PROGRESS: Currently executing tasks\n- COMPLETED: Successfully finished tasks\n- FAILED: Tasks with execution errors\n- BLOCKED: Tasks waiting on dependencies\n\nExample 1 - Monitor Deployment Progress:\n{\n  "status": "IN_PROGRESS",\n  "reasoning": "Need to identify and monitor all active deployment operations",\n  "description": "Purpose:\\n- Identify running operations\\n- Monitor parallel deployments\\n- Detect stuck processes"\n}\n\nExample 2 - Investigate System Issues:\n{\n  "status": "FAILED",\n  "reasoning": "System showing increased error rates, need to identify failure patterns",\n  "description": "Goals:\\n- Find error patterns\\n- Identify affected components\\n- Plan recovery actions"\n}',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        status: { 
                                            type: 'string', 
                                            enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'BLOCKED'],
                                            description: 'Required: Status to filter tasks by. Choose based on monitoring needs:\n- PENDING: Find tasks ready to start or queued\n- IN_PROGRESS: Monitor active operations and progress\n- COMPLETED: Verify successful operations and cleanup\n- FAILED: Investigate errors and plan recovery\n- BLOCKED: Identify and resolve dependency issues'
                                        }
                                    },
                                    required: ['status']
                                }
                            },
                            {
                                name: 'get_tasks_by_path',
                                description: 'Retrieve tasks matching a glob pattern. Use get_tasks_by_path when you need to analyze workflow components, audit system areas, or gather task groups for reporting. Think through the pattern structure to target relevant tasks.\n\nPattern Types:\n- Direct Children: "system/*" (immediate tasks)\n- Full Tree: "system/**" (all nested tasks)\n- Cross-Component: "*/api" (specific task type)\n- Partial Match: "pipeline/etl*" (name prefix)\n\nBest Practices:\n- Use specific patterns\n- Consider hierarchy depth\n- Combine with filtering\n- Analyze results carefully\n- Monitor pattern impact\n\nExample 1 - Audit Service Components:\n{\n  "pattern": "system/services/**",\n  "reasoning": "Review service infrastructure\\n\\nGoals:\\n- Map service dependencies\\n- Identify shared components\\n- Locate integration points"\n}\n\nExample 2 - Monitor Pipeline Tasks:\n{\n  "pattern": "*/pipeline/*",\n  "reasoning": "Analyze data workflows\\n\\nPurpose:\\n- Find active pipelines\\n- Check pipeline health\\n- Verify data flow"\n}',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        pattern: { 
                                            type: 'string',
                                            description: 'Required: Glob pattern to match task paths. Pattern types:\n- Single level (*): "system/*" matches immediate children\n- Recursive (**): "system/**" matches all descendants\n- Component match: "*/api/*" finds API tasks across projects\n- Name prefix: "pipeline/etl*" matches ETL-related tasks\n- Mixed depth: "system/**/health" finds health checks at any level'
                                        }
                                    },
                                    required: ['pattern']
                                }
                            },
                            {
                                name: 'get_subtasks',
                                description: 'Retrieve all direct subtasks of a given task. Use get_subtasks when you need to inspect workflow components, track progress of task groups, or manage task hierarchies. Think through the scope of task relationships you need to examine.\n\nBest Practices:\n- Focus on immediate children\n- Track completion status\n- Verify dependencies\n- Monitor task health\n- Consider parent context\n\nExample 1 - Monitor Service Components:\n{\n  "parentPath": "system/services/api-gateway",\n  "reasoning": "Inspect gateway components\\n\\nPurpose:\\n- Check endpoint status\\n- Verify route configs\\n- Monitor auth services"\n}\n\nExample 2 - Track Pipeline Progress:\n{\n  "parentPath": "system/pipeline/daily-etl",\n  "reasoning": "Review ETL workflow steps\\n\\nGoals:\\n- Verify step sequence\\n- Check step status\\n- Identify bottlenecks"\n}',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        parentPath: { 
                                            type: 'string',
                                            description: 'Required: Path of the parent task to inspect. Choose based on analysis needs:\n- Component inspection: "system/services/api" for API subtasks\n- Pipeline monitoring: "system/pipeline/daily-etl" for ETL steps\n- Feature tracking: "project/auth" for auth implementation tasks\n- Release management: "system/deployment/v2" for deployment steps'
                                        }
                                    },
                                    required: ['parentPath']
                                }
                            },
                            {
                                name: 'bulk_task_operations',
                                description: 'Execute multiple task operations atomically in a single transaction. Use bulk_task_operations when you need to coordinate multiple related changes that must succeed or fail together. Think through the sequence of operations and their dependencies.\n\nSupported Operations:\n- create: Initialize new workflow components\n- update: Progress state machines\n- delete: Clean up completed processes\n\nBest Practices:\n- Group related system changes\n- Order operations logically\n- Maintain data consistency\n- Handle failures gracefully\n- Validate before executing\n\nExample 1 - Service Deployment:\n{\n  "operations": [\n    {\n      "type": "create",\n      "path": "system/deployment/service-x/v2",\n      "data": {\n        "name": "Deploy Service X v2",\n        "description": "Reasoning: Coordinated deployment requires multiple synchronized steps\\n\\nSteps:\\n1. Health check current version\\n2. Deploy new containers\\n3. Migrate traffic\\n4. Verify metrics\\n\\nRollback Triggers:\\n- Error rate > 1%\\n- Latency p95 > 500ms",\n        "type": "MILESTONE"\n      }\n    },\n    {\n      "type": "update",\n      "path": "system/deployment/service-x/v1",\n      "data": {\n        "status": "IN_PROGRESS",\n        "metadata": {\n          "traffic_weight": 0.9,\n          "scale_down": true\n        }\n      }\n    },\n    {\n      "type": "create",\n      "path": "system/monitoring/alerts/service-x",\n      "data": {\n        "name": "Monitor Service X Deployment",\n        "type": "TASK",\n        "metadata": {\n          "metrics": ["error_rate", "latency_p95", "cpu_usage"],\n          "alert_threshold": 0.01\n        }\n      }\n    }\n  ]\n}\n\nExample 2 - Error Recovery:\n{\n  "operations": [\n    {\n      "type": "update",\n      "path": "system/services/api-gateway",\n      "data": {\n        "status": "FAILED",\n        "description": "Reasoning: Circuit breaker triggered due to downstream failures\\n\\nDiagnostics:\\n- 3 backend services unreachable\\n- Connection pool exhausted\\n- Timeout threshold exceeded\\n\\nRecovery Actions:\\n1. Activate fallback endpoints\\n2. Scale up healthy instances\\n3. Update routing rules",\n        "metadata": {\n          "circuit_breaker": "open",\n          "failing_endpoints": ["/users", "/orders", "/payments"],\n          "fallback_mode": true\n        }\n      }\n    },\n    {\n      "type": "create",\n      "path": "system/recovery/api-gateway/failover",\n      "data": {\n        "name": "API Gateway Failover",\n        "type": "TASK",\n        "description": "Reasoning: Automated recovery needed for API stability\\n\\nActions:\\n1. Route traffic to backup region\\n2. Scale backup instances\\n3. Update DNS records",\n        "metadata": {\n          "region": "backup-east",\n          "ttl": 300,\n          "max_instances": 5\n        }\n      }\n    }\n  ]\n}',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        operations: {
                                            type: 'array',
                                            description: 'Required: Batch of coordinated task operations. Group operations that:\n- Represent a single logical change\n- Must succeed or fail together\n- Share common workflow context\n- Have interdependent effects\n- Maintain system consistency\n\nAll operations execute in a single transaction for:\n- Data consistency\n- Atomic changes\n- Rollback safety\n- State preservation\n- Error handling',
                                            items: {
                                                type: 'object',
                                                properties: {
                                                    type: { 
                                                        type: 'string', 
                                                        enum: ['create', 'update', 'delete'],
                                                        description: 'Required: Operation type to perform:\n- create: Initialize new components\n  Use for: New services, features, workflows\n- update: Modify existing tasks\n  Use for: Progress updates, state changes, reconfigurations\n- delete: Remove tasks\n  Use for: Cleanup, deprecation, error recovery'
                                                    },
                                                    path: { 
                                                        type: 'string',
                                                        description: 'Required: Target task path. Common patterns:\n- Service operations: "system/services/api/deploy"\n- Feature rollouts: "project/auth/oauth/enable"\n- Pipeline stages: "system/etl/transform/validate"\n- System tasks: "system/maintenance/backup/weekly"'
                                                    },
                                                    data: { 
                                                        type: 'object',
                                                        description: 'Required for create/update operations:\n\nFor create:\n- name: Clear task identifier\n- type: TASK or MILESTONE\n- description: Detailed context\n- dependencies: Required predecessors\n- metadata: Configuration data\n\nFor update:\n- status: New task state\n- description: Progress notes\n- metadata: Updated metrics\n\nNot needed for delete operations'
                                                    }
                                                },
                                                required: ['type', 'path']
                                            }
                                        }
                                    },
                                    required: ['operations']
                                }
                            },
                            // Database maintenance operations
                            {
                                name: 'clear_all_tasks',
                                description: 'Clear all tasks from the database and reset all caches. Use clear_all_tasks when you need to perform a complete system reset or migrate to a new workflow structure. Think through the impact of losing all task history.\n\nBest Practices:\n- Verify no active workflows\n- Back up data before clearing\n- Plan cache rebuild strategy\n- Consider selective cleanup\n- Monitor system stability\n\nExample 1 - System Migration:\n{\n  "confirm": true,\n  "reasoning": "Preparing for workflow restructure\\n\\nPreconditions:\\n- All workflows completed\\n- Data backed up\\n- Migration plan ready"\n}\n\nExample 2 - Development Reset:\n{\n  "confirm": true,\n  "reasoning": "Reset development environment\\n\\nChecks:\\n- No production data\\n- Test workflows stopped\\n- Backup verified"\n}',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        confirm: { 
                                            type: 'boolean',
                                            description: 'Required: Safety confirmation flag. Set to true only after verifying:\n- All workflows are completed or safely terminable\n- Critical data has been backed up\n- No active operations depend on task data\n- Cache rebuild strategy is in place\n- System can handle temporary performance impact\n\nIMPORTANT: This operation:\n- Permanently deletes ALL tasks\n- Cannot be undone\n- Clears all caches\n- May impact system performance\n- Requires cache rebuild'
                                        }
                                    },
                                    required: ['confirm']
                                }
                            },
                            {
                                name: 'vacuum_database',
                                description: 'Optimize database storage and performance. Use vacuum_database when you detect performance degradation or after bulk task operations that modify large amounts of data. Think through the impact on running workflows.\n\nBest Practices:\n- Run during system idle periods\n- Combine with analyze for query optimization\n- Monitor performance metrics\n- Back up critical data first\n- Verify system stability\n\nExample 1 - Post-Cleanup Optimization:\n{\n  "analyze": true,\n  "reasoning": "Optimize storage after bulk task deletion\\n\\nTriggers:\\n- 1000+ tasks removed\\n- Query latency increased\\n- Storage fragmentation detected"\n}\n\nExample 2 - Maintenance Window:\n{\n  "analyze": true,\n  "reasoning": "Scheduled database optimization\\n\\nChecks:\\n- System load < 10%\\n- No critical workflows\\n- Backup completed"\n}',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        analyze: { 
                                            type: 'boolean',
                                            description: 'Optional: Enable statistical analysis after vacuum. Set to true to:\n- Update query planner statistics\n- Optimize index usage patterns\n- Improve query performance\n- Generate table metrics\n- Enable smarter query plans\n\nNOTE: Analysis may:\n- Take additional time\n- Use extra CPU resources\n- Temporarily impact performance\n- Require more I/O operations\n\nDefaults to false if not specified'
                                        }
                                    }
                                }
                            },
                            {
                                name: 'repair_relationships',
                                description: 'Repair parent-child relationships and fix inconsistencies in the task hierarchy. Use repair_relationships when you detect task relationship issues or need to validate the integrity of workflow structures. Think through the impact of repairs on running workflows.\n\nBest Practices:\n- Always run in dry-run mode first\n- Target specific workflow paths\n- Verify repair impact\n- Back up critical paths\n- Monitor repair success\n\nExample 1 - Validate Deployment Tasks:\n{\n  "dryRun": true,\n  "pathPattern": "system/deployment/**",\n  "reasoning": "Verify deployment workflow integrity after system update"\n}\n\nExample 2 - Fix Pipeline Tasks:\n{\n  "dryRun": false,\n  "pathPattern": "system/pipeline/daily-etl/**",\n  "reasoning": "Repair ETL task relationships after component restructuring"\n}',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        dryRun: { 
                                            type: 'boolean',
                                            description: 'Optional: Safety check mode. When true:\n- Reports all detected issues\n- Shows planned repairs\n- Makes no actual changes\n- Validates repair strategy\n- Estimates repair impact\n\nRecommended workflow:\n1. Run with dryRun=true first\n2. Review reported issues\n3. Plan repair strategy\n4. Set to false for actual repairs\n\nDefaults to false if not specified'
                                        },
                                        pathPattern: { 
                                            type: 'string',
                                            description: 'Optional: Target specific task hierarchies. Pattern types:\n- Full tree: "system/**" checks all system tasks\n- Component: "system/services/*" checks direct service tasks\n- Feature: "project/*/api" checks API tasks across projects\n- Specific: "system/pipeline/etl-*" checks ETL pipelines\n\nIf not provided:\n- Checks entire task hierarchy\n- May take longer to complete\n- Uses more system resources\n- Impacts wider task scope'
                                        }
                                    }
                                }
                            },
                            {
                                name: 'update_task_statuses',
                                description: 'Update statuses of multiple tasks in a single batch operation. Use update_task_statuses when you need to reflect the progress of automated workflows or respond to system events. Think through the implications of each status change.\n\nBest Practices:\n- Group related status changes\n- Update in dependency order\n- Include status change reasoning\n- Maintain workflow consistency\n- Handle transition failures\n\nExample 1 - Deployment Progress:\n{\n  "updates": [\n    {\n      "path": "system/deployment/database/migration",\n      "status": "COMPLETED",\n      "metadata": {\n        "reasoning": "Database migration completed successfully\\n\\nValidation:\\n- Schema changes applied\\n- Data migrated\\n- Integrity checks passed",\n        "completion_metrics": {\n          "tables_migrated": 15,\n          "rows_processed": 50000,\n          "duration_ms": 45000\n        }\n      }\n    },\n    {\n      "path": "system/deployment/api/update",\n      "status": "IN_PROGRESS",\n      "metadata": {\n        "reasoning": "API deployment started after successful DB migration\\n\\nSteps:\\n1. Deploy new containers\\n2. Health check endpoints\\n3. Update load balancer",\n        "progress": {\n          "containers_updated": "2/5",\n          "health_checks": "pending",\n          "traffic_shifted": false\n        }\n      }\n    }\n  ]\n}\n\nExample 2 - Error Handling:\n{\n  "updates": [\n    {\n      "path": "system/monitoring/metrics/collector",\n      "status": "FAILED",\n      "metadata": {\n        "reasoning": "Metrics collection failed due to storage issues\\n\\nDiagnostics:\\n- Disk space critical\\n- Write operations failing\\n- Buffer overflow imminent\\n\\nRecovery Plan:\\n1. Clean old metrics\\n2. Expand storage\\n3. Resume collection",\n        "error_context": {\n          "disk_usage": "98%",\n          "failed_writes": 150,\n          "buffer_size": "1GB"\n        }\n      }\n    },\n    {\n      "path": "system/monitoring/alerts",\n      "status": "BLOCKED",\n      "metadata": {\n        "reasoning": "Alert processing blocked by metrics collector failure\\n\\nImpact:\\n- Real-time alerts delayed\\n- Historical data incomplete\\n- Trending analysis affected\\n\\nMitigation:\\n- Using cached metrics\\n- Critical alerts only\\n- Manual monitoring",\n        "dependencies": {\n          "blocked_by": "system/monitoring/metrics/collector",\n          "fallback_mode": true\n        }\n      }\n    }\n  ]\n}',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        updates: {
                                            type: 'array',
                                            description: 'Required: Batch of status updates to process atomically. Group updates that:\n- Share common workflow context\n- Represent related state changes\n- Need synchronized transitions\n- Affect dependent components\n- Maintain system consistency',
                                            items: {
                                                type: 'object',
                                                properties: {
                                                    path: {
                                                        type: 'string',
                                                        description: 'Required: Task to update status for. Common scenarios:\n- Service deployments: "system/services/api/deploy"\n- Pipeline stages: "system/etl/transform"\n- Feature rollouts: "project/auth/oauth/enable"\n- System operations: "system/maintenance/backup"'
                                                    },
                                                    status: {
                                                        type: 'string',
                                                        enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'BLOCKED'],
                                                        description: 'Required: New task state. Choose based on:\n- PENDING: Task ready but waiting\n  Use for: Queued operations, scheduled tasks\n- IN_PROGRESS: Active execution\n  Use for: Running processes, ongoing operations\n- COMPLETED: Successfully finished\n  Use for: Validated results, confirmed success\n- FAILED: Error encountered\n  Use for: System failures, validation errors\n- BLOCKED: Dependency issues\n  Use for: Missing prerequisites, resource conflicts'
                                                    }
                                                },
                                                required: ['path', 'status']
                                            }
                                        }
                                    },
                                    required: ['updates']
                                }
                            },
                            {
                                name: 'update_task_dependencies',
                                description: 'Update dependencies of multiple tasks in a single batch operation. Use update_task_dependencies when you need to modify workflow dependencies based on system architecture changes or operational requirements. Think through the dependency graph implications.\n\nBest Practices:\n- Verify all paths exist before updating\n- Prevent dependency cycles\n- Update related tasks together\n- Consider system architecture\n- Monitor dependency health\n\nExample 1 - Service Dependencies:\n{\n  "updates": [\n    {\n      "path": "system/services/user-api",\n      "dependencies": [\n        "system/services/auth",\n        "system/services/database",\n        "system/services/cache"\n      ]\n    },\n    {\n      "path": "system/services/auth",\n      "dependencies": [\n        "system/services/database"\n      ]\n    }\n  ]\n}\n\nExample 2 - Pipeline Dependencies:\n{\n  "updates": [\n    {\n      "path": "system/pipeline/data-processing",\n      "dependencies": [\n        "system/pipeline/data-ingestion",\n        "system/pipeline/validation",\n        "system/pipeline/monitoring"\n      ]\n    },\n    {\n      "path": "system/pipeline/validation",\n      "dependencies": [\n        "system/pipeline/data-ingestion"\n      ]\n    }\n  ]\n}',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        updates: {
                                            type: 'array',
                                            description: 'Required: Batch of dependency updates to process atomically. Group updates that:\n- Affect related components\n- Maintain system consistency\n- Share common dependencies\n- Follow logical workflow order\n- Need coordinated changes',
                                            items: {
                                                type: 'object',
                                                properties: {
                                                    path: {
                                                        type: 'string',
                                                        description: 'Required: Task to update dependencies for. Common patterns:\n- Service paths: "system/services/api"\n- Pipeline stages: "system/pipeline/processing"\n- Feature modules: "project/auth/oauth"\n- Integration points: "system/external/payment-gateway"'
                                                    },
                                                    dependencies: {
                                                        type: 'array',
                                                        items: { 
                                                            type: 'string',
                                                            description: 'Task path that must complete first. Examples:\n- Core services: "system/services/database"\n- Auth requirements: "system/auth/initialize"\n- API dependencies: "system/api/swagger-spec"\n- Shared resources: "system/cache/warm-up"'
                                                        },
                                                        description: 'Required: Complete dependency list that:\n- Replaces all existing dependencies\n- Orders from upstream to downstream\n- Includes all required predecessors\n- Maintains system architecture\n- Prevents circular references'
                                                    }
                                                },
                                                required: ['path', 'dependencies']
                                            }
                                        }
                                    },
                                    required: ['updates']
                                }
                            },
                            {
                                name: 'export_task_tree',
                                description: 'Export the complete task hierarchy in a human-readable format. This tool provides a comprehensive view of all tasks, their relationships, statuses, and metadata.\n\nBest Practices:\n- Use for system documentation\n- Analyze workflow structures\n- Audit task relationships\n- Export for reporting\n- Backup task hierarchies\n\nExample - Full System Export:\n{\n  "format": "tree",\n  "includeMetadata": true,\n  "filePath": "task-hierarchy.txt",\n  "reasoning": "Generate system documentation\\n\\nPurpose:\\n- Document task structure\\n- Analyze dependencies\\n- Verify task organization"\n}\n\nExample - Filtered Export:\n{\n  "format": "json",\n  "rootPath": "system/deployment/**",\n  "includeMetadata": true,\n  "filePath": "deployment-tasks.json",\n  "reasoning": "Audit deployment workflows\\n\\nGoals:\\n- Review deployment structure\\n- Verify task dependencies\\n- Document deployment process"',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        format: {
                                            type: 'string',
                                            enum: ['tree', 'json'],
                                            description: 'Required: Output format:\n- tree: Human-readable tree structure\n- json: Detailed JSON hierarchy',
                                            default: 'tree'
                                        },
                                        rootPath: {
                                            type: 'string',
                                            description: 'Optional: Root path to export. Uses glob patterns:\n- Full system: "**" (default)\n- Specific branch: "system/deployment/**"\n- Feature subset: "project/auth/**"'
                                        },
                                        includeMetadata: {
                                            type: 'boolean',
                                            description: 'Optional: Include detailed task metadata:\n- true: Full task details (status, dates, etc.)\n- false: Basic structure only\nDefaults to false',
                                            default: false
                                        },
                                        filePath: {
                                            type: 'string',
                                            description: 'Optional: Save output to file. File will be created in the storage directory.\n- Example: "task-hierarchy.txt"\n- Example: "exports/deployment-tasks.json"'
                                        }
                                    },
                                    required: []
                                }
                            }
                        ]
                    }),
                    handleToolCall: async (request) => {
                        const name = request.params?.name as string;
                        const args = request.params?.arguments as Record<string, any>;
                        let result;

                        try {
                            // Emit tool start event
                            eventManager.emitSystemEvent({
                                type: EventTypes.TOOL_STARTED,
                                timestamp: Date.now(),
                                metadata: {
                                    tool: name,
                                    args
                                }
                            });

                            switch (name) {
                            case 'create_task':
                                result = await taskManager.createTask(args as CreateTaskInput);
                                return {
                                    content: [{
                                        type: 'text',
                                        text: JSON.stringify(result, null, 2)
                                    }]
                                };
                            case 'update_task':
                                result = await taskManager.updateTask(args.path as string, args.updates as UpdateTaskInput);
                                return {
                                    content: [{
                                        type: 'text',
                                        text: JSON.stringify(result, null, 2)
                                    }]
                                };
                            case 'delete_task':
                                await taskManager.deleteTask(args.path as string);
                                return {
                                    content: [{
                                        type: 'text',
                                        text: 'Task deleted successfully'
                                    }]
                                };
                            case 'get_tasks_by_status':
                                result = await taskManager.getTasksByStatus(args.status as TaskStatus);
                                return {
                                    content: [{
                                        type: 'text',
                                        text: JSON.stringify(result, null, 2)
                                    }]
                                };
                            case 'get_tasks_by_path':
                                result = await taskManager.listTasks(args.pattern as string);
                                return {
                                    content: [{
                                        type: 'text',
                                        text: JSON.stringify(result, null, 2)
                                    }]
                                };
                            case 'get_subtasks':
                                result = await taskManager.getSubtasks(args.parentPath as string);
                                return {
                                    content: [{
                                        type: 'text',
                                        text: JSON.stringify(result, null, 2)
                                    }]
                                };
                            case 'bulk_task_operations':
                                result = await taskManager.bulkTaskOperations({ operations: args.operations as Array<{ type: 'create' | 'update' | 'delete', path: string, data?: CreateTaskInput | UpdateTaskInput }> });
                                return {
                                    content: [{
                                        type: 'text',
                                        text: JSON.stringify(result, null, 2)
                                    }]
                                };
                            case 'clear_all_tasks':
                                await taskManager.clearAllTasks(args.confirm as boolean);
                                return {
                                    content: [{
                                        type: 'text',
                                        text: 'All tasks cleared successfully'
                                    }]
                                };
                            case 'vacuum_database':
                                await taskManager.vacuumDatabase(args.analyze as boolean);
                                return {
                                    content: [{
                                        type: 'text',
                                        text: 'Database vacuumed successfully'
                                    }]
                                };
                            case 'repair_relationships':
                                result = await taskManager.repairRelationships(args.dryRun as boolean, args.pathPattern as string | undefined);
                                return {
                                    content: [{
                                        type: 'text',
                                        text: JSON.stringify(result, null, 2)
                                    }]
                                };
                            case 'update_task_statuses':
                                result = await taskManager.updateTaskStatuses(args.updates);
                                return {
                                    content: [{
                                        type: 'text',
                                        text: JSON.stringify(result, null, 2)
                                    }]
                                };
                            case 'update_task_dependencies':
                                result = await taskManager.updateTaskDependencies(args.updates);
                                return {
                                    content: [{
                                        type: 'text',
                                        text: JSON.stringify(result, null, 2)
                                    }]
                                };
                            case 'export_task_tree':
                                // Get all tasks matching the root path pattern
                                const pattern = args.rootPath || '**';
                                const tasks = await taskManager.listTasks(pattern);
                                
                                interface TaskNode {
                                    path: string;
                                    name: string;
                                    type: string;
                                    status: string;
                                    children: TaskNode[];
                                    description?: string;
                                    metadata?: Record<string, any>;
                                    dependencies?: string[];
                                    created?: string;
                                    updated?: string;
                                }
                                
                                // Build task hierarchy
                                const taskMap = new Map<string, TaskNode>();
                                const rootTasks: TaskNode[] = [];
                                
                                // First pass: Create task map
                                const taskList = tasks.data || [];
                                taskList.forEach((task) => {
                                    taskMap.set(task.path, {
                                        path: task.path,
                                        name: task.name,
                                        type: task.type,
                                        status: task.status,
                                        children: [],
                                        ...(args.includeMetadata ? {
                                            description: task.description,
                                            metadata: task.metadata,
                                            dependencies: task.dependencies,
                                            created: task.created,
                                            updated: task.updated
                                        } : {})
                                    });
                                });
                                
                                // Second pass: Build hierarchy
                                taskList.forEach((task) => {
                                    const taskNode = taskMap.get(task.path);
                                    if (taskNode && task.parentPath && taskMap.has(task.parentPath)) {
                                        const parentNode = taskMap.get(task.parentPath);
                                        if (parentNode) {
                                            parentNode.children.push(taskNode);
                                        }
                                    } else if (taskNode) {
                                        rootTasks.push(taskNode);
                                    }
                                });
                                
                                // Format output
                                let output = '';
                                if (args.format === 'json') {
                                    output = JSON.stringify(rootTasks, null, 2);
                                } else {
                                    // Generate tree view
                                    const generateTree = (nodes: TaskNode[], prefix = '') => {
                                        let result = '';
                                        nodes.forEach((node, index) => {
                                            const isLast = index === nodes.length - 1;
                                            const connector = isLast ? '└── ' : '├── ';
                                            const childPrefix = isLast ? '    ' : '│   ';
                                            
                                            // Node details
                                            result += prefix + connector + node.path + 
                                                     ` [${node.type}] [${node.status}]` +
                                                     (args.includeMetadata ? 
                                                        `\n${prefix}${childPrefix}Name: ${node.name}` +
                                                        (node.description ? `\n${prefix}${childPrefix}Description: ${node.description}` : '') +
                                                        (node.dependencies?.length ? `\n${prefix}${childPrefix}Dependencies: ${node.dependencies.join(', ')}` : '') +
                                            `\n${prefix}${childPrefix}Created: ${node.created || 'N/A'}` +
                                            `\n${prefix}${childPrefix}Updated: ${node.updated || 'N/A'}`
                                                     : '') + '\n';
                                            
                                            // Process children
                                            if (node.children.length > 0) {
                                                result += generateTree(node.children, prefix + childPrefix);
                                            }
                                        });
                                        return result;
                                    };
                                    output = generateTree(rootTasks);
                                }

                                // Save to file if path provided
                                if (args.filePath) {
                                    const storageDir = config.storage?.baseDir || join(documentsDir, 'Cline', 'mcp-workspace', 'ATLAS');
                                    const fullPath = join(storageDir, args.filePath);
                                    
                                    // Ensure export directory exists
                                    await fs.mkdir(dirname(fullPath), { recursive: true });
                                    
                                    // Write file
                                    await fs.writeFile(fullPath, output, 'utf8');
                                    
                                    return {
                                        content: [{
                                            type: 'text',
                                            text: `Task hierarchy exported to: ${fullPath}\n\n${output}`
                                        }]
                                    };
                                }
                                
                                return {
                                    content: [{
                                        type: 'text',
                                        text: output
                                    }]
                                };
                            default:
                                throw createError(
                                    ErrorCodes.INVALID_INPUT,
                                    `Unknown tool: ${name}`,
                                    'handleToolCall'
                                );
                            }
                        } catch (error) {
                            // Emit tool error event
                            eventManager.emitErrorEvent({
                                type: EventTypes.SYSTEM_ERROR,
                                timestamp: Date.now(),
                                error: toSerializableError(error),
                                context: {
                                    component: 'ToolHandler',
                                    operation: name,
                                    args
                                }
                            });

                            // Format error response
                            const errorMessage = error instanceof BaseError 
                                ? error.getUserMessage()
                                : String(error);

                            return {
                                content: [{
                                    type: 'text',
                                    text: JSON.stringify({
                                        error: errorMessage,
                                        code: error instanceof BaseError ? error.code : ErrorCodes.INTERNAL_ERROR
                                    }, null, 2)
                                }],
                                isError: true
                            };
                        }
                    },
                    getStorageMetrics: async () => await storage.getMetrics(),
                    clearCaches: async () => {
                        await taskManager.clearCaches();
                    },
                    cleanup: async () => {
                        await taskManager.close();
                    }
                }
            );
            }
        } catch (error) {
            // Emit system error event
            eventManager.emitSystemEvent({
                type: EventTypes.SYSTEM_ERROR,
                timestamp: Date.now(),
                metadata: {
                    error: toSerializableError(error)
                }
            });

            logger.error('Failed to start server', error);
            process.exit(1);
        }

        // Log successful startup
        logger.info('Server initialization completed successfully');

        // Store cleanup handlers for proper removal
        const cleanupHandlers = new Map<string, () => Promise<void>>();

        // Handle graceful shutdown with proper cleanup order and timeouts
        const shutdown = async (reason: string = 'graceful_shutdown', timeout: number = 30000) => {
            logger.info('Initiating shutdown', { reason });
            try {
                // Emit system shutdown event
                eventManager.emitSystemEvent({
                    type: EventTypes.SYSTEM_SHUTDOWN,
                    timestamp: Date.now(),
                    metadata: { reason }
                });

                // Create shutdown promise with timeout
                const shutdownPromise = (async () => {
                    try {
                        // First stop accepting new requests
                        if (server) {
                            await Promise.race([
                                server.shutdown(),
                                new Promise((_, reject) => setTimeout(() => reject(new Error('Server shutdown timeout')), 5000))
                            ]);
                        }

                        // Then cleanup task manager and its resources
                        if (taskManager) {
                            await Promise.race([
                                taskManager.cleanup(),
                                new Promise((_, reject) => setTimeout(() => reject(new Error('Task manager cleanup timeout')), 10000))
                            ]);
                        }

                        // Finally close storage
                        if (storage) {
                            await Promise.race([
                                storage.close(),
                                new Promise((_, reject) => setTimeout(() => reject(new Error('Storage close timeout')), 5000))
                            ]);
                        }

                        // Clear event manager and remove all handlers
                        eventManager.removeAllListeners();
                        cleanupHandlers.forEach((handler, signal) => {
                            process.removeListener(signal, handler);
                        });
                        cleanupHandlers.clear();

                        // Force final cleanup
                        if (global.gc) {
                            global.gc();
                        }

                        // Final logging before exit
                        logger.info('Server shutdown completed', { reason });
                    } catch (cleanupError) {
                        logger.error('Error during component cleanup', cleanupError);
                        throw cleanupError; // Re-throw to trigger force exit
                    }
                })();

                // Wait for shutdown with timeout
                await Promise.race([
                    shutdownPromise,
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Shutdown timeout')), timeout))
                ]);

                // Clean exit
                process.nextTick(() => process.exit(0));
            } catch (error) {
                logger.error('Error during shutdown', error);
                // Force exit after error
                process.nextTick(() => process.exit(1));
            }
        };

        // Register shutdown handlers with proper cleanup
        const registerShutdownHandler = (signal: string, handler: () => Promise<void>) => {
            cleanupHandlers.set(signal, handler);
            process.on(signal, handler);
        };

        // Only register shutdown handlers after successful initialization
        if (server && storage && taskManager) {
            // Handle various shutdown signals with Windows compatibility
            registerShutdownHandler('SIGINT', () => shutdown('SIGINT'));
            registerShutdownHandler('SIGTERM', () => shutdown('SIGTERM'));
            registerShutdownHandler('beforeExit', () => shutdown('beforeExit'));
            
            // Platform-specific signal handling
            if (PlatformCapabilities.isWindows()) {
                const readline = (await import('readline')).createInterface({
                    input: process.stdin,
                    output: process.stdout
                });
                
                readline.on('SIGINT', () => {
                    process.emit('SIGINT');
                });

                // Handle Windows-specific process termination
                registerShutdownHandler('SIGHUP', () => shutdown('SIGHUP'));
                registerShutdownHandler('SIGBREAK', () => shutdown('SIGBREAK'));

                // Ensure readline interface is cleaned up
                cleanupHandlers.set('cleanup-readline', async () => {
                    readline.close();
                });
            }

            // Handle uncaught errors and rejections
            const errorHandler = (error: Error) => {
                logger.error('Uncaught error', error);
                shutdown('uncaught_error', 5000).catch(() => process.exit(1));
            };

            process.on('uncaughtException', errorHandler);
            process.on('unhandledRejection', errorHandler);
        }
    } catch (error) {
        // Don't log to console - MCP will handle the error
        process.exit(1);
    }
}

main().catch((error: Error) => {
    // Get logger instance if available
    let logger;
    try {
        logger = Logger.getInstance();
    } catch {
        // Don't log to console - MCP will handle the error
        process.exit(1);
    }

    // Log error and exit
    logger.error('Failed to start server', { error });
    process.exit(1);
});
