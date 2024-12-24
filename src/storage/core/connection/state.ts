/**
 * Connection state management
 */
import { Logger } from '../../../logging/index.js';
import { EventManager } from '../../../events/event-manager.js';
import { EventTypes } from '../../../types/events.js';
import { ConnectionStats, MonitoringMetrics } from '../../../types/storage.js';

interface ConnectionState {
    id: string;
    inUse: boolean;
    hasActiveTransaction: boolean;
    lastUsed: number;
    createdAt: number;
    errorCount: number;
    totalQueries: number;
    totalResponseTime: number;
    lastError?: Error;
}

interface StateManagerOptions {
    errorThreshold?: number;
    responseTimeThreshold?: number;
}

export class ConnectionStateManager {
    private static instance: ConnectionStateManager;
    private readonly logger: Logger;
    private readonly eventManager: EventManager;
    private readonly states: Map<string, ConnectionState>;
    private readonly errorThreshold: number;
    private readonly responseTimeThreshold: number;
    private monitoringInterval: NodeJS.Timeout | null = null;
    private readonly DEFAULT_ERROR_THRESHOLD = 5;
    private readonly DEFAULT_RESPONSE_TIME_THRESHOLD = 1000; // 1 second
    private readonly MONITORING_INTERVAL = 30000; // 30 seconds

    private constructor(options: StateManagerOptions = {}) {
        this.logger = Logger.getInstance().child({ component: 'ConnectionStateManager' });
        this.eventManager = EventManager.getInstance();
        this.states = new Map();
        this.errorThreshold = options.errorThreshold || this.DEFAULT_ERROR_THRESHOLD;
        this.responseTimeThreshold = options.responseTimeThreshold || this.DEFAULT_RESPONSE_TIME_THRESHOLD;
    }

    static getInstance(options?: StateManagerOptions): ConnectionStateManager {
        if (!ConnectionStateManager.instance) {
            ConnectionStateManager.instance = new ConnectionStateManager(options);
        }
        return ConnectionStateManager.instance;
    }

    /**
     * Register a new connection
     */
    registerConnection(id: string): void {
        this.states.set(id, {
            id,
            inUse: false,
            hasActiveTransaction: false,
            lastUsed: Date.now(),
            createdAt: Date.now(),
            errorCount: 0,
            totalQueries: 0,
            totalResponseTime: 0
        });
        this.logger.debug('Connection registered', { id });
    }

    /**
     * Unregister a connection
     */
    unregisterConnection(id: string): void {
        this.states.delete(id);
        this.logger.debug('Connection unregistered', { id });
    }

    /**
     * Mark connection as in use
     */
    markInUse(id: string): void {
        const state = this.states.get(id);
        if (state) {
            state.inUse = true;
            state.lastUsed = Date.now();
        }
    }

    /**
     * Mark connection as available
     */
    markAvailable(id: string): void {
        const state = this.states.get(id);
        if (state) {
            state.inUse = false;
            state.lastUsed = Date.now();
        }
    }

    /**
     * Start transaction on connection
     */
    startTransaction(id: string): void {
        const state = this.states.get(id);
        if (state) {
            state.hasActiveTransaction = true;
        }
    }

    /**
     * End transaction on connection
     */
    endTransaction(id: string): void {
        const state = this.states.get(id);
        if (state) {
            state.hasActiveTransaction = false;
        }
    }

    /**
     * Record query execution
     */
    recordQuery(id: string, duration: number, error?: Error): void {
        const state = this.states.get(id);
        if (state) {
            state.totalQueries++;
            state.totalResponseTime += duration;
            if (error) {
                state.errorCount++;
                state.lastError = error;
            }
        }
    }

    /**
     * Check if connection is healthy
     */
    isHealthy(id: string): boolean {
        const state = this.states.get(id);
        if (!state) return false;

        const avgResponseTime = state.totalQueries > 0
            ? state.totalResponseTime / state.totalQueries
            : 0;

        return state.errorCount < this.errorThreshold &&
               avgResponseTime < this.responseTimeThreshold;
    }

