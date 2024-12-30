import { Logger } from './logging/index.js';
import { TaskManager } from './task/manager/task-manager.js';
import { createStorage } from './storage/index.js';
import { AtlasServer } from './server/index.js';
import { EventManager } from './events/event-manager.js';
import { ConfigManager } from './config/index.js';
import { join } from 'path';
import { promises as fs } from 'fs';
import { PlatformPaths, PlatformCapabilities } from './utils/platform-utils.js';
import { LogLevels } from './types/logging.js';
import { ToolHandler } from './tools/handler.js';

async function main(): Promise<void> {
  try {
    // Get platform-agnostic paths
    const documentsDir = PlatformPaths.getDocumentsDir();
    const logDir = process.env.ATLAS_STORAGE_DIR
      ? join(process.env.ATLAS_STORAGE_DIR, 'logs')
      : join(documentsDir, 'Cline', 'mcp-workspace', 'ATLAS', 'logs');

    // Create log directory with platform-appropriate permissions
    await fs.mkdir(logDir, {
      recursive: true,
      mode: PlatformCapabilities.getFileMode(0o755),
    });

    // Initialize logger with comprehensive file logging
    const logger = await Logger.initialize({
      console: false, // Disable console logging
      file: true, // Enable file logging
      minLevel: LogLevels.DEBUG, // Use enum constant
      logDir: logDir,
      maxFileSize: 10 * 1024 * 1024, // 10MB per file for better coverage
      maxFiles: 10, // Keep more log history
      noColors: true,
    });

    try {
      // Log detailed startup information
      logger.info('Atlas MCP Server starting up', {
        component: 'Server',
        context: {
          operation: 'startup',
          timestamp: Date.now(),
          logDir,
          environment: process.env.NODE_ENV || 'development',
          nodeVersion: process.version,
          platform: process.platform,
          pid: process.pid,
        },
      });

      // Initialize event manager
      const eventManager = await EventManager.initialize();

      // Update logger with event manager
      logger.setEventManager(eventManager);

      // Initialize config manager with consistent logging config
      const configManager = await ConfigManager.initialize({
        logging: {
          console: false,
          file: true,
          level: LogLevels.DEBUG, // Match initial logger config
          maxFiles: 10, // Match initial logger config
          maxSize: 10 * 1024 * 1024, // Match initial logger config
          dir: logDir,
        },
        storage: {
          baseDir:
            process.env.ATLAS_STORAGE_DIR ||
            join(PlatformPaths.getDocumentsDir(), 'Cline', 'mcp-workspace', 'ATLAS'),
          name: process.env.ATLAS_STORAGE_NAME || 'atlas-tasks',
          connection: {
            maxRetries: 1,
            retryDelay: 500,
            busyTimeout: 2000,
          },
          performance: {
            checkpointInterval: 30000, // 30s
            cacheSize: 500,
            mmapSize: 32 * 1024 * 1024, // 32MB
            pageSize: 4096,
            maxMemory: 128 * 1024 * 1024, // 128MB
          },
        },
      });

      const config = configManager.getConfig();

      // Ensure storage directory exists with proper structure
      const storageDir =
        config.storage?.baseDir || join(documentsDir, 'Cline', 'mcp-workspace', 'ATLAS');
      const dataDir = join(storageDir, 'data');

      // Create directories with proper permissions
      // Parent directory needs execute permission
      await fs.mkdir(storageDir, {
        recursive: true,
        mode: PlatformCapabilities.getFileMode(0o755), // rwxr-xr-x
      });

      // Data directory needs read/write permission for SQLite WAL mode
      await fs.mkdir(dataDir, {
        recursive: true,
        mode: PlatformCapabilities.getFileMode(0o777), // rwxrwxrwx
      });

      // Log directory permissions
      const [storageStats, dataStats] = await Promise.all([fs.stat(storageDir), fs.stat(dataDir)]);

      logger.info('Storage directories created', {
        storageDir: {
          path: storageDir,
          mode: storageStats.mode,
          uid: storageStats.uid,
          gid: storageStats.gid,
        },
        dataDir: {
          path: dataDir,
          mode: dataStats.mode,
          uid: dataStats.uid,
          gid: dataStats.gid,
        },
      });

      // Verify directory permissions
      await Promise.all([
        fs.access(storageDir, fs.constants.R_OK | fs.constants.W_OK),
        fs.access(dataDir, fs.constants.R_OK | fs.constants.W_OK),
      ]);

      // Initialize storage with data directory
      const storage = await createStorage({
        ...config.storage!,
        baseDir: dataDir,
      });

      // Initialize task manager
      const taskManager = await TaskManager.getInstance(storage);

      // Initialize tool handler
      const toolHandler = new ToolHandler(taskManager);

      // Run maintenance
      await storage.vacuum();
      await storage.analyze();
      await storage.checkpoint();

      // Initialize server
      const server = await AtlasServer.getInstance(
        {
          name: 'atlas-mcp-server',
          version: '1.0.0',
          maxRequestsPerMinute: 600,
          requestTimeout: 30000,
          shutdownTimeout: 5000,
          health: {
            checkInterval: 300000, // 5 minutes
            failureThreshold: 5,
            shutdownGracePeriod: 10000,
            clientPingTimeout: 300000,
          },
        },
        {
          listTools: async () => {
            const result = await toolHandler.listTools();
            return result;
          },
          handleToolCall: async request => {
            if (
              !request.params ||
              typeof request.params.name !== 'string' ||
              !request.params.arguments
            ) {
              throw new Error('Invalid tool call request parameters');
            }
            const result = await toolHandler.handleToolCall({
              params: {
                name: request.params.name as string,
                arguments: request.params.arguments as Record<string, any>,
              },
            });
            return result;
          },
          getStorageMetrics: async () => storage.getMetrics(),
          clearCaches: async () => taskManager.clearCaches(),
          cleanup: async () => {
            await taskManager.close();
            await storage.close();
          },
        }
      );

      // Log successful startup
      logger.info('Server initialization completed successfully');

      // Handle process signals
      process.on('SIGINT', async () => {
        logger.info('Received SIGINT, shutting down...');
        await server.shutdown();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        logger.info('Received SIGTERM, shutting down...');
        await server.shutdown();
        process.exit(0);
      });

      // Handle uncaught errors
      process.on('uncaughtException', error => {
        logger.error('Uncaught Exception:', error);
        server.shutdown().finally(() => process.exit(1));
      });

      process.on('unhandledRejection', reason => {
        logger.error('Unhandled Rejection:', reason);
        server.shutdown().finally(() => process.exit(1));
      });
    } catch (error) {
      // Log initialization error before exiting
      logger.error('Failed to initialize server components:', error);
      throw error;
    }
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
