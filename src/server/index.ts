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
import { Logger } from '../logging/index.js';
import { ConfigManager } from '../config/index.js';
import { RateLimiter } from './rate-limiter.js';
import { HealthMonitor } from './health-monitor.js';
import { MetricsCollector } from './metrics-collector.js';
import { RequestTracer } from './request-tracer.js';

export interface ServerConfig {
    name: string;
    version: string;
    maxRequestsPerMinute?: number;
    requestTimeout?: number;
    shutdownTimeout?: number;
}

interface ServerMetrics {
    requestCount: number;
    errorCount: number;
    avgResponseTime: number;
}

/**
 * AtlasServer class encapsulates MCP server functionality
 * Handles server lifecycle, transport, and error management
 */
export class AtlasServer {
    private server: Server;
    private logger: Logger;
    private rateLimiter: RateLimiter;
    private healthMonitor: HealthMonitor;
    private metricsCollector: MetricsCollector;
    private requestTracer: RequestTracer;
    private isShuttingDown: boolean = false;
    private activeRequests: Set<string> = new Set();

    /**
     * Creates a new AtlasServer instance
     */
    constructor(
        private readonly config: ServerConfig,
        private readonly toolHandler: {
            listTools: () => Promise<any>;
            handleToolCall: (request: any) => Promise<any>;
        }
    ) {
        this.logger = Logger.getInstance().child({ component: 'AtlasServer' });
        
        // Initialize components
        this.rateLimiter = new RateLimiter(config.maxRequestsPerMinute || 600);
        this.healthMonitor = new HealthMonitor();
        this.metricsCollector = new MetricsCollector();
        this.requestTracer = new RequestTracer();

        // Initialize MCP server
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
        this.setupHealthCheck();
    }

    /**
     * Sets up error handling for the server
     */
    private setupErrorHandling(): void {
        this.server.onerror = (error) => {
            this.metricsCollector.incrementErrorCount();
            
            const errorContext = {
                timestamp: new Date().toISOString(),
                error: error instanceof Error ? {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                } : error,
                metrics: this.getMetrics()
            };

            this.logger.error('[MCP Error]', errorContext);
        };

        process.on('SIGINT', async () => {
            await this.shutdown();
        });

        process.on('SIGTERM', async () => {
            await this.shutdown();
        });

        process.on('unhandledRejection', (reason, promise) => {
            this.logger.error('Unhandled Rejection:', {
                reason,
                promise,
                metrics: this.getMetrics()
            });
        });

        process.on('uncaughtException', (error) => {
            this.logger.error('Uncaught Exception:', {
                error,
                metrics: this.getMetrics()
            });
            this.shutdown().finally(() => process.exit(1));
        });
    }

    /**
     * Sets up tool request handlers with middleware
     */
    private setupToolHandlers(): void {
        // Handler for listing available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async (request) => {
            const requestId = this.requestTracer.startRequest();
            
            try {
                await this.rateLimiter.checkLimit();
                this.activeRequests.add(requestId);
                
                const startTime = Date.now();
                const response = await this.toolHandler.listTools();
                
                this.metricsCollector.recordResponseTime(Date.now() - startTime);
                return response;
            } catch (error) {
                this.handleToolError(error);
            } finally {
                this.activeRequests.delete(requestId);
                this.requestTracer.endRequest(requestId);
            }
        });

        // Handler for tool execution requests
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const requestId = this.requestTracer.startRequest();
            
            try {
                if (this.isShuttingDown) {
                    throw new McpError(
                        ErrorCode.InternalError,
                        'Server is shutting down'
                    );
                }

                await this.rateLimiter.checkLimit();
                this.activeRequests.add(requestId);
                
                const startTime = Date.now();
                const response = await Promise.race([
                    this.toolHandler.handleToolCall(request),
                    this.createTimeout(this.config.requestTimeout || 30000)
                ]);
                
                this.metricsCollector.recordResponseTime(Date.now() - startTime);
                return response;
            } catch (error) {
                this.handleToolError(error);
            } finally {
                this.activeRequests.delete(requestId);
                this.requestTracer.endRequest(requestId);
            }
        });
    }

    /**
     * Sets up health check endpoint
     */
    private setupHealthCheck(): void {
        setInterval(() => {
            const health = this.healthMonitor.check({
                activeRequests: this.activeRequests.size,
                metrics: this.getMetrics(),
                rateLimiter: this.rateLimiter.getStatus()
            });

            if (!health.healthy) {
                this.logger.warn('Health check failed:', health);
            }
        }, 30000);
    }

    /**
     * Creates a timeout promise
     */
    private createTimeout(ms: number): Promise<never> {
        return new Promise((_, reject) => {
            setTimeout(() => {
                reject(new McpError(
                    ErrorCode.InternalError,
                    `Request timed out after ${ms}ms`
                ));
            }, ms);
        });
    }

    /**
     * Transforms errors into McpErrors
     */
    private handleToolError(error: unknown): never {
        this.metricsCollector.incrementErrorCount();

        if (error instanceof McpError) {
            throw error;
        }

        this.logger.error('Unexpected error in tool handler:', {
            error,
            metrics: this.getMetrics()
        });
        
        throw new McpError(
            ErrorCode.InternalError,
            error instanceof Error ? error.message : 'An unexpected error occurred',
            error instanceof Error ? error.stack : undefined
        );
    }

    /**
     * Gets current server metrics
     */
    private getMetrics(): ServerMetrics {
        return {
            requestCount: this.metricsCollector.getRequestCount(),
            errorCount: this.metricsCollector.getErrorCount(),
            avgResponseTime: this.metricsCollector.getAverageResponseTime()
        };
    }

    /**
     * Starts the server
     */
    async run(): Promise<void> {
        try {
            const transport = new StdioServerTransport();
            await this.server.connect(transport);
            
            this.logger.info(`${this.config.name} v${this.config.version} running on stdio`, {
                metrics: this.getMetrics()
            });
        } catch (error) {
            this.logger.error('Failed to start server:', {
                error,
                metrics: this.getMetrics()
            });
            throw error;
        }
    }

    /**
     * Gracefully shuts down the server
     */
    async shutdown(): Promise<void> {
        if (this.isShuttingDown) {
            return;
        }

        this.isShuttingDown = true;
        this.logger.info('Starting graceful shutdown...');

        try {
            // Wait for active requests to complete
            const timeout = this.config.shutdownTimeout || 30000;
            const shutdownStart = Date.now();

            while (this.activeRequests.size > 0) {
                if (Date.now() - shutdownStart > timeout) {
                    this.logger.warn('Shutdown timeout reached, forcing shutdown', {
                        activeRequests: this.activeRequests.size
                    });
                    break;
                }
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            await this.server.close();
            this.logger.info('Server closed successfully', {
                metrics: this.getMetrics()
            });
        } catch (error) {
            this.logger.error('Error during shutdown:', {
                error,
                metrics: this.getMetrics()
            });
            throw error;
        }
    }
}


