/**
 * Atlas MCP Server
 * Path-based task management system
 */
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import path from 'path';

import { TaskManager } from './task-manager.js';
import { Logger } from './logging/index.js';
import { StorageConfig, TaskStorage } from './types/storage.js';
import { createStorage } from './storage/index.js';
import { ToolHandler } from './tools/handler.js';
import { AtlasServer } from './server/index.js';

// Default storage directory relative to the current file
const DEFAULT_STORAGE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');

export class AtlasServerBootstrap {
    private readonly logger: Logger;
    private storage!: TaskStorage;
    private taskManager!: TaskManager;
    private toolHandler!: ToolHandler;
    private server!: AtlasServer;
    private readonly storageConfig: StorageConfig;

    constructor() {
        // Initialize logger
        this.logger = Logger.getInstance().child({ component: 'AtlasServerBootstrap' });

        // Set up storage configuration
        const storageDir = process.env.ATLAS_STORAGE_DIR || DEFAULT_STORAGE_DIR;
        this.storageConfig = {
            baseDir: storageDir,
            name: process.env.ATLAS_STORAGE_NAME || 'atlas-tasks',
            connection: {
                maxRetries: Number(process.env.ATLAS_MAX_RETRIES) || 3,
                retryDelay: Number(process.env.ATLAS_RETRY_DELAY) || 1000,
                busyTimeout: Number(process.env.ATLAS_BUSY_TIMEOUT) || 5000
            },
            performance: {
                checkpointInterval: Number(process.env.ATLAS_CHECKPOINT_INTERVAL) || 300000,
                cacheSize: Number(process.env.ATLAS_CACHE_SIZE) || 2000,
                mmapSize: Number(process.env.ATLAS_MMAP_SIZE) || 30000000000,
                pageSize: Number(process.env.ATLAS_PAGE_SIZE) || 4096
            }
        };
    }

    private async initialize(): Promise<void> {
        try {
            // Ensure storage directory exists
            await fs.mkdir(this.storageConfig.baseDir, { recursive: true });

            // Initialize storage
            this.storage = await createStorage(this.storageConfig);
            this.logger.info('Storage initialized', { dir: this.storageConfig.baseDir });

            // Initialize task manager with existing storage
            this.taskManager = new TaskManager(this.storage);
            this.logger.info('Task manager initialized');

            // Create tool handler
            this.toolHandler = new ToolHandler(this.taskManager);
            this.logger.info('Tool handler initialized');

            // Create server instance
            this.server = new AtlasServer(
                {
                    name: 'atlas-mcp-server',
                    version: '0.1.0',
                    maxRequestsPerMinute: 100,
                    requestTimeout: 30000,
                    shutdownTimeout: 30000
                },
                this.toolHandler
            );
            this.logger.info('Server instance created');
        } catch (error) {
            this.logger.fatal('Failed to initialize server components', { error });
            throw error;
        }
    }

    async start(): Promise<void> {
        try {
            await this.initialize();
            await this.server.run();
            this.logger.info('Atlas MCP server started', {
                storageDir: this.storageConfig.baseDir,
                version: '0.1.0'
            });
        } catch (error) {
            this.logger.fatal('Failed to start server', { error });
            throw error;
        }
    }
}

// Start server if run directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
    const server = new AtlasServerBootstrap();
    server.start().catch((error) => {
        console.error('Failed to start server:', error);
        process.exit(1);
    });
}
