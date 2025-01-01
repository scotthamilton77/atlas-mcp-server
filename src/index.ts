import { Logger } from './logging/index.js';
import { TaskManager } from './task/manager/task-manager.js';
import { createStorage } from './storage/index.js';
import { AtlasServer } from './server/index.js';
import { EventManager } from './events/event-manager.js';
import { ConfigManager } from './config/index.js';
import { join } from 'path';
import { PlatformPaths, PlatformCapabilities, ProcessManager } from './utils/platform-utils.js';
import { LogLevels } from './types/logging.js';
import { ToolHandler } from './tools/handler.js';

async function main(): Promise<void> {
  let logger: Logger | undefined;
  let server: AtlasServer | undefined;

  try {
    // Get platform-agnostic paths
    const documentsDir = PlatformPaths.getDocumentsDir();
    const baseDir =
      process.env.ATLAS_STORAGE_DIR || join(documentsDir, 'Cline', 'mcp-workspace', 'ATLAS');
    const logDir = join(baseDir, 'logs');
    const dataDir = join(baseDir, 'data');

    // Create directories with platform-appropriate permissions
    await PlatformCapabilities.ensureDirectoryPermissions(logDir, 0o755);
    await PlatformCapabilities.ensureDirectoryPermissions(dataDir, 0o755);

    // Initialize logger with comprehensive file logging
    logger = await Logger.initialize({
      console: false,
      file: true,
      minLevel: LogLevels.DEBUG,
      logDir,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10,
      noColors: true,
    });

    // Set logger for process manager
    ProcessManager.setLogger(logger);

    try {
      // Log detailed startup information
      logger.info('Atlas MCP Server starting up', {
        component: 'Server',
        context: {
          operation: 'startup',
          timestamp: Date.now(),
          paths: {
            base: baseDir,
            logs: logDir,
            data: dataDir,
          },
          environment: process.env.NODE_ENV || 'development',
          nodeVersion: process.version,
          platform: process.platform,
          pid: process.pid,
          memory: {
            max: PlatformCapabilities.getMaxMemory(),
            current: process.memoryUsage(),
          },
        },
      });

      // Initialize event manager
      const eventManager = await EventManager.initialize();

      // Update logger with event manager
      logger.setEventManager(eventManager);

      // Initialize config manager
      const configManager = await ConfigManager.initialize({
        logging: {
          console: false,
          file: true,
          level: LogLevels.DEBUG,
          maxFiles: 10,
          maxSize: 10 * 1024 * 1024,
          dir: logDir,
        },
        storage: {
          baseDir: dataDir,
          name: process.env.ATLAS_STORAGE_NAME || 'atlas-tasks',
          connection: {
            maxRetries: 3,
            retryDelay: 1000,
            busyTimeout: 5000,
          },
          performance: {
            checkpointInterval: 30000,
            cacheSize: Math.floor(PlatformCapabilities.getMaxMemory() / (1024 * 1024)), // Convert to MB
            mmapSize: 32 * 1024 * 1024,
            pageSize: 4096,
          },
        },
      });

      const config = configManager.getConfig();

      // Initialize storage
      const storage = await createStorage({
        ...config.storage!,
        baseDir: dataDir,
      });

      // Register storage cleanup
      ProcessManager.registerCleanupHandler(async () => {
        await storage.close();
      });

      // Initialize task manager
      const taskManager = await TaskManager.getInstance(storage);

      // Register task manager cleanup
      ProcessManager.registerCleanupHandler(async () => {
        await taskManager.close();
      });

      // Initialize tool handler
      const toolHandler = new ToolHandler(taskManager);

      // Run maintenance
      await storage.vacuum();
      await storage.analyze();
      await storage.checkpoint();

      // Initialize server
      server = await AtlasServer.getInstance(
        {
          name: 'atlas-mcp-server',
          version: '1.2.0',
          maxRequestsPerMinute: 600,
          requestTimeout: 30000,
          shutdownTimeout: 5000,
          health: {
            checkInterval: 300000,
            failureThreshold: 5,
            shutdownGracePeriod: 10000,
            clientPingTimeout: 300000,
          },
        },
        {
          listTools: async () => toolHandler.listTools(),
          handleToolCall: async request => {
            if (
              !request.params?.name ||
              typeof request.params.name !== 'string' ||
              !request.params.arguments
            ) {
              throw new Error('Invalid tool call request parameters');
            }
            return toolHandler.handleToolCall({
              params: {
                name: request.params.name,
                arguments: request.params.arguments as Record<string, unknown>,
              },
            });
          },
          getStorageMetrics: async () => storage.getMetrics(),
          clearCaches: async () => taskManager.clearCaches(),
          cleanup: ProcessManager.cleanup,
        }
      );

      // Register server cleanup
      ProcessManager.registerCleanupHandler(async () => {
        await server?.shutdown();
      });

      // Register event manager cleanup
      ProcessManager.registerCleanupHandler(async () => {
        await eventManager.shutdown();
      });

      // Set up signal handlers
      ProcessManager.setupSignalHandlers();

      // Log successful startup
      logger.info('Server initialization completed successfully', {
        component: 'Server',
        status: 'ready',
      });
    } catch (error) {
      // Log initialization error before rethrowing
      logger.error('Failed to initialize server components:', error);
      throw error;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Failed to start server:', message);

    if (logger) {
      logger.error('Fatal startup error:', {
        error: error instanceof Error ? error : { message },
        stack: error instanceof Error ? error.stack : undefined,
      });
    }

    // Ensure cleanup runs even on startup failure
    if (server) {
      await server.shutdown().catch(console.error);
    }
    await ProcessManager.cleanup().catch(console.error);

    process.exit(1);
  }
}

// Start the server
main().catch(error => {
  console.error('Unhandled error in main:', error);
  process.exit(1);
});
