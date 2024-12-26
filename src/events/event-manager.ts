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
  EventHandlerOptions
} from '../types/events.js';

export class EventManager {
  private static instance: EventManager | null = null;
  private static initializationPromise: Promise<EventManager> | null = null;
  private readonly emitter: EventEmitter;
  private static logger: Logger;
  private readonly maxListeners: number = 100;
  private readonly debugMode: boolean;
  private initialized = false;
  private readonly activeSubscriptions = new Set<EventSubscription>();
  private readonly eventStats = new Map<EventTypes | '*', {
    emitted: number;
    handled: number;
    errors: number;
    lastEmitted?: number;
  }>();
  private readonly healthMonitor: EventHealthMonitor;
  private readonly batchProcessor: EventBatchProcessor;
  private cleanupTimeout?: NodeJS.Timeout;
  private readonly CLEANUP_INTERVAL = 60000; // 1 minute

  setLogger(logger: Logger): void {
    EventManager.logger = logger.child({ component: 'EventManager' });
  }

  private constructor() {
    // Don't initialize logger in constructor to avoid circular dependency
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(this.maxListeners);
    this.debugMode = process.env.NODE_ENV === 'development';
    this.healthMonitor = new EventHealthMonitor();
    this.batchProcessor = new EventBatchProcessor({
      maxBatchSize: 100,
      maxWaitTime: 1000,
      flushInterval: 5000
    });
    this.setupErrorHandling();
    this.startCleanupInterval();
  }

  private startCleanupInterval(): void {
    // Clear any existing interval
    if (this.cleanupTimeout) {
      clearInterval(this.cleanupTimeout);
    }

    // Set up cleanup interval with weak reference
    const weakThis = new WeakRef(this);
    this.cleanupTimeout = setInterval(() => {
      const instance = weakThis.deref();
      if (!instance) {
        // If instance is garbage collected, stop interval
        if (this.cleanupTimeout) {
          clearInterval(this.cleanupTimeout);
        }
        return;
      }

      instance.cleanupStaleStats();
    }, this.CLEANUP_INTERVAL);

    // Ensure interval is cleaned up if process exits
    process.on('beforeExit', () => {
      if (this.cleanupTimeout) {
        clearInterval(this.cleanupTimeout);
      }
    });
  }

