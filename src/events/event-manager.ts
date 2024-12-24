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
  private static instance: EventManager;
  private readonly emitter: EventEmitter;
  private readonly logger: Logger;
  private readonly maxListeners: number = 100;
  private readonly debugMode: boolean;

  private constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(this.maxListeners);
    this.logger = Logger.getInstance().child({ component: 'EventManager' });
    this.debugMode = process.env.NODE_ENV === 'development';
    this.setupErrorHandling();
  }

  static getInstance(): EventManager {
    if (!EventManager.instance) {
      EventManager.instance = new EventManager();
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

        this.logger.debug('Emitting event', debugInfo);
      }

      // Add timestamp if not present
      if (!event.timestamp) {
        event.timestamp = Date.now();
      }

      this.emitter.emit(event.type, event);

      // Emit to wildcard listeners
      this.emitter.emit('*', event);
    } catch (error) {
      this.logger.error('Event emission failed', {
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
      this.logger.debug('Adding event listener', { type });
    }

    // Wrap handler to catch errors
    const wrappedHandler = async (event: T) => {
      try {
        await handler(event);
      } catch (error) {
        this.logger.error('Event handler error', {
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
          this.logger.debug('Removed event listener', { type });
        }
      }
    };
  }

  once<T extends AtlasEvent>(
    type: EventTypes | '*',
    handler: EventHandler<T>
  ): EventSubscription {
    if (this.debugMode) {
      this.logger.debug('Adding one-time event listener', { type });
    }

    // Wrap handler to catch errors
    const wrappedHandler = async (event: T) => {
      try {
        await handler(event);
      } catch (error) {
        this.logger.error('One-time event handler error', {
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
          this.logger.debug('Removed one-time event listener', { type });
        }
      }
    };
  }

  removeAllListeners(type?: EventTypes | '*'): void {
    if (type) {
      this.emitter.removeAllListeners(type);
      if (this.debugMode) {
        this.logger.debug('Removed all listeners for event type', { type });
      }
    } else {
      this.emitter.removeAllListeners();
      if (this.debugMode) {
        this.logger.debug('Removed all event listeners');
      }
    }
  }

  listenerCount(type: EventTypes | '*'): number {
    return this.emitter.listenerCount(type);
  }

  private setupErrorHandling(): void {
    // Handle emitter errors
    this.emitter.on('error', (error: Error) => {
      this.logger.error('EventEmitter error', { error });
    });

    // Handle uncaught promise rejections in handlers
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled promise rejection in event handler', {
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
      this.logger.error('Failed to emit error event', {
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
