import { EventEmitter } from 'events';
import { Logger } from '../logging/index.js';
import { EventHealthMonitor } from './health-monitor.js';
import { EventBatchProcessor } from './batch-processor.js';
import {
  AtlasEvent,
  EventHandler,
  EventSubscription,
  EventTypes,
  TaskEvent,
  CacheEvent,
  ErrorEvent,
  BatchEvent,
  TransactionEvent,
  SystemEvent,
  EventHandlerOptions,
  SerializableError,
} from '../types/events.js';

interface EventStats {
  emitted: number;
  handled: number;
  errors: number;
  lastEmitted?: number;
  avgHandleTime: number;
  lastErrorTime?: number;
  consecutiveErrors: number;
}

export class EventManager {
  private static instance: EventManager | null = null;
  private static initializationPromise: Promise<EventManager> | null = null;
  private readonly emitter: EventEmitter;
  private static logger: Logger | null = null;
  private logger?: Logger;
  private readonly maxListeners: number = 100;
  private readonly debugMode: boolean = false; // Force debug mode off for MCP compatibility
  private initialized = false;
  private readonly activeSubscriptions = new Set<EventSubscription>();
  private readonly maxSubscriptions = 1000; // Prevent unbounded growth
  private readonly subscriptionTimeouts = new Map<string, NodeJS.Timeout>();
  private isShuttingDown = false;
  private readonly eventStats = new Map<EventTypes | '*', EventStats>();
  private readonly healthMonitor: EventHealthMonitor;
  private readonly batchProcessor: EventBatchProcessor;
  private cleanupTimeout?: NodeJS.Timeout;
  private readonly CLEANUP_INTERVAL = 60000; // 1 minute

  setLogger(logger: Logger): void {
    if (!EventManager.logger) {
      EventManager.logger = logger.child({ component: 'EventManager' });
      this.logger = EventManager.logger;
    }
  }

  private constructor() {
    // Don't initialize logger in constructor to avoid circular dependency
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(this.maxListeners);
    // Debug mode always off for MCP compatibility
    this.debugMode = false;
    this.healthMonitor = new EventHealthMonitor();
    this.batchProcessor = new EventBatchProcessor({
      maxBatchSize: 100,
      maxWaitTime: 1000,
      flushInterval: 5000,
    });
    this.setupErrorHandling();
    this.startCleanupInterval();
  }

  private startCleanupInterval(): void {
    // Clear any existing interval
    if (this.cleanupTimeout) {
      clearInterval(this.cleanupTimeout);
    }

    this.cleanupTimeout = setInterval(() => {
      if (this.isShuttingDown) return;
      
      try {
        this.cleanupStaleStats();
        this.cleanupStaleSubscriptions();
        this.checkSubscriptionLimit();
        this.monitorEventHealth();
      } catch (error) {
        this.logger?.error('Cleanup interval error', { error });
      }
    }, this.CLEANUP_INTERVAL);

    // Ensure interval is cleaned up if process exits
    process.on('beforeExit', () => {
      if (this.cleanupTimeout) {
        clearInterval(this.cleanupTimeout);
      }
    });
  }

  private cleanupStaleSubscriptions(): void {
    const now = Date.now();
    const SUBSCRIPTION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours

    for (const subscription of this.activeSubscriptions) {
      if (now - subscription.createdAt > SUBSCRIPTION_TIMEOUT) {
        subscription.unsubscribe();
        this.logger?.debug('Removed stale subscription', {
          type: subscription.type,
          age: now - subscription.createdAt,
        });
      }
    }
  }

  private checkSubscriptionLimit(): void {
    if (this.activeSubscriptions.size > this.maxSubscriptions) {
      this.logger?.warn('Subscription limit exceeded, removing oldest', {
        current: this.activeSubscriptions.size,
        limit: this.maxSubscriptions,
      });

      // Sort by creation time and remove oldest
      const sortedSubs = Array.from(this.activeSubscriptions)
        .sort((a, b) => a.createdAt - b.createdAt);

      const toRemove = sortedSubs.slice(0, sortedSubs.length - this.maxSubscriptions);
      toRemove.forEach(sub => sub.unsubscribe());
    }
  }

