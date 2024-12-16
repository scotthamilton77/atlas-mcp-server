/**
 * Server module for Atlas MCP Server
 * Handles server initialization, transport setup, and graceful shutdown
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ErrorCode,
    ListToolsRequestSchema,
    McpError,
} from '@modelcontextprotocol/sdk/types.js';

export interface ServerConfig {
    name: string;
    version: string;
}

/**
 * AtlasServer class encapsulates MCP server functionality
 * Handles server lifecycle, transport, and error management
 */
export class AtlasServer {
    private server: Server;

    /**
     * Creates a new AtlasServer instance
     * @param config Server configuration
     * @param toolHandler Handler for tool-related operations
     */
    constructor(
        private readonly config: ServerConfig,
        private readonly toolHandler: {
            listTools: () => Promise<any>;
            handleToolCall: (request: any) => Promise<any>;
        }
    ) {
        this.server = new Server(
            {
                name: config.name,
                version: config.version,
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        this.setupErrorHandling();
        this.setupToolHandlers();
    }

    /**
     * Sets up error handling for the server
     * Includes graceful shutdown on SIGINT
     */
    private setupErrorHandling(): void {
        this.server.onerror = (error) => {
            console.error('[MCP Error]', {
                timestamp: new Date().toISOString(),
                error: error instanceof Error ? {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                } : error
            });
        };

        process.on('SIGINT', async () => {
            try {
                await this.close();
                process.exit(0);
            } catch (error) {
                console.error('Error during shutdown:', error);
                process.exit(1);
            }
        });
    }

    /**
     * Sets up tool request handlers
     * Delegates actual tool handling to the toolHandler
     */
    private setupToolHandlers(): void {
        // Handler for listing available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            try {
                return await this.toolHandler.listTools();
            } catch (error) {
                throw this.handleToolError(error);
            }
        });

        // Handler for tool execution requests
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            try {
                return await this.toolHandler.handleToolCall(request);
            } catch (error) {
                throw this.handleToolError(error);
            }
        });
    }

    /**
     * Transforms errors into McpErrors with appropriate error codes
     * @param error The error to handle
     * @returns McpError with appropriate error code and message
     */
    private handleToolError(error: unknown): McpError {
        if (error instanceof McpError) {
            return error;
        }

        console.error('Unexpected error in tool handler:', error);
        
        return new McpError(
            ErrorCode.InternalError,
            error instanceof Error ? error.message : 'An unexpected error occurred',
            error instanceof Error ? error.stack : undefined
        );
    }

    /**
     * Starts the server with the specified transport
     * @returns Promise that resolves when server is running
     */
    async run(): Promise<void> {
        try {
            const transport = new StdioServerTransport();
            await this.server.connect(transport);
            console.error(`${this.config.name} v${this.config.version} running on stdio`);
        } catch (error) {
            console.error('Failed to start server:', error);
            throw error;
        }
    }

    /**
     * Gracefully closes the server
     * @returns Promise that resolves when server is closed
     */
    async close(): Promise<void> {
        try {
            await this.server.close();
            console.error('Server closed successfully');
        } catch (error) {
            console.error('Error closing server:', error);
            throw error;
        }
    }
}
