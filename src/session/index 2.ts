/**
 * Session Management System
 * Initializes and configures session management components using unified storage
 */

import path from 'path';
import { Logger } from '../logging/index.js';
import { DefaultSessionManager } from '../task/core/session/session-manager.js';
import { SessionToolHandler } from '../tools/session-handler.js';
import { UnifiedSqliteStorage } from '../storage/unified-sqlite-storage.js';
import { UnifiedStorageConfig } from '../storage/unified-storage.js';

export interface SessionConfig extends UnifiedStorageConfig {
    // SessionConfig now inherits all properties from UnifiedStorageConfig
    // We can add additional session-specific properties here if needed
}

export class SessionSystem {
    private logger: Logger;
    private storage: UnifiedSqliteStorage | null = null;
    private sessionManager: DefaultSessionManager | null = null;
    private toolHandler: SessionToolHandler | null = null;

    constructor(private config: SessionConfig) {
        this.logger = Logger.getInstance().child({ component: 'SessionSystem' });
    }

    /**
     * Initializes the session management system
     */
    async initialize(): Promise<SessionToolHandler> {
        try {
            // Initialize unified storage
            this.storage = new UnifiedSqliteStorage(this.config);
            await this.storage.initialize();

            // Initialize session manager with unified storage
            this.sessionManager = new DefaultSessionManager(this.storage);
            await this.sessionManager.initialize();

            // Initialize tool handler
            this.toolHandler = new SessionToolHandler(this.sessionManager);

            this.logger.info('Session management system initialized');
            return this.toolHandler;
        } catch (error) {
            this.logger.error('Failed to initialize session system', { error });
            throw error;
        }
    }

    /**
     * Closes the session management system
     */
    async close(): Promise<void> {
        try {
            if (this.storage) {
                await this.storage.close();
                this.storage = null;
                this.sessionManager = null;
                this.toolHandler = null;
            }
            this.logger.info('Session management system closed');
        } catch (error) {
            this.logger.error('Error closing session system', { error });
            throw error;
        }
    }

    /**
     * Gets the session manager instance
     */
    getSessionManager(): DefaultSessionManager {
        if (!this.sessionManager) {
            throw new Error('Session manager not initialized');
        }
        return this.sessionManager;
    }

    /**
     * Gets the tool handler instance
     */
    getToolHandler(): SessionToolHandler {
        if (!this.toolHandler) {
            throw new Error('Session tool handler not initialized');
        }
        return this.toolHandler;
    }
}

// Export session management components
export { DefaultSessionManager } from '../task/core/session/session-manager.js';
export { SessionToolHandler } from '../tools/session-handler.js';

/**
 * @deprecated Use UnifiedSqliteStorage instead
 */
export { UnifiedSqliteStorage as SqliteSessionStorage } from '../storage/unified-sqlite-storage.js';
