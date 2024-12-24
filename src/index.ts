/**
 * Atlas MCP Server
 * Path-based task management system
 */
import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';
import { TaskManager } from './task-manager.js';
import { Logger } from './logging/index.js';
import { StorageConfig, TaskStorage } from './types/storage.js';
import { createStorage } from './storage/index.js';
import { ToolHandler } from './tools/handler.js';
import { AtlasServer } from './server/index.js';

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

        // Log environment variables
        this.logger.debug('Environment variables:', {
            ATLAS_STORAGE_DIR: process.env.ATLAS_STORAGE_DIR,
            ATLAS_STORAGE_NAME: process.env.ATLAS_STORAGE_NAME,
            LOG_LEVEL: process.env.LOG_LEVEL,
            NODE_ENV: process.env.NODE_ENV
        });

        // Set up storage configuration with platform-appropriate defaults
        let storageDir = process.env.ATLAS_STORAGE_DIR;
        const storageName = process.env.ATLAS_STORAGE_NAME || 'atlas-tasks';

        if (!storageDir) {
            // Default to platform-appropriate user directory
            storageDir = join(homedir(), '.atlas-mcp', 'storage');
            this.logger.info('Using default storage directory', { storageDir });
        }

        // Ensure absolute path with platform-appropriate separators
        storageDir = resolve(storageDir);

        // Set up storage configuration
        this.storageConfig = {
            baseDir: storageDir,
            name: storageName,
            connection: {
                maxRetries: Number(process.env.ATLAS_MAX_RETRIES) || 3,
                retryDelay: Number(process.env.ATLAS_RETRY_DELAY) || 1000,
                busyTimeout: Number(process.env.ATLAS_BUSY_TIMEOUT) || 5000
            },
            performance: {
                checkpointInterval: Number(process.env.ATLAS_CHECKPOINT_INTERVAL) || 300000,
                cacheSize: Number(process.env.ATLAS_CACHE_SIZE) || 2000,
                mmapSize: Number(process.env.ATLAS_MMAP_SIZE) || 30000000000,
                pageSize: Number(process.env.ATLAS_PAGE_SIZE) || 4096,
                maxMemory: Number(process.env.ATLAS_MAX_MEMORY) || 2 * 1024 * 1024 * 1024, // 2GB default
                maxCacheMemory: Number(process.env.ATLAS_MAX_CACHE_MEMORY) || 512 * 1024 * 1024 // 512MB default
            }
        };
    }

    private async initialize(): Promise<void> {
        try {
            // Ensure storage directory exists with platform-appropriate permissions
            await fs.mkdir(this.storageConfig.baseDir, { 
                recursive: true,
                mode: process.platform === 'win32' ? undefined : 0o755
            });

            // Initialize storage
            this.storage = await createStorage(this.storageConfig);
            this.logger.info('Storage initialized', { 
                dir: this.storageConfig.baseDir,
                platform: process.platform
            });

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
            this.logger.fatal('Failed to initialize server components', { 
                error,
                platform: process.platform,
                storageDir: this.storageConfig.baseDir
            });
            throw error;
        }
    }

    async start(): Promise<void> {
        try {
            await this.initialize();
            await this.server.run();
            const maxMemory = this.storageConfig.performance?.maxMemory || 2 * 1024 * 1024 * 1024;
            const maxCacheMemory = this.storageConfig.performance?.maxCacheMemory || 512 * 1024 * 1024;

            this.logger.info('Atlas MCP server started', {
                storageDir: this.storageConfig.baseDir,
                storageName: this.storageConfig.name,
                version: '0.1.0',
                environment: process.env.NODE_ENV,
                logLevel: process.env.LOG_LEVEL,
                platform: process.platform,
                maxMemory: `${Math.round(maxMemory / 1024 / 1024)}MB`,
                maxCacheMemory: `${Math.round(maxCacheMemory / 1024 / 1024)}MB`
            });
        } catch (error) {
            this.logger.fatal('Failed to start server', { 
                error,
                platform: process.platform
            });
            throw error;
        }
    }
}

// Start server if run directly
if (import.meta.url.startsWith('file:')) {
    const scriptPath = process.platform === 'win32' 
        ? process.argv[1].replace(/\\/g, '/') 
        : process.argv[1];
    
    const isMainModule = import.meta.url === `file://${scriptPath}`;
    if (isMainModule) {
        const server = new AtlasServerBootstrap();
        server.start().catch((error) => {
            console.error('Failed to start server:', error);
            process.exit(1);
        });
    }
}