  private monitorEventHealth(): void {
    const now = Date.now();
    const ERROR_THRESHOLD = 5; // consecutive errors
    const ERROR_WINDOW = 60000; // 1 minute

    for (const [type, stats] of this.eventStats.entries()) {
      if (stats.consecutiveErrors >= ERROR_THRESHOLD &&
          stats.lastErrorTime &&
          now - stats.lastErrorTime < ERROR_WINDOW) {
        this.emitError('event_handler_degraded', new Error('Event handler health degraded'), {
          eventType: type,
          consecutiveErrors: stats.consecutiveErrors,
          avgHandleTime: stats.avgHandleTime,
        });
      }
    }
  }

  private cleanupStaleStats(): void {
    const now = Date.now();
    const STALE_THRESHOLD = 24 * 60 * 60 * 1000; // 24 hours

    for (const [type, stats] of this.eventStats.entries()) {
      if (stats.lastEmitted && now - stats.lastEmitted > STALE_THRESHOLD) {
        this.eventStats.delete(type);
      }
    }
  }

  static async initialize(): Promise<EventManager> {
    // Return existing instance if available
    if (EventManager.instance) {
      return EventManager.instance;
    }

    // If initialization is in progress, wait for it
    if (EventManager.initializationPromise) {
      return EventManager.initializationPromise;
    }

    // Start new initialization with mutex
    EventManager.initializationPromise = (async () => {
      try {
        // Double-check instance hasn't been created while waiting
        if (EventManager.instance) {
          return EventManager.instance;
        }

        const instance = new EventManager();
        instance.initialized = true;
        EventManager.instance = instance;
        return EventManager.instance;
      } catch (error) {
        throw new Error(
          `Failed to initialize EventManager: ${error instanceof Error ? error.message : String(error)}`
        );
      } finally {
        EventManager.initializationPromise = null;
      }
    })();

    return EventManager.initializationPromise;
  }

