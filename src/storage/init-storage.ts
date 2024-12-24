/**
 * Storage initialization entry point
 */
import { Logger } from '../logging/index.js';
import { ConfigManager } from '../config/index.js';
import { initializeSqliteStorage } from './sqlite/init.js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

interface McpSettings {
    mcpServers: {
        'atlas-mcp-server'?: {
            env?: {
                ATLAS_STORAGE_DIR?: string;
                ATLAS_STORAGE_NAME?: string;
            };
        };
    };
}

function getMcpSettings(): McpSettings | null {
    const logger = Logger.getInstance();
    const paths = [
        // VSCode settings
        join(homedir(), 'Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json'),
        // Claude desktop app settings
        join(homedir(), 'Library/Application Support/Claude/claude_desktop_config.json')
    ];

    for (const path of paths) {
        try {
            logger.debug('Checking MCP settings at:', { path });
            const settings = JSON.parse(readFileSync(path, 'utf8'));
            logger.info('Found MCP settings:', { path });
            return settings;
        } catch (error) {
            logger.debug('Failed to read MCP settings:', { path, error });
        }
    }

    return null;
}

async function validateStoragePath(dir: string): Promise<void> {
    const logger = Logger.getInstance();
    const fs = await import('fs/promises');
    
    try {
        // Create directory if it doesn't exist
        await fs.mkdir(dir, { recursive: true });
        
        // Check if directory is writable
        const testFile = join(dir, '.write_test');
        await fs.writeFile(testFile, '');
        await fs.unlink(testFile);
        
        logger.info('Storage directory validated:', { dir });
    } catch (error) {
        logger.error('Storage directory validation failed:', { 
            dir, 
            error: error instanceof Error ? error.message : String(error)
        });
        throw new Error(`Invalid storage directory: ${dir}`);
    }
}

async function main() {
    const fs = await import('fs/promises');
    
    try {
        // Initialize logger first with basic config
        Logger.initialize({
            minLevel: 'debug',
            console: true,
            file: false // Will enable file logging after directory validation
        });
        const logger = Logger.getInstance();

        // Try to get settings from MCP config first
        const mcpSettings = getMcpSettings();
        const atlasSettings = mcpSettings?.mcpServers?.['atlas-mcp-server']?.env;
        
        // Load environment variables from .env file if present
        try {
            const { config } = await import('dotenv');
            config();
        } catch (error) {
            logger.debug('No .env file found');
        }

        // Get storage settings with fallbacks
        const storageDir = atlasSettings?.ATLAS_STORAGE_DIR || process.env.ATLAS_STORAGE_DIR || join(process.env.HOME || '', 'Documents/Cline/mcp-workspace/ATLAS');
        const storageName = atlasSettings?.ATLAS_STORAGE_NAME || process.env.ATLAS_STORAGE_NAME || 'atlas';

        logger.info('Using storage directory:', { storageDir, storageName });

        // Validate storage directory
        await validateStoragePath(storageDir);

        // Create log directory
        const logDir = join(storageDir, 'logs');
        await fs.mkdir(logDir, { recursive: true });
        
        // Get a new logger instance for the rest of initialization
        const initLogger = Logger.getInstance().child({ 
            component: 'StorageInit',
            logDir
        });

        // Initialize configuration with validated paths
        const configManager = ConfigManager.getInstance();
        initLogger.info('Updating configuration...');
        await configManager.updateConfig({
            appName: 'atlas-mcp-server',
            storage: {
                baseDir: storageDir,
                name: storageName,
                connection: {
                    busyTimeout: 5000,
                    maxRetries: 3,
                    retryDelay: 1000
                },
                performance: {
                    cacheSize: 2000,
                    checkpointInterval: 300000,
                    mmapSize: 30000000000,
                    pageSize: 4096
                }
            }
        });

        // Initialize SQLite storage
        await initializeSqliteStorage();

        // Log storage location
        initLogger.info('Storage initialized at:', {
            path: `${storageDir}/${storageName}.db`
        });

        initLogger.info('Storage initialization completed successfully');
    } catch (error) {
        const errorMessage = error instanceof Error 
            ? `${error.message}\n${error.stack}`
            : error && typeof error === 'object'
                ? JSON.stringify(error, null, 2)
                : String(error);
        
        console.error('Storage initialization failed:', errorMessage);
        process.exit(1);
    }
}

// Run initialization
main().catch(error => {
    const errorMessage = error instanceof Error 
        ? `${error.message}\n${error.stack}`
        : error && typeof error === 'object'
            ? JSON.stringify(error, null, 2)
            : String(error);
    
    console.error('Fatal error during storage initialization:', errorMessage);
    process.exit(1);
});
