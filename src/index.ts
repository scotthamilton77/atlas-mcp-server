/**
 * Atlas MCP Server Entry Point
 * 
 * Initializes and exports the Atlas MCP server functionality:
 * - Task management
 * - MCP server integration
 * - Tool handling
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    ListToolsRequestSchema,
    CallToolRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { StorageManager } from './storage/index.js';
import { TaskManager } from './task-manager.js';
import { ToolHandler } from './tools/handler.js';
import { Logger } from './logging/index.js';
import { ConfigManager, defaultConfig } from './config/index.js';

/**
 * Atlas MCP Server class
 * Provides task management capabilities through the Model Context Protocol
 */
export class AtlasMcpServer {
    private server: Server;
    private storage: StorageManager;
    private taskManager: TaskManager;
    private toolHandler: ToolHandler;
    private logger: Logger;

    constructor() {
        // Initialize configuration
        const storageDir = process.env.TASK_STORAGE_DIR;
        if (!storageDir) {
            throw new Error('TASK_STORAGE_DIR environment variable must be set');
        }

        ConfigManager.initialize({
            storage: {
                dir: storageDir,
                sessionId: crypto.randomUUID()
            }
        });

        // Initialize components
        const config = ConfigManager.getInstance().getConfig();
        this.storage = new StorageManager({
            baseDir: config.storage.dir,
            sessionId: config.storage.sessionId
        });
        this.taskManager = new TaskManager(this.storage);
        this.toolHandler = new ToolHandler(this.taskManager);
        this.logger = Logger.getInstance().child({ component: 'AtlasMcpServer' });

        // Initialize MCP server
        this.server = new Server(
            {
                name: 'atlas-mcp-server',
                version: '0.1.0',
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        // Set up error handling
        this.server.onerror = this.handleError.bind(this);
    }

    /**
     * Initializes the server and all components
     */
    async initialize(): Promise<void> {
        try {
            // Initialize storage
            await this.storage.initialize();

            // Initialize task manager
            await this.taskManager.initialize();

            // Set up request handlers
            this.setupRequestHandlers();

            this.logger.info('Atlas MCP Server initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize server', error);
            throw error;
        }
    }

    /**
     * Starts the server
     */
    async start(): Promise<void> {
        try {
            // Initialize components
            await this.initialize();

            // Connect transport
            const transport = new StdioServerTransport();
            await this.server.connect(transport);

            this.logger.info('Atlas MCP Server started');
        } catch (error) {
            this.logger.error('Failed to start server', error);
            throw error;
        }
    }

    /**
     * Sets up MCP request handlers
     */
    private setupRequestHandlers(): void {
        // List available tools
        this.server.setRequestHandler(
            ListToolsRequestSchema,
            async () => this.toolHandler.listTools()
        );

        // Handle tool calls
        this.server.setRequestHandler(
            CallToolRequestSchema,
            async (request) => this.toolHandler.handleToolCall(request)
        );
    }

    /**
     * Handles server errors
     */
    private handleError(error: unknown): void {
        this.logger.error('Server error', error);
    }

    /**
     * Stops the server
     */
    async stop(): Promise<void> {
        try {
            await this.server.close();
            this.logger.info('Atlas MCP Server stopped');
        } catch (error) {
            this.logger.error('Failed to stop server', error);
            throw error;
        }
    }
}

// Export types
export * from './types/index.js';

// Create and start server if this is the main module
if (import.meta.url === new URL(import.meta.url).href) {
    try {
        // Create and start server
        const server = new AtlasMcpServer();
        await server.start();

        // Handle shutdown
        process.on('SIGINT', async () => {
            await server.stop();
            process.exit(0);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}
