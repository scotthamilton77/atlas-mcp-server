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
  Request,
} from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '../logging/index.js';
import { RateLimiter } from './rate-limiter.js';
import { HealthMonitor, ComponentStatus } from './health-monitor.js';
import { MetricsCollector, MetricEvent } from './metrics-collector.js';
import { RequestTracer, TraceEvent } from './request-tracer.js';

export interface ServerConfig {
  name: string;
  version: string;
  maxRequestsPerMinute: number;
  requestTimeout: number;
  shutdownTimeout: number;
  health?: {
    checkInterval?: number;
    failureThreshold?: number;
    shutdownGracePeriod?: number;
    clientPingTimeout?: number;
  };
}

export interface ToolHandler {
  listTools: () => Promise<any>;
  handleToolCall: (request: Request) => Promise<any>;
  getStorageMetrics: () => Promise<any>;
  clearCaches?: () => Promise<void>;
  cleanup?: () => Promise<void>;
}

/**
 * AtlasServer class encapsulates MCP server functionality
 */
export class AtlasServer {
  private static instance: AtlasServer;
  private static isInitializing: boolean = false;
  private static serverPromise: Promise<void> | null = null;
  private static logger?: Logger;

  private server!: Server;
  private readonly rateLimiter: RateLimiter;
  private readonly healthMonitor: HealthMonitor;
  private readonly metricsCollector: MetricsCollector;
  private readonly requestTracer: RequestTracer;
  private readonly toolHandler: ToolHandler;
  private readonly config: ServerConfig;
  private readonly activeRequests: Set<string> = new Set();
  private readonly MAX_MEMORY_USAGE = 1024 * 1024 * 1024; // 1GB threshold
  private readonly MEMORY_CHECK_INTERVAL = 30000; // 30 seconds

  private isShuttingDown: boolean = false;
  private isInitialized: boolean = false;
  private memoryMonitor?: NodeJS.Timeout;
  private healthCheckInterval?: NodeJS.Timeout;

  private static initLogger(): void {
    if (!AtlasServer.logger) {
      try {
        AtlasServer.logger = Logger.getInstance().child({ component: 'AtlasServer' });
      } catch {
        // Logger not initialized yet, which is fine
      }
    }
  }