    /**
     * Get connection state
     */
    getState(id: string): ConnectionState | undefined {
        return this.states.get(id);
    }

    /**
     * Check if connection has active transaction
     */
    hasActiveTransaction(id: string): boolean {
        const state = this.states.get(id);
        return state?.hasActiveTransaction || false;
    }

    /**
     * Get connection metrics
     */
    getMetrics(): MonitoringMetrics {
        let totalActive = 0;
        let totalErrors = 0;
        let totalQueries = 0;
        let totalResponseTime = 0;

        for (const state of this.states.values()) {
            if (state.inUse) totalActive++;
            totalErrors += state.errorCount;
            totalQueries += state.totalQueries;
            totalResponseTime += state.totalResponseTime;
        }

        const connectionStats: ConnectionStats = {
            total: this.states.size,
            active: totalActive,
            idle: this.states.size - totalActive,
            errors: totalErrors,
            avgResponseTime: totalQueries > 0 ? totalResponseTime / totalQueries : 0
        };

        return {
            cache: {
                hits: 0,
                misses: 0,
                hitRate: 0,
                size: 0,
                memoryUsage: process.memoryUsage().heapUsed
            },
            connections: connectionStats,
            queries: {
                total: totalQueries,
                errors: totalErrors,
                avgExecutionTime: totalQueries > 0 ? totalResponseTime / totalQueries : 0,
                slowQueries: 0 // TODO: Track slow queries
            },
            timestamp: Date.now()
        };
    }

    /**
     * Start monitoring connections
     */
    startMonitoring(): void {
        if (this.monitoringInterval) return;

        this.monitoringInterval = setInterval(() => {
            this.checkConnections();
        }, this.MONITORING_INTERVAL);

        // Don't prevent process exit
        this.monitoringInterval.unref();

        this.logger.info('Connection monitoring started', {
            interval: this.MONITORING_INTERVAL,
            errorThreshold: this.errorThreshold,
            responseTimeThreshold: this.responseTimeThreshold
        });
    }

    /**
     * Stop monitoring connections
     */
    stopMonitoring(): void {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        this.logger.info('Connection monitoring stopped');
    }

    /**
     * Check connection health
     */
    private checkConnections(): void {
        const metrics = this.getMetrics();
        const unhealthyConnections: string[] = [];

        for (const [id, state] of this.states.entries()) {
            if (!this.isHealthy(id)) {
                unhealthyConnections.push(id);
                this.logger.warn('Unhealthy connection detected', {
                    id,
                    errorCount: state.errorCount,
                    avgResponseTime: state.totalQueries > 0
                        ? state.totalResponseTime / state.totalQueries
                        : 0,
                    lastError: state.lastError
                });
            }
        }

        // Emit monitoring event
        this.eventManager.emitSystemEvent({
            type: EventTypes.STORAGE_ANALYZE,
            timestamp: Date.now(),
            metadata: {
                component: 'ConnectionStateManager',
                memoryUsage: process.memoryUsage(),
                metrics: {
                    cache: metrics.cache,
                    connections: metrics.connections,
                    queries: metrics.queries,
                    timestamp: metrics.timestamp
                },
                operation: 'health_check',
                unhealthyConnections,
                healthStatus: {
                    isHealthy: unhealthyConnections.length === 0,
                    errorCount: metrics.connections.errors,
                    avgResponseTime: metrics.connections.avgResponseTime
                }
            }
        });

        // Log monitoring summary
        this.logger.info('Connection health check completed', {
            total: metrics.connections.total,
            active: metrics.connections.active,
            idle: metrics.connections.idle,
            errors: metrics.connections.errors,
            avgResponseTime: metrics.connections.avgResponseTime,
            unhealthyCount: unhealthyConnections.length
        });
    }

    /**
     * Clean up resources
     */
    cleanup(): void {
        this.stopMonitoring();
        this.states.clear();
    }
}
