#!/usr/bin/env node

import { Logger } from './logging/index.js';
import { EventEmitter } from 'events';
import { ConfigManager } from './config/config-manager.js';

// Increase max listeners to prevent memory leak warnings
EventEmitter.defaultMaxListeners = 30;

// Track and cleanup process event listeners
const processListeners = new Set<() => void>();
const addProcessListener = (event: string, listener: () => void) => {
  process.on(event, listener);
  processListeners.add(listener);
};

// Cleanup function to remove all registered listeners
const cleanupProcessListeners = () => {
  for (const listener of processListeners) {
    process.removeListener('beforeExit', listener);
  }
  processListeners.clear();
};

// Register cleanup for process exit
process.on('exit', cleanupProcessListeners);
import { TaskManager } from './task/manager/task-manager.js';
import { VisualizationManager } from './visualization/visualization-manager.js';
import { createStorage, TaskStorage } from './storage/index.js';
import { AtlasServer } from './server/index.js';
import { EventManager } from './events/event-manager.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { NoteManager, NotesInitializer } from './notes/index.js';

// Get package root directory
const __filename = fileURLToPath(import.meta.url);
const packageRoot = join(dirname(__filename), '..');
import { PlatformPaths, PlatformCapabilities, ProcessManager } from './utils/platform-utils.js';
import { LogLevels } from './types/logging.js';
import { StorageConfig } from './types/config.js';
import { ToolHandler } from './tools/handler.js';
import { TemplateManager } from './template/manager.js';
import { SqliteTemplateStorage } from './storage/sqlite/template-storage.js';

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
    const templateDir = join(baseDir, 'templates');
    const notesDir = join(baseDir, 'notes');
    const notesConfigPath = join(baseDir, 'config', 'notes.json');

    // Create directories with platform-appropriate permissions
    await PlatformCapabilities.ensureDirectoryPermissions(logDir, 0o755);
    await PlatformCapabilities.ensureDirectoryPermissions(dataDir, 0o755);
    await PlatformCapabilities.ensureDirectoryPermissions(templateDir, 0o755);
    await PlatformCapabilities.ensureDirectoryPermissions(notesDir, 0o755);
    await PlatformCapabilities.ensureDirectoryPermissions(dirname(notesConfigPath), 0o755);

    // Initialize logger with comprehensive file logging
    logger = await Logger.initialize({
      console: true,
      file: true,
      minLevel: LogLevels.DEBUG,
      logDir,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10,
      noColors: false,
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
            templates: templateDir,
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

      // Initialize ConfigManager
      await ConfigManager.initialize();
      const config = ConfigManager.getInstance();

      // Initialize storage with retries
      let storage: TaskStorage | undefined;
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        try {
          // Initialize storage using config values
          storage = await createStorage({
            baseDir: dataDir,
            name: config.get<StorageConfig>('storage').name,
            journalMode: 'wal', // Use Write-Ahead Logging mode
            synchronous: 'normal', // Use normal synchronization for WAL mode
            connection: {
              maxConnections: 1,
              maxRetries: 5,
              retryDelay: 3000,
              busyTimeout: 10000,
              idleTimeout: 30000,
            },
            performance: {
              ...(config.get<StorageConfig>('storage').performance || {}),
              checkpointInterval: 30000, // More frequent checkpoints for WAL mode
              cacheSize: 2000,
              mmapSize: 33554432, // 32MB mmap size for WAL mode
              pageSize: 4096,
              maxMemory: 134217728, // 128MB for better WAL performance
              sharedMemory: true, // Enable shared memory for WAL mode
            },
          });

          // Wait for database initialization (matches init.ts timing)
          await new Promise(resolve => setTimeout(resolve, 5000));
          logger.info('Storage initialized successfully', {
            component: 'Storage',
            config: {
              journalMode: 'wal',
              synchronous: 'normal',
              performance: {
                checkpointInterval: 30000,
                mmapSize: 33554432,
                maxMemory: 134217728,
                sharedMemory: true,
              },
            },
          });

          break;
        } catch (error) {
          retryCount++;
          logger.warn(`Storage initialization attempt ${retryCount} failed:`, {
            error: error instanceof Error ? error.message : String(error),
            retryCount,
            maxRetries,
          });

          if (retryCount === maxRetries) {
            throw error;
          }

          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }

      if (!storage) {
        throw new Error('Failed to initialize storage after retries');
      }

      // Register storage cleanup using managed listener
      const storageCleanup = async () => {
        await storage?.close();
      };
      addProcessListener('beforeExit', storageCleanup);
      ProcessManager.registerCleanupHandler(storageCleanup);

      // Initialize task manager
      const taskManager = await TaskManager.getInstance(storage as TaskStorage);

      // Initialize visualization manager
      const visualizationManager = await VisualizationManager.initialize(taskManager, {
        baseDir,
      });

      // Register visualization cleanup using managed listener
      const visualizationCleanup = async () => {
        await visualizationManager.cleanup();
      };
      addProcessListener('beforeExit', visualizationCleanup);
      ProcessManager.registerCleanupHandler(visualizationCleanup);

      // Initialize template storage and manager
      const templateStorage = new SqliteTemplateStorage(storage, logger);
      await templateStorage.initialize();

      // Initialize template manager with both built-in and workspace templates
      const templateManager = new TemplateManager(templateStorage, taskManager);
      const builtInTemplateDir = join(packageRoot, 'templates');

      logger.info('Template directories:', {
        builtIn: builtInTemplateDir,
        workspace: templateDir,
      });

      try {
        await templateManager.initialize([builtInTemplateDir, templateDir]);

        // List available templates
        const templates = await templateManager.listTemplates();
        logger.info('Loaded templates:', {
          count: templates.length,
          templates: templates.map(t => ({
            id: t.id,
            name: t.name,
          })),
        });
      } catch (error) {
        logger.error('Failed to initialize templates:', {
          error,
          builtInTemplateDir,
          templateDir,
        });
        throw error;
      }

      // Register task and template manager cleanup using managed listeners
      const taskCleanup = async () => {
        await taskManager.close();
      };
      const templateCleanup = async () => {
        await templateManager.close();
      };
      addProcessListener('beforeExit', taskCleanup);
      addProcessListener('beforeExit', templateCleanup);
      ProcessManager.registerCleanupHandler(taskCleanup);
      ProcessManager.registerCleanupHandler(templateCleanup);

      // Initialize notes
      const builtInNotesDir = join(packageRoot, 'notes');
      const notesInitializer = new NotesInitializer();
      await notesInitializer.initializeNotes(notesConfigPath, notesDir, builtInNotesDir);

      // Initialize note manager after notes are copied
      const noteManager = await NoteManager.getInstance(notesConfigPath, notesDir);

      // Initialize tool handler
      const toolHandler = new ToolHandler(taskManager, templateManager, noteManager);

      // Register note manager cleanup using managed listener
      const noteCleanup = async () => {
        await noteManager.reloadConfig();
      };
      addProcessListener('beforeExit', noteCleanup);
      ProcessManager.registerCleanupHandler(noteCleanup);

      // Run maintenance with retries
      if (storage) {
        let maintenanceRetries = 0;
        const maxMaintenanceRetries = 3;

        while (maintenanceRetries < maxMaintenanceRetries) {
          try {
            // Wait before attempting maintenance
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Run maintenance operations one at a time with delays
            await storage.vacuum();
            await new Promise(resolve => setTimeout(resolve, 1000));

            await storage.analyze();
            await new Promise(resolve => setTimeout(resolve, 1000));

            await storage.checkpoint();
            break;
          } catch (error) {
            maintenanceRetries++;
            logger.warn(`Maintenance attempt ${maintenanceRetries} failed:`, {
              error: error instanceof Error ? error.message : String(error),
              retryCount: maintenanceRetries,
              maxRetries: maxMaintenanceRetries,
            });

            if (maintenanceRetries === maxMaintenanceRetries) {
              logger.error('Failed to complete maintenance operations', {
                error: error instanceof Error ? error.message : String(error),
              });
              // Continue without maintenance rather than failing startup
              break;
            }

            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        }
      }

      // Initialize server
      server = await AtlasServer.getInstance(
        {
          name: 'atlas-mcp-server',
          version: '1.5.0',
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
          getStorageMetrics: async () =>
            storage?.getMetrics() ?? {
              tasks: {
                total: 0,
                byStatus: {
                  PENDING: 0,
                  IN_PROGRESS: 0,
                  COMPLETED: 0,
                  CANCELLED: 0,
                  BLOCKED: 0,
                },
                noteCount: 0,
                dependencyCount: 0,
              },
              storage: {
                totalSize: 0,
                pageSize: 4096,
                pageCount: 0,
                walSize: 0,
                cache: {
                  hitRate: 0,
                  memoryUsage: 0,
                  entryCount: 0,
                },
              },
            },
          clearCaches: async () => taskManager.clearCaches(),
          cleanup: ProcessManager.cleanup,
          // Add resource-related methods
          getTaskResource: async (uri: string) => taskManager.getTaskResource(uri),
          listTaskResources: async () => taskManager.listTaskResources(),
          getTemplateResource: async (uri: string) => templateManager.getTemplateResource(uri),
          listTemplateResources: async () => templateManager.listTemplateResources(),
          getHierarchyResource: async (rootPath: string) =>
            taskManager.getHierarchyResource(rootPath),
          getStatusResource: async (taskPath: string) => taskManager.getStatusResource(taskPath),
          getResourceTemplates: async () => templateManager.getResourceTemplates(),
          resolveResourceTemplate: async (template: string, vars: Record<string, string>) =>
            templateManager.resolveResourceTemplate(template, vars),
          // Add visualization resource
          getVisualizationResource: async () => ({
            uri: 'visualizations://current',
            name: 'Task Visualizations',
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                timestamp: new Date().toISOString(),
                files: {
                  markdown: `/visualizations/tasks-${new Date().toISOString().split('T')[0]}.md`,
                  json: `/visualizations/tasks-${new Date().toISOString().split('T')[0]}.json`,
                },
                summary: await taskManager.getMetrics(),
                format: {
                  statusIndicators: {
                    PENDING: '⏳',
                    IN_PROGRESS: '🔄',
                    COMPLETED: '✅',
                    BLOCKED: '🚫',
                    CANCELLED: '❌',
                  },
                  progressBar: {
                    length: 20,
                    filled: '█',
                    empty: '░',
                  },
                },
              },
              null,
              2
            ),
          }),
        }
      );

      // Register server and event manager cleanup using managed listeners
      const serverCleanup = async () => {
        await server?.shutdown();
      };
      const eventCleanup = async () => {
        await eventManager.shutdown();
      };
      addProcessListener('beforeExit', serverCleanup);
      addProcessListener('beforeExit', eventCleanup);
      ProcessManager.registerCleanupHandler(serverCleanup);
      ProcessManager.registerCleanupHandler(eventCleanup);

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