  private cleanupStaleStats(): void {
    const now = Date.now();
    const STALE_THRESHOLD = 24 * 60 * 60 * 1000; // 24 hours

    for (const [type, stats] of this.eventStats.entries()) {
      if (stats.lastEmitted && (now - stats.lastEmitted > STALE_THRESHOLD)) {
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
        throw new Error(`Failed to initialize EventManager: ${error instanceof Error ? error.message : String(error)}`);
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

  emit<T extends AtlasEvent>(event: T, options?: { batch?: boolean }): boolean {
    try {
      if (this.debugMode) {
        const debugInfo: Record<string, unknown> = {
          type: event.type,
          timestamp: event.timestamp,
          batch: options?.batch
        };

        // Handle different event types' metadata/context
        if ('metadata' in event) {
          debugInfo.metadata = event.metadata;
        } else if ('context' in event) {
          debugInfo.context = event.context;
        }

        if (EventManager.logger) {
          EventManager.logger.debug('Emitting event', debugInfo);
        } else {
          console.debug('Emitting event', debugInfo);
        }
      }

      // Add timestamp if not present
      if (!event.timestamp) {
        event.timestamp = Date.now();
      }

      // Update event stats
      const stats = this.eventStats.get(event.type) || { emitted: 0, handled: 0, errors: 0 };
      stats.emitted++;
      stats.lastEmitted = event.timestamp;
      this.eventStats.set(event.type, stats);

      // Check if event should be batched
      if (options?.batch) {
        this.batchProcessor.addEvent(event, async (events) => {
          const results = await Promise.all(events.map(e => {
            const typeResult = this.emitter.emit(e.type, e);
            const wildcardResult = this.emitter.emit('*', e);
            return typeResult || wildcardResult;
          }));
          
          // Update stats for batched events
          const successCount = results.filter(Boolean).length;
          if (successCount > 0) {
            stats.handled += successCount;
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
      const logError = EventManager.logger
        ? EventManager.logger.error.bind(EventManager.logger)
        : console.error;
      logError('Event emission failed', {
        error,
        event: {
          type: event.type,
          timestamp: event.timestamp,
          batch: options?.batch
        }
      });

      // Emit error event
      this.emitError('event_emission_failed', error as Error, {
        eventType: event.type,
        batch: options?.batch
      });
      return false;
    }
  }

  on<T extends AtlasEvent>(
    type: EventTypes | '*',
    handler: EventHandler<T>,
    options: EventHandlerOptions = {}
  ): EventSubscription {
    if (this.debugMode) {
      const logger = EventManager.logger || console;
      logger.debug('Adding event listener', { type });
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
            )
          ]);
          break;
        } catch (error) {
          attempts++;
          const stats = this.eventStats.get(type) || { emitted: 0, handled: 0, errors: 0 };
          stats.errors++;
          this.eventStats.set(type, stats);

          const logError = EventManager.logger
            ? EventManager.logger.error.bind(EventManager.logger)
            : console.error;
          logError('Event handler error', {
            error,
            eventType: type,
            attempt: attempts,
            handlerId
          });

          if (attempts === maxRetries) {
            this.emitError('event_handler_error', error as Error, {
              eventType: type,
              attempts,
              handlerId
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
        if (this.debugMode) {
          const logger = EventManager.logger || console;
          logger.debug('Removed event listener', { 
            type,
            handlerId,
            remainingListeners: this.listenerCount(type),
            totalSubscriptions: this.activeSubscriptions.size
          });
        }
      },
      type,
      createdAt: Date.now()
    };

    this.activeSubscriptions.add(subscription);
    return subscription;
  }

  once<T extends AtlasEvent>(
    type: EventTypes | '*',
    handler: EventHandler<T>,
    options: EventHandlerOptions = {}
  ): EventSubscription {
    if (this.debugMode) {
      const logger = EventManager.logger || console;
      logger.debug('Adding one-time event listener', { type });
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
            )
          ]);
          break;
        } catch (error) {
          attempts++;
          const stats = this.eventStats.get(type) || { emitted: 0, handled: 0, errors: 0 };
          stats.errors++;
          this.eventStats.set(type, stats);

          const logError = EventManager.logger
            ? EventManager.logger.error.bind(EventManager.logger)
            : console.error;
          logError('One-time event handler error', {
            error,
            eventType: type,
            attempt: attempts,
            handlerId
          });

          if (attempts === maxRetries) {
            this.emitError('event_handler_error', error as Error, {
              eventType: type,
              oneTime: true,
              attempts,
              handlerId
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
        if (this.debugMode) {
          const logger = EventManager.logger || console;
          logger.debug('Removed one-time event listener', { 
            type,
            handlerId,
            remainingListeners: this.listenerCount(type),
            totalSubscriptions: this.activeSubscriptions.size
          });
        }
      },
      type,
      createdAt: Date.now()
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

    if (this.debugMode) {
      const logger = EventManager.logger || console;
      logger.debug('Removed listeners', {
        type: type || 'all',
        remainingSubscriptions: this.activeSubscriptions.size
      });
    }
  }

  /**
   * Gets event statistics for monitoring and debugging
   */
  getEventStats(): Map<EventTypes | '*', {
    emitted: number;
    handled: number;
    errors: number;
    lastEmitted?: number;
  }> {
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
      age: now - sub.createdAt
    }));
  }

  /**
   * Gets health statistics for event handlers
   */
  getHandlerHealthStats(): Map<string, {
    successCount: number;
    errorCount: number;
    avgResponseTime: number;
    lastExecuted?: number;
    consecutiveFailures: number;
    isCircuitOpen: boolean;
    nextRetryTime?: number;
  }> {
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
      const logError = EventManager.logger
        ? EventManager.logger.error.bind(EventManager.logger)
        : console.error;
      logError('EventEmitter error', { error });
    });

    // Handle uncaught promise rejections in handlers
    process.on('unhandledRejection', (reason, promise) => {
      const logError = EventManager.logger
        ? EventManager.logger.error.bind(EventManager.logger)
        : console.error;
      logError('Unhandled promise rejection in event handler', {
        reason,
        promise
      });
    });
  }

  private emitError(
    context: string,
    error: Error,
    metadata?: Record<string, unknown>
  ): void {
    const errorEvent: ErrorEvent = {
      type: EventTypes.SYSTEM_ERROR,
      timestamp: Date.now(),
      error,
      context: {
        component: 'EventManager',
        operation: context,
        ...metadata
      }
    };

    try {
      this.emitter.emit(EventTypes.SYSTEM_ERROR, errorEvent);
    } catch (emitError) {
      // Last resort error logging
      const logError = EventManager.logger
        ? EventManager.logger.error.bind(EventManager.logger)
        : console.error;
      logError('Failed to emit error event', {
        originalError: error,
        emitError,
        context
      });
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
