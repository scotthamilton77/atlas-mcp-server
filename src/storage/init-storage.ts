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
    try {
        // Try VSCode settings first
        const vscodePath = join(homedir(), 'Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json');
        const settings = JSON.parse(readFileSync(vscodePath, 'utf8'));
        return settings;
    } catch (error) {
        try {
            // Try Claude desktop app settings
            const claudePath = join(homedir(), 'Library/Application Support/Claude/claude_desktop_config.json');
            const settings = JSON.parse(readFileSync(claudePath, 'utf8'));
            return settings;
        } catch (error) {
            return null;
        }
    }
}

async function main() {
    try {
        // Try to get settings from MCP config first
        const mcpSettings = getMcpSettings();
        const atlasSettings = mcpSettings?.mcpServers?.['atlas-mcp-server']?.env;
        
        // Load environment variables from .env file if present
        try {
            const { config } = await import('dotenv');
            config();
        } catch (error) {
            // Ignore error if .env file doesn't exist
        }

        // Get storage settings with fallbacks
        const storageDir = atlasSettings?.ATLAS_STORAGE_DIR || process.env.ATLAS_STORAGE_DIR;
        const storageName = atlasSettings?.ATLAS_STORAGE_NAME || process.env.ATLAS_STORAGE_NAME || 'ATLAS';

        if (!storageDir) {
            throw new Error('ATLAS_STORAGE_DIR not found in MCP settings or environment variables');
        }

        // Configure logger with file output
        const logDir = join(storageDir, 'logs');
        Logger.initialize({
            minLevel: 'debug',
            console: true,
            file: true,
            logDir,
            maxFileSize: 5 * 1024 * 1024, // 5MB
            maxFiles: 5
        });
        const logger = Logger.getInstance();

        // Initialize configuration
        const configManager = ConfigManager.getInstance();

        await configManager.updateConfig({
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
        logger.info('Storage initialized at:', {
            path: `${storageDir}/${storageName}.db`
        });

        logger.info('Storage initialization completed successfully');
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
