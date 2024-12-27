import { FileTransport } from './file-transport.js';
import { LogEntry, LoggerTransportConfig, LoggerHealthStatus } from '../types/logging.js';
import { ErrorFactory } from '../errors/error-factory.js';
import { EventManager } from '../events/event-manager.js';
import { EventTypes } from '../types/events.js';

/**
 * Manages multiple logging transports with failover support
 */
export class TransportManager {
    private transports: Map<string, FileTransport> = new Map();
    private failoverTransport?: FileTransport;
    private eventManager?: EventManager;
    private healthCheckInterval?: NodeJS.Timeout;
    private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds

    constructor(
        private readonly configs: Record<string, LoggerTransportConfig>,
        private readonly options: {
            enableFailover?: boolean;
            failoverPath?: string;
            healthChecks?: boolean;
        } = {}
    ) {
        // EventManager will be set later
    }

    /**
     * Initializes all transports
     */
    async initialize(): Promise<void> {
        try {
            // Initialize main transports
            for (const [name, config] of Object.entries(this.configs)) {
                if (config.type === 'file' && config.options?.filename) {
                    const transport = new FileTransport({
                        filename: config.options.filename,
                        maxsize: config.options.maxsize || 5 * 1024 * 1024, // 5MB default
                        maxFiles: config.options.maxFiles || 5
                    });

                    await transport.initialize();
                    this.transports.set(name, transport);
                }
            }

            // Initialize failover transport if enabled
            if (this.options.enableFailover && this.options.failoverPath) {
                this.failoverTransport = new FileTransport({
                    filename: this.options.failoverPath,
                    maxsize: 10 * 1024 * 1024, // 10MB for failover
                    maxFiles: 3
                });
                await this.failoverTransport.initialize();
            }

            // Start health checks if enabled
            if (this.options.healthChecks) {
                this.startHealthChecks();
            }

            // Emit initialization event if EventManager is available
            if (this.eventManager) {
                this.eventManager.emitSystemEvent({
                    type: EventTypes.LOGGER_INITIALIZED,
                    timestamp: Date.now(),
                    metadata: {
                        transports: Array.from(this.transports.keys()),
                        failoverEnabled: !!this.failoverTransport
                    }
                });
            }
        } catch (error) {
            throw ErrorFactory.createDatabaseError(
                'TransportManager.initialize',
                error instanceof Error ? error : new Error(String(error))
            );
        }
    }

    /**
     * Writes a log entry to all transports
     */
    async write(entry: LogEntry): Promise<void> {
        const errors: Error[] = [];
        let written = false;

        // Try main transports
        for (const [name, transport] of this.transports) {
            try {
                await transport.write(entry);
                written = true;
            } catch (error) {
                errors.push(error instanceof Error ? error : new Error(String(error)));
                
                // Emit transport error event if EventManager is available
                if (this.eventManager) {
                    this.eventManager.emitSystemEvent({
                        type: EventTypes.LOGGER_TRANSPORT_ERROR,
                        timestamp: Date.now(),
                        metadata: {
                            transport: name,
                            error: error instanceof Error ? error : new Error(String(error))
                        }
                    });
                }
            }
        }

        // Try failover if all main transports failed
        if (!written && this.failoverTransport) {
            try {
                await this.failoverTransport.write({
                    ...entry,
                    context: {
                        failover: true,
                        originalErrors: errors.map(e => e.message)
                    }
                });
                written = true;

                // Emit failover event if EventManager is available
                if (this.eventManager) {
                    this.eventManager.emitSystemEvent({
                        type: EventTypes.LOGGER_FAILOVER_USED,
                        timestamp: Date.now(),
                        metadata: {
                            originalErrors: errors.map(e => e.message)
                        }
                    });
                }
            } catch (failoverError) {
                errors.push(failoverError instanceof Error ? failoverError : new Error(String(failoverError)));
            }
        }

        // If nothing worked, write to console as last resort
        if (!written) {
            // Critical failures are handled through event system only
            if (this.eventManager) {
                this.eventManager.emitSystemEvent({
                    type: EventTypes.LOGGER_CRITICAL_FAILURE,
                    timestamp: Date.now(),
                    metadata: {
                        error: new Error(errors.map(e => e.message).join(', '))
                    }
                });
            }
        }
    }