  public static async getInstance(
    config: ServerConfig,
    toolHandler: ToolHandler
  ): Promise<AtlasServer> {
    AtlasServer.initLogger();

    if (AtlasServer.instance?.isInitialized) {
      if (AtlasServer.logger) {
        AtlasServer.logger.debug('Returning existing server instance');
      }
      return AtlasServer.instance;
    }

    if (AtlasServer.isInitializing) {
      if (AtlasServer.logger) {
        AtlasServer.logger.debug('Server initialization in progress, waiting...');
      }
      await AtlasServer.serverPromise;
      return AtlasServer.instance;
    }

    AtlasServer.isInitializing = true;
    AtlasServer.serverPromise = (async () => {
      try {
        if (AtlasServer.logger) {
          AtlasServer.logger.info('Starting server initialization');
        }
        if (!AtlasServer.instance) {
          AtlasServer.instance = new AtlasServer(config, toolHandler);
        }
        await AtlasServer.instance.initializeServer();
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to initialize AtlasServer: ${error instanceof Error ? error.message : String(error)}`
        );
      } finally {
        AtlasServer.isInitializing = false;
        AtlasServer.serverPromise = null;
      }
    })();

    await AtlasServer.serverPromise;
    return AtlasServer.instance;
  }

  private constructor(config: ServerConfig, toolHandler: ToolHandler) {
    this.config = config;
    this.toolHandler = toolHandler;

    // Initialize components
    this.rateLimiter = new RateLimiter(config.maxRequestsPerMinute || 600);
    this.healthMonitor = new HealthMonitor({
      checkInterval: config.health?.checkInterval || 300000,
      failureThreshold: config.health?.failureThreshold || 5,
      shutdownGracePeriod: config.health?.shutdownGracePeriod || 10000,
      clientPingTimeout: config.health?.clientPingTimeout || 300000,
    });
    this.metricsCollector = new MetricsCollector();
    this.requestTracer = new RequestTracer();
  }

  private async initializeServer(): Promise<void> {
    if (this.isInitialized) {
      if (AtlasServer.logger) {
        AtlasServer.logger.debug('Server already initialized');
      }
      return;
    }

    try {
      // Get available tools with retries
      let tools = [];
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        try {
          const result = await this.toolHandler.listTools();
          tools = result.tools;
          if (tools.length > 0) {
            break;
          }
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
        } catch (error) {
          if (retryCount === maxRetries - 1) {
            throw error;
          }
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
        }
      }

      // Initialize MCP server with tools
      const toolCapabilities: Record<string, Record<string, never>> = {};
      for (const tool of tools) {
        toolCapabilities[tool.name] = {};
      }

      this.server = new Server(
        {
          name: this.config.name,
          version: this.config.version,
        },
        {
          capabilities: {
            tools: toolCapabilities,
          },
        }
      );

      this.setupErrorHandling();
      this.setupToolHandlers();
      this.setupHealthCheck();
      this.setupMemoryMonitoring();

      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      this.isInitialized = true;
      if (AtlasServer.logger) {
        AtlasServer.logger.info(`${this.config.name} v${this.config.version} running on stdio`, {
          metrics: this.metricsCollector.getMetrics(),
          availableTools: Object.keys(toolCapabilities),
        });
      }
    } catch (error) {
      if (AtlasServer.logger) {
        AtlasServer.logger.error('Failed to start server:', {
          error,
          metrics: this.metricsCollector.getMetrics(),
        });
      }
      throw error;
    }
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error: unknown) => {
      const metricEvent: MetricEvent = {
        type: 'error',
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      };
      this.metricsCollector.recordError(metricEvent);

      const errorContext = {
        timestamp: new Date().toISOString(),
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : error,
        metrics: this.metricsCollector.getMetrics(),
      };

      if (AtlasServer.logger) {
        AtlasServer.logger.error('[MCP Error]', errorContext);
      }
    };

    process.on('SIGINT', async () => {
      await this.shutdown();
    });

    process.on('SIGTERM', async () => {
      await this.shutdown();
    });

    process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
      if (AtlasServer.logger) {
        AtlasServer.logger.error('Unhandled Rejection:', {
          reason,
          promise,
          metrics: this.metricsCollector.getMetrics(),
        });
      }
    });

    process.on('uncaughtException', (error: Error) => {
      const errorMessage =
        error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : error && typeof error === 'object'
            ? JSON.stringify(error)
            : String(error);

      if (AtlasServer.logger) {
        AtlasServer.logger.error('Uncaught Exception:', {
          error: errorMessage,
          metrics: this.metricsCollector.getMetrics(),
        });
      }
      this.shutdown().finally(() => process.exit(1));
    });
  }

  private setupToolHandlers(): void {
    // Handler for listing available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const traceEvent: TraceEvent = {
        type: 'list_tools',
        timestamp: Date.now(),
      };

      try {
        await this.rateLimiter.checkLimit();
        this.activeRequests.add(requestId);

        // Record client activity
        this.recordClientActivity();

        this.requestTracer.startTrace(requestId, traceEvent);
        const response = await this.toolHandler.listTools();

        const metricEvent: MetricEvent = {
          type: 'list_tools',
          timestamp: Date.now(),
          duration: Date.now() - traceEvent.timestamp,
        };
        this.metricsCollector.recordSuccess(metricEvent);

        return response;
      } catch (error) {
        this.handleToolError(error);
        throw error; // Ensure error propagation
      } finally {
        this.activeRequests.delete(requestId);
        this.requestTracer.endTrace(requestId, {
          ...traceEvent,
          timestamp: Date.now(),
        });
      }
    });

    // Handler for tool execution requests
    this.server.setRequestHandler(CallToolRequestSchema, async (request: Request) => {
      if (!request.params?.name) {
        throw new McpError(ErrorCode.InvalidRequest, 'Missing tool name');
      }
      const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const traceEvent: TraceEvent = {
        type: 'tool_execution',
        tool: String(request.params.name),
        timestamp: Date.now(),
      };

      try {
        if (this.isShuttingDown) {
          throw new McpError(ErrorCode.InternalError, 'Server is shutting down');
        }

        await this.rateLimiter.checkLimit();
        this.activeRequests.add(requestId);

        // Record client activity
        this.recordClientActivity();

        this.requestTracer.startTrace(requestId, traceEvent);
        const response = await Promise.race([
          this.toolHandler.handleToolCall(request),
          this.createTimeout(this.config.requestTimeout || 30000),
        ]);

        const metricEvent: MetricEvent = {
          type: 'tool_execution',
          tool: String(request.params.name),
          timestamp: Date.now(),
          duration: Date.now() - traceEvent.timestamp,
        };
        this.metricsCollector.recordSuccess(metricEvent);

        return response;
      } catch (error) {
        this.handleToolError(error);
        throw error; // Ensure error propagation
      } finally {
        this.activeRequests.delete(requestId);
        this.requestTracer.endTrace(requestId, {
          ...traceEvent,
          timestamp: Date.now(),
        });
      }
    });
  }

  private setupHealthCheck(): void {
    // Start health monitor with shutdown callback
    this.healthMonitor.start(async () => {
      if (AtlasServer.logger) {
        AtlasServer.logger.info('Health monitor triggered shutdown');
      }
      await this.shutdown();
    });

    // Set up periodic status checks with stored interval reference
    this.healthCheckInterval = setInterval(async () => {
      try {
        const status: ComponentStatus = {
          storage: await this.toolHandler.getStorageMetrics(),
          rateLimiter: this.rateLimiter.getStatus(),
          metrics: this.metricsCollector.getMetrics(),
        };
        await this.healthMonitor.check(status);
      } catch (error) {
        if (AtlasServer.logger) {
          AtlasServer.logger.error('Health check error:', { error });
        }
      }
    }, this.config.health?.checkInterval || 300000);
  }

  private setupMemoryMonitoring(): void {
    this.memoryMonitor = setInterval(() => {
      const memUsage = process.memoryUsage();

      // Log memory stats only when above 50% usage
      if (memUsage.heapUsed / memUsage.heapTotal > 0.5 && AtlasServer.logger) {
        AtlasServer.logger.debug('Memory usage:', {
          heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
          rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
        });
      }

      // Only trigger cleanup at 85% usage instead of 70%
      if (
        memUsage.heapUsed > this.MAX_MEMORY_USAGE ||
        memUsage.heapUsed / memUsage.heapTotal > 0.85
      ) {
        if (AtlasServer.logger) {
          AtlasServer.logger.warn('High memory usage detected, triggering cleanup', {
            heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
            threshold: `${Math.round(this.MAX_MEMORY_USAGE / 1024 / 1024)}MB`,
          });
        }

        // Clear caches first to free up memory
        this.toolHandler
          .clearCaches?.()
          .then(() => {
            // Force garbage collection after cache clear
            if (global.gc) {
              if (AtlasServer.logger) {
                AtlasServer.logger.info('Forcing garbage collection');
              }
              global.gc();

              // Check memory again after GC
              const afterGC = process.memoryUsage();
              if (afterGC.heapUsed > this.MAX_MEMORY_USAGE) {
                if (AtlasServer.logger) {
                  AtlasServer.logger.warn('Memory still high after GC, may need restart', {
                    heapUsed: `${Math.round(afterGC.heapUsed / 1024 / 1024)}MB`,
                    threshold: `${Math.round(this.MAX_MEMORY_USAGE / 1024 / 1024)}MB`,
                  });
                }
              }
            }
          })
          .catch(error => {
            if (AtlasServer.logger) {
              AtlasServer.logger.error('Error during cache clear:', error);
            }
          });
      }
    }, this.MEMORY_CHECK_INTERVAL);
  }

  private recordClientActivity(): void {
    this.healthMonitor.recordClientPing();
  }

  private createTimeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new McpError(ErrorCode.InternalError, `Request timed out after ${ms}ms`));
      }, ms);
    });
  }

  private handleToolError(error: unknown): void {
    const errorMessage =
      error instanceof Error
        ? error.message
        : error && typeof error === 'object'
          ? JSON.stringify(error)
          : String(error);

    const metricEvent: MetricEvent = {
      type: 'error',
      timestamp: Date.now(),
      error: errorMessage,
    };
    this.metricsCollector.recordError(metricEvent);

    if (error instanceof McpError) {
      return;
    }

    const errorDetails =
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : error && typeof error === 'object'
          ? JSON.stringify(error)
          : String(error);

    if (AtlasServer.logger) {
      AtlasServer.logger.error('Unexpected error in tool handler:', {
        error: errorDetails,
        metrics: this.metricsCollector.getMetrics(),
      });
    }

    throw new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : 'An unexpected error occurred',
      error instanceof Error ? error.stack : undefined
    );
  }

  public async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    if (AtlasServer.logger) {
      AtlasServer.logger.info('Starting graceful shutdown...');
    }

    try {
      // Clear all intervals first
      if (this.memoryMonitor) {
        clearInterval(this.memoryMonitor);
        this.memoryMonitor = undefined;
      }
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = undefined;
      }

      // Wait for active requests to complete
      const timeout = this.config.shutdownTimeout || 30000;
      const shutdownStart = Date.now();

      while (this.activeRequests.size > 0) {
        if (Date.now() - shutdownStart > timeout) {
          if (AtlasServer.logger) {
            AtlasServer.logger.warn('Shutdown timeout reached, forcing shutdown', {
              activeRequests: this.activeRequests.size,
            });
          }
          // Clear any remaining requests
          this.activeRequests.clear();
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Clean up resources
      await this.toolHandler.cleanup?.();

      // Close server
      await this.server.close();

      // Force final garbage collection
      if (global.gc) {
        global.gc();
      }

      if (AtlasServer.logger) {
        AtlasServer.logger.info('Server closed successfully', {
          metrics: this.metricsCollector.getMetrics(),
        });
      }
    } catch (error) {
      if (AtlasServer.logger) {
        AtlasServer.logger.error('Error during shutdown:', {
          error,
          metrics: this.metricsCollector.getMetrics(),
        });
      }
      throw error;
    }
  }
}