  static getInstance(): EventManager {
    if (!EventManager.instance || !EventManager.instance.initialized) {
      throw new Error('EventManager not initialized. Call EventManager.initialize() first.');
    }
    return EventManager.instance;
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    // Clear cleanup interval
    if (this.cleanupTimeout) {
      clearInterval(this.cleanupTimeout);
      this.cleanupTimeout = undefined;
    }

    // Clear all subscription timeouts
    for (const timeout of this.subscriptionTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.subscriptionTimeouts.clear();

    // Wait for active handlers to complete
    await this.healthMonitor.waitForActiveHandlers();

    // Cleanup resources
    this.removeAllListeners();
    this.eventStats.clear();
    await this.batchProcessor.shutdown();
    this.healthMonitor.cleanup();

    this.isShuttingDown = false;
  }

  emit<T extends AtlasEvent>(event: T, options?: { batch?: boolean; priority?: 'high' | 'medium' | 'low' }): boolean {
    if (this.isShuttingDown) {
      this.logger?.warn('Rejecting event during shutdown', {
        type: event.type,
        timestamp: event.timestamp,
      });
      return false;
    }

    try {
      if (this.debugMode && EventManager.logger !== null) {
        try {
          const debugInfo: Record<string, unknown> = {
            type: event.type,
            timestamp: event.timestamp,
            batch: options?.batch,
          };

          // Handle different event types' metadata/context
          if ('metadata' in event) {
            // Ensure metadata is serializable
            debugInfo.metadata = JSON.parse(JSON.stringify(event.metadata));
          } else if ('context' in event) {
            // Ensure context is serializable
            debugInfo.context = JSON.parse(JSON.stringify(event.context));
          }

          EventManager.logger.debug('Emitting event', debugInfo);
        } catch (debugError) {
          // If debug logging fails, log a simpler message
          const safeDebugInfo = {
            type: event.type,
            timestamp: event.timestamp,
            error: 'Failed to stringify event details',
          };
          EventManager.logger.debug('Emitting event (simplified)', safeDebugInfo);
        }
      }

      // Add timestamp and metadata
      if (!event.timestamp) {
        event.timestamp = Date.now();
      }

      // Update event stats
      const stats = this.eventStats.get(event.type) || {
        emitted: 0,
        handled: 0,
        errors: 0,
        avgHandleTime: 0,
        consecutiveErrors: 0,
      };
      stats.emitted++;
      stats.lastEmitted = event.timestamp;
      this.eventStats.set(event.type, stats);

      // Check circuit breaker
      if (stats.consecutiveErrors >= 5 && // threshold
          stats.lastErrorTime &&
          Date.now() - stats.lastErrorTime < 60000) { // 1 minute window
        this.logger?.warn('Circuit breaker active, rejecting event', {
          type: event.type,
          consecutiveErrors: stats.consecutiveErrors,
          lastError: new Date(stats.lastErrorTime).toISOString(),
        });
        return false;
      }

      // Check if event should be batched
      if (options?.batch) {
        this.batchProcessor.addEvent(event, async events => {
          const batchStartTime = Date.now();
          let batchResults;
          try {
            batchResults = await Promise.all(
              events.map(e => {
                const typeResult = this.emitter.emit(e.type, e);
                const wildcardResult = this.emitter.emit('*', e);
                return typeResult || wildcardResult;
              })
            );

            // Update success metrics
            const successCount = batchResults.filter(Boolean).length;
            if (successCount > 0) {
              stats.handled += successCount;
              stats.consecutiveErrors = 0;
              stats.avgHandleTime = 
                (stats.avgHandleTime * 0.9) + ((Date.now() - batchStartTime) * 0.1);
            }
          } catch (error) {
            stats.errors++;
            stats.consecutiveErrors++;
            stats.lastErrorTime = Date.now();
            throw error;
          }
        });
        return true; // Batch queued successfully
      }

      // Emit event directly if not batched
      const typeResult = this.emitter.emit(event.type, event);
      const wildcardResult = this.emitter.emit('*', event);

      // Update handled count if any listeners processed the event
      if (typeResult || wildcardResult) {
        stats.handled++;
      }

      return typeResult || wildcardResult;
    } catch (error) {
      if (EventManager.logger) {
        EventManager.logger.error('Event emission failed', {
          error,
          event: {
            type: event.type,
            timestamp: event.timestamp,
            batch: options?.batch,
          },
        });

        // Emit error event
        this.emitError('event_emission_failed', error as Error, {
          eventType: event.type,
          batch: options?.batch,
        });
      }
      return false;
    }
  }

  on<T extends AtlasEvent>(
    type: EventTypes | '*',
    handler: EventHandler<T>,
    options: EventHandlerOptions = {}
  ): EventSubscription {
    if (this.debugMode && EventManager.logger) {
      EventManager.logger.debug('Adding event listener', { type });
    }

    // Create unique handler ID for health monitoring
    const handlerId = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Wrap handler with health monitoring
    const monitoredHandler = this.healthMonitor.wrapHandler(type, handler, handlerId);

    const { timeout = 5000, maxRetries = 3 } = options;

    // Wrap handler with timeout and retry logic
    const wrappedHandler = async (event: T) => {
      let attempts = 0;
      while (attempts < maxRetries) {
        try {
          const handlerPromise = monitoredHandler(event);
          await Promise.race([
            handlerPromise,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Handler timeout')), timeout)
            ),
          ]);
          break;
        } catch (error) {
          attempts++;
          const stats = this.eventStats.get(type) || {
            emitted: 0,
            handled: 0,
            errors: 0,
            avgHandleTime: 0,
            consecutiveErrors: 0,
          };
          stats.errors++;
          this.eventStats.set(type, stats);

          if (EventManager.logger) {
            EventManager.logger.error('Event handler error', {
              error,
              eventType: type,
              attempt: attempts,
              handlerId,
            });
          }

          if (attempts === maxRetries) {
            this.emitError('event_handler_error', error as Error, {
              eventType: type,
              attempts,
              handlerId,
            });
          }
        }
      }
    };

    this.emitter.on(type, wrappedHandler);

    // Create subscription with enhanced cleanup
    const subscription: EventSubscription = {
      unsubscribe: () => {
        this.emitter.off(type, wrappedHandler);
        this.activeSubscriptions.delete(subscription);
        if (this.debugMode && EventManager.logger) {
          EventManager.logger.debug('Removed event listener', {
            type,
            handlerId,
            remainingListeners: this.listenerCount(type),
            totalSubscriptions: this.activeSubscriptions.size,
          });
        }
      },
      type,
      createdAt: Date.now(),
    };

    this.activeSubscriptions.add(subscription);
    return subscription;
  }