    /**
     * Starts periodic health checks
     */
    private startHealthChecks(): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        this.healthCheckInterval = setInterval(
            () => this.checkHealth(),
            this.HEALTH_CHECK_INTERVAL
        );

        // Ensure cleanup on process exit
        process.on('beforeExit', () => {
            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval);
            }
        });
    }

    /**
     * Performs health check on all transports
     */
    private async checkHealth(): Promise<void> {
        const status: Record<string, LoggerHealthStatus> = {};

        // Check main transports
        for (const [name, transport] of this.transports) {
            try {
                const transportStatus = await transport.getStatus();
                status[name] = {
                    healthy: transportStatus.active && !transportStatus.error,
                    error: transportStatus.error,
                    diagnostics: {
                        fileDescriptors: {
                            open: transportStatus.active,
                            writable: transportStatus.active
                        }
                    }
                };
            } catch (error) {
                status[name] = {
                    healthy: false,
                    error: error instanceof Error ? error.message : String(error)
                };
            }
        }

        // Check failover transport
        if (this.failoverTransport) {
            try {
                const failoverStatus = await this.failoverTransport.getStatus();
                status.failover = {
                    healthy: failoverStatus.active && !failoverStatus.error,
                    error: failoverStatus.error
                };
            } catch (error) {
                status.failover = {
                    healthy: false,
                    error: error instanceof Error ? error.message : String(error)
                };
            }
        }

        // Emit health status event if EventManager is available
        if (this.eventManager) {
            this.eventManager.emitSystemEvent({
                type: EventTypes.LOGGER_HEALTH_CHECK,
                timestamp: Date.now(),
                metadata: { status }
            });
        }

        // Handle unhealthy transports
        for (const [name, transportStatus] of Object.entries(status)) {
            if (!transportStatus.healthy) {
                await this.handleUnhealthyTransport(name);
            }
        }
    }

    /**
     * Handles an unhealthy transport
     */
    private async handleUnhealthyTransport(name: string): Promise<void> {
        const transport = this.transports.get(name);
        if (!transport) return;

        try {
            // Try to recreate the transport
            await transport.close();
            await transport.initialize();

            // Emit recovery event if EventManager is available
            if (this.eventManager) {
                this.eventManager.emitSystemEvent({
                    type: EventTypes.LOGGER_TRANSPORT_RECOVERED,
                    timestamp: Date.now(),
                    metadata: { transport: name }
                });
            }
        } catch (error) {
            // Emit critical error event if EventManager is available
            if (this.eventManager) {
                this.eventManager.emitSystemEvent({
                    type: EventTypes.LOGGER_TRANSPORT_FAILED,
                    timestamp: Date.now(),
                    metadata: {
                        transport: name,
                        error: error instanceof Error ? error : new Error(String(error))
                    }
                });
            }
        }
    }

    /**
     * Closes all transports
     */
    async close(): Promise<void> {
        // Stop health checks
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        // Close all transports
        const closePromises = Array.from(this.transports.values()).map(t => t.close());
        if (this.failoverTransport) {
            closePromises.push(this.failoverTransport.close());
        }

        await Promise.all(closePromises);

        // Clear maps
        this.transports.clear();
        this.failoverTransport = undefined;

        // Emit shutdown event if EventManager is available
        if (this.eventManager) {
            this.eventManager.emitSystemEvent({
                type: EventTypes.LOGGER_SHUTDOWN,
                timestamp: Date.now()
            });
        }
    }

    /**
     * Sets the event manager instance after initialization
     */
    setEventManager(eventManager: EventManager): void {
        this.eventManager = eventManager;
    }
}
