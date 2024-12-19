import { Task } from '../../shared/types/task.js';
import { Logger } from '../../logging/index.js';
import {
    createIndexingSystem,
    IndexingSystem,
    IndexingConfig,
    IndexOperation,
    IndexQuery,
    IndexResult,
    IndexQueryResult,
    IndexEvent,
    IndexEventType
} from './index.js';

/**
 * Module configuration
 */
export interface ModuleConfig {
    indexing?: Partial<IndexingConfig>;
    enableEvents?: boolean;
    logLevel?: string;
}

/**
 * Default module configuration
 */
export const DEFAULT_MODULE_CONFIG: ModuleConfig = {
    indexing: {},
    enableEvents: true,
    logLevel: 'info'
};

/**
 * Module state
 */
interface ModuleState {
    system: IndexingSystem | null;
    initialized: boolean;
    error: Error | null;
}

/**
 * Module instance
 */
class IndexingModule {
    private readonly logger: Logger;
    private readonly config: ModuleConfig;
    private readonly state: ModuleState;
    private readonly eventListeners: Set<(event: IndexEvent) => void>;

    constructor(config: Partial<ModuleConfig> = {}) {
        this.config = { ...DEFAULT_MODULE_CONFIG, ...config };
        this.logger = Logger.getInstance().child({ component: 'IndexingModule' });
        this.state = {
            system: null,
            initialized: false,
            error: null
        };
        this.eventListeners = new Set();
    }

    /**
     * Initialize the module
     */
    async initialize(): Promise<void> {
        if (this.state.initialized) {
            return;
        }

        try {
            // Create indexing system
            const system = createIndexingSystem(this.config.indexing);

            // Set up event handling
            if (this.config.enableEvents) {
                system.addEventListener(event => this.handleEvent(event));
            }

            // Update state
            this.state.system = system;
            this.state.initialized = true;
            this.state.error = null;

            this.logger.info('Indexing module initialized successfully');
        } catch (error) {
            this.state.error = error instanceof Error ? error : new Error(String(error));
            this.logger.error('Failed to initialize indexing module', { error });
            throw error;
        }
    }

    /**
     * Create a new task
     */
    async createTask(task: Task): Promise<IndexResult> {
        this.ensureInitialized();
        return await this.state.system!.createTask(task);
    }

    /**
     * Update an existing task
     */
    async updateTask(task: Task): Promise<IndexResult> {
        this.ensureInitialized();
        return await this.state.system!.updateTask(task);
    }

    /**
     * Delete a task
     */
    async deleteTask(id: string): Promise<IndexResult> {
        this.ensureInitialized();
        return await this.state.system!.deleteTask(id);
    }

    /**
     * Execute batch operations
     */
    async batchOperations(operations: IndexOperation[]): Promise<IndexResult[]> {
        this.ensureInitialized();
        return await this.state.system!.batchOperations(operations);
    }

    /**
     * Query tasks
     */
    async queryTasks(query: IndexQuery): Promise<IndexQueryResult> {
        this.ensureInitialized();
        return await this.state.system!.queryTasks(query);
    }

    /**
     * Clear all tasks
     */
    async clearTasks(): Promise<void> {
        this.ensureInitialized();
        return await this.state.system!.clearTasks();
    }

    /**
     * Add event listener
     */
    addEventListener(listener: (event: IndexEvent) => void): void {
        if (!this.config.enableEvents) {
            this.logger.warn('Events are disabled');
            return;
        }
        this.eventListeners.add(listener);
    }

    /**
     * Remove event listener
     */
    removeEventListener(listener: (event: IndexEvent) => void): void {
        this.eventListeners.delete(listener);
    }

    /**
     * Get event history
     */
    getEventHistory(): IndexEvent[] {
        this.ensureInitialized();
        return this.state.system!.getEventHistory();
    }

    /**
     * Get module statistics
     */
    getStats(): Record<string, unknown> {
        this.ensureInitialized();
        return {
            system: this.state.system!.getStats(),
            config: this.config,
            eventListeners: this.eventListeners.size,
            state: {
                initialized: this.state.initialized,
                error: this.state.error?.message
            }
        };
    }

    /**
     * Handle system event
     */
    private handleEvent(event: IndexEvent): void {
        // Log event
        this.logger.debug('Indexing event received', { event });

        // Notify listeners
        this.eventListeners.forEach(listener => {
            try {
                listener(event);
            } catch (error) {
                this.logger.error('Event listener error', { error, event });
            }
        });

        // Handle specific events
        switch (event.type) {
            case IndexEventType.ERROR:
                this.logger.error('Indexing error event', { event });
                break;
            case IndexEventType.INDEX_CLEARED:
                this.logger.info('Indexes cleared');
                break;
            default:
                // Other events are handled by listeners
                break;
        }
    }

    /**
     * Ensure module is initialized
     */
    private ensureInitialized(): void {
        if (!this.state.initialized || !this.state.system) {
            throw new Error('Indexing module not initialized');
        }
    }
}

// Module instance
let instance: IndexingModule | null = null;

/**
 * Get module instance
 */
export function getIndexingModule(config?: Partial<ModuleConfig>): IndexingModule {
    if (!instance) {
        instance = new IndexingModule(config);
    }
    return instance;
}

/**
 * Initialize module
 */
export async function initializeIndexing(config?: Partial<ModuleConfig>): Promise<void> {
    const module = getIndexingModule(config);
    await module.initialize();
}

// Export types
export {
    IndexOperation,
    IndexQuery,
    IndexResult,
    IndexQueryResult,
    IndexEvent,
    IndexEventType
};