  once<T extends AtlasEvent>(
    type: EventTypes | '*',
    handler: EventHandler<T>,
    options: EventHandlerOptions = {}
  ): EventSubscription {
    if (this.debugMode && EventManager.logger) {
      EventManager.logger.debug('Adding one-time event listener', { type });
    }

    // Create unique handler ID for health monitoring
    const handlerId = `${type}_once_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Wrap handler with health monitoring
    const monitoredHandler = this.healthMonitor.wrapHandler(type, handler, handlerId);

    const { timeout = 5000, maxRetries = 1 } = options;

    // Wrap handler with timeout and retry logic
    const wrappedHandler = async (event: T) => {
      let attempts = 0;
      while (attempts < maxRetries) {
        try {
          const handlerPromise = monitoredHandler(event);
          await Promise.race([
            handlerPromise,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Handler timeout')), timeout)
            ),
          ]);
          break;
        } catch (error) {
          attempts++;
          const stats = this.eventStats.get(type) || {
            emitted: 0,
            handled: 0,
            errors: 0,
            avgHandleTime: 0,
            consecutiveErrors: 0,
          };
          stats.errors++;
          this.eventStats.set(type, stats);

          if (EventManager.logger) {
            EventManager.logger.error('One-time event handler error', {
              error,
              eventType: type,
              attempt: attempts,
              handlerId,
            });
          }

          if (attempts === maxRetries) {
            this.emitError('event_handler_error', error as Error, {
              eventType: type,
              oneTime: true,
              attempts,
              handlerId,
            });
          }
        }
      }
    };

    this.emitter.once(type, wrappedHandler);

    // Create subscription with enhanced cleanup
    const subscription: EventSubscription = {
      unsubscribe: () => {
        this.emitter.off(type, wrappedHandler);
        this.activeSubscriptions.delete(subscription);
        if (this.debugMode && EventManager.logger) {
          EventManager.logger.debug('Removed one-time event listener', {
            type,
            handlerId,
            remainingListeners: this.listenerCount(type),
            totalSubscriptions: this.activeSubscriptions.size,
          });
        }
      },
      type,
      createdAt: Date.now(),
    };

    this.activeSubscriptions.add(subscription);
    return subscription;
  }

  removeAllListeners(type?: EventTypes | '*'): void {
    if (type) {
      this.emitter.removeAllListeners(type);
      // Remove matching subscriptions
      for (const subscription of this.activeSubscriptions) {
        if (subscription.type === type) {
          this.activeSubscriptions.delete(subscription);
        }
      }
    } else {
      this.emitter.removeAllListeners();
      this.activeSubscriptions.clear();
    }

    if (this.debugMode && EventManager.logger) {
      EventManager.logger.debug('Removed listeners', {
        type: type || 'all',
        remainingSubscriptions: this.activeSubscriptions.size,
      });
    }
  }

  /**
   * Gets event statistics for monitoring and debugging
   */
  getEventStats(): Map<
    EventTypes | '*',
    {
      emitted: number;
      handled: number;
      errors: number;
      lastEmitted?: number;
    }
  > {
    return new Map(this.eventStats);
  }

  /**
   * Gets active subscription information for monitoring
   */
  getActiveSubscriptions(): Array<{
    type: EventTypes | '*';
    createdAt: number;
    age: number;
  }> {
    const now = Date.now();
    return Array.from(this.activeSubscriptions).map(sub => ({
      type: sub.type,
      createdAt: sub.createdAt,
      age: now - sub.createdAt,
    }));
  }

  /**
   * Gets health statistics for event handlers
   */
  getHandlerHealthStats(): Map<
    string,
    {
      successCount: number;
      errorCount: number;
      avgResponseTime: number;
      lastExecuted?: number;
      consecutiveFailures: number;
      isCircuitOpen: boolean;
      nextRetryTime?: number;
    }
  > {
    return this.healthMonitor.getAllHandlerStats();
  }

  /**
   * Manually reset circuit breaker for a handler
   */
  resetHandlerCircuitBreaker(handlerId: string): void {
    this.healthMonitor.resetCircuitBreaker(handlerId);
  }

  /**
   * Cleanup resources and stop monitoring
   */
  cleanup(): void {
    if (this.cleanupTimeout) {
      clearInterval(this.cleanupTimeout);
      this.cleanupTimeout = undefined;
    }
    this.removeAllListeners();
    this.eventStats.clear();
    this.healthMonitor.cleanup();
    this.batchProcessor.cleanup();
  }

  listenerCount(type: EventTypes | '*'): number {
    return this.emitter.listenerCount(type);
  }

  private setupErrorHandling(): void {
    // Handle emitter errors
    this.emitter.on('error', (error: Error) => {
      if (EventManager.logger) {
        EventManager.logger.error('EventEmitter error', { error });
      }
    });

    // Handle uncaught promise rejections in handlers
    process.on('unhandledRejection', (reason, promise) => {
      if (EventManager.logger) {
        EventManager.logger.error('Unhandled promise rejection in event handler', {
          reason,
          promise,
        });
      }
    });
  }

  private emitError(context: string, error: Error, metadata?: Record<string, unknown>): void {
    try {
      // Convert Error to SerializableError
      const serializableError: SerializableError = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };

      // Add any additional enumerable properties
      for (const key of Object.keys(error)) {
        try {
          const value = (error as any)[key];
          // Only include if JSON serializable
          JSON.stringify(value);
          serializableError[key] = value;
        } catch {
          // Skip non-serializable properties
          continue;
        }
      }

      // Ensure metadata is serializable
      const safeMetadata = metadata ? JSON.parse(JSON.stringify(metadata)) : {};

      const errorEvent: ErrorEvent = {
        type: EventTypes.SYSTEM_ERROR,
        timestamp: Date.now(),
        error: serializableError,
        context: {
          component: 'EventManager',
          operation: context,
          ...safeMetadata,
        },
      };

      this.emitter.emit(EventTypes.SYSTEM_ERROR, errorEvent);
    } catch (emitError) {
      // Last resort error logging with minimal info to ensure it works
      if (EventManager.logger) {
        EventManager.logger.error('Failed to emit error event', {
          errorMessage: error.message,
          errorName: error.name,
          context,
          emitErrorMessage: emitError instanceof Error ? emitError.message : String(emitError),
        });
      }
    }
  }

  // Typed event emission helpers
  emitTaskEvent(event: TaskEvent): void {
    this.emit(event);
  }

  emitCacheEvent(event: CacheEvent): void {
    this.emit(event);
  }

  emitErrorEvent(event: ErrorEvent): void {
    this.emit(event);
  }

  emitBatchEvent(event: BatchEvent): void {
    this.emit(event, { batch: true });
  }

  emitTransactionEvent(event: TransactionEvent): void {
    this.emit(event);
  }

  emitSystemEvent(event: SystemEvent): void {
    this.emit(event);
  }
}
