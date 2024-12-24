import { EventEmitter } from 'events';
import { Logger } from '../logging/index.js';
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
  SystemEvent
} from '../types/events.js';

export class EventManager {
  private static instance: EventManager | null = null;
  private static initializationPromise: Promise<EventManager> | null = null;
  private readonly emitter: EventEmitter;
  private static logger: Logger;
  private readonly maxListeners: number = 100;
  private readonly debugMode: boolean;
  private initialized = false;

  private static initLogger(): void {
    if (!EventManager.logger) {
      EventManager.logger = Logger.getInstance().child({ component: 'EventManager' });
    }
  }

  private constructor() {
    EventManager.initLogger();
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(this.maxListeners);
    this.debugMode = process.env.NODE_ENV === 'development';
    this.setupErrorHandling();
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

        EventManager.instance = new EventManager();
        EventManager.instance.initialized = true;
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

  emit<T extends AtlasEvent>(event: T): void {
    try {
      if (this.debugMode) {
        const debugInfo: Record<string, unknown> = {
          type: event.type,
          timestamp: event.timestamp
        };

        // Handle different event types' metadata/context
        if ('metadata' in event) {
          debugInfo.metadata = event.metadata;
        } else if ('context' in event) {
          debugInfo.context = event.context;
        }

        EventManager.logger.debug('Emitting event', debugInfo);
      }

      // Add timestamp if not present
      if (!event.timestamp) {
        event.timestamp = Date.now();
      }

      this.emitter.emit(event.type, event);

      // Emit to wildcard listeners
      this.emitter.emit('*', event);
    } catch (error) {
      EventManager.logger.error('Event emission failed', {
        error,
        event: {
          type: event.type,
          timestamp: event.timestamp
        }
      });

      // Emit error event
      this.emitError('event_emission_failed', error as Error, {
        eventType: event.type
      });
    }
  }

  on<T extends AtlasEvent>(
    type: EventTypes | '*',
    handler: EventHandler<T>
  ): EventSubscription {
    if (this.debugMode) {
      EventManager.logger.debug('Adding event listener', { type });
    }

    // Wrap handler to catch errors
    const wrappedHandler = async (event: T) => {
      try {
        await handler(event);
      } catch (error) {
        EventManager.logger.error('Event handler error', {
          error,
          eventType: type
        });
        this.emitError('event_handler_error', error as Error, {
          eventType: type
        });
      }
    };

    this.emitter.on(type, wrappedHandler);

    // Return subscription object
    return {
      unsubscribe: () => {
        this.emitter.off(type, wrappedHandler);
        if (this.debugMode) {
          EventManager.logger.debug('Removed event listener', { type });
        }
      }
    };
  }

  once<T extends AtlasEvent>(
    type: EventTypes | '*',
    handler: EventHandler<T>
  ): EventSubscription {
    if (this.debugMode) {
      EventManager.logger.debug('Adding one-time event listener', { type });
    }

    // Wrap handler to catch errors
    const wrappedHandler = async (event: T) => {
      try {
        await handler(event);
      } catch (error) {
        EventManager.logger.error('One-time event handler error', {
          error,
          eventType: type
        });
        this.emitError('event_handler_error', error as Error, {
          eventType: type,
          oneTime: true
        });
      }
    };

    this.emitter.once(type, wrappedHandler);

    // Return subscription object
    return {
      unsubscribe: () => {
        this.emitter.off(type, wrappedHandler);
        if (this.debugMode) {
          EventManager.logger.debug('Removed one-time event listener', { type });
        }
      }
    };
  }

  removeAllListeners(type?: EventTypes | '*'): void {
    if (type) {
      this.emitter.removeAllListeners(type);
      if (this.debugMode) {
        EventManager.logger.debug('Removed all listeners for event type', { type });
      }
    } else {
      this.emitter.removeAllListeners();
      if (this.debugMode) {
        EventManager.logger.debug('Removed all event listeners');
      }
    }
  }

  listenerCount(type: EventTypes | '*'): number {
    return this.emitter.listenerCount(type);
  }

  private setupErrorHandling(): void {
    // Handle emitter errors
    this.emitter.on('error', (error: Error) => {
      EventManager.logger.error('EventEmitter error', { error });
    });

    // Handle uncaught promise rejections in handlers
    process.on('unhandledRejection', (reason, promise) => {
      EventManager.logger.error('Unhandled promise rejection in event handler', {
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
      EventManager.logger.error('Failed to emit error event', {
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
    this.emit(event);
  }

  emitTransactionEvent(event: TransactionEvent): void {
    this.emit(event);
  }

  emitSystemEvent(event: SystemEvent): void {
    this.emit(event);
  }
}
