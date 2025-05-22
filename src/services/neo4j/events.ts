import { EventEmitter } from "events";
import { logger, requestContextService } from "../../utils/index.js"; // Updated import path

/**
 * Event types for database operations
 */
export enum DatabaseEventType {
  WRITE_OPERATION = "write_operation",
  READ_OPERATION = "read_operation",
  TRANSACTION_COMPLETE = "transaction_complete",
  ERROR = "error",
}

/**
 * Database event system to facilitate communication between services
 * Uses the publish-subscribe pattern to decouple components
 */
class DatabaseEventSystem {
  private emitter: EventEmitter;
  private static instance: DatabaseEventSystem;

  private constructor() {
    this.emitter = new EventEmitter();
    // Set a higher limit for listeners to avoid warnings
    this.emitter.setMaxListeners(20);

    // Log all events in debug mode
    if (process.env.NODE_ENV === "development") {
      this.emitter.on(DatabaseEventType.WRITE_OPERATION, (details) => {
        const reqContext = requestContextService.createRequestContext({
          operation: "DatabaseEvent.WRITE_OPERATION",
          eventDetails: details,
        });
        logger.debug("Database write operation", reqContext);
      });

      this.emitter.on(DatabaseEventType.ERROR, (error) => {
        const reqContext = requestContextService.createRequestContext({
          operation: "DatabaseEvent.ERROR",
          eventError: error,
        });
        logger.debug("Database event error", reqContext);
      });
    }
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): DatabaseEventSystem {
    if (!DatabaseEventSystem.instance) {
      DatabaseEventSystem.instance = new DatabaseEventSystem();
    }
    return DatabaseEventSystem.instance;
  }

  /**
   * Subscribe to a database event
   * @param eventType Event type to subscribe to
   * @param listener Function to call when the event occurs
   */
  public subscribe<T>(
    eventType: DatabaseEventType,
    listener: (data: T) => void,
  ): void {
    this.emitter.on(eventType, listener);
  }

  /**
   * Unsubscribe from a database event
   * @param eventType Event type to unsubscribe from
   * @param listener Function to remove
   */
  public unsubscribe<T>(
    eventType: DatabaseEventType,
    listener: (data: T) => void,
  ): void {
    this.emitter.off(eventType, listener);
  }

  /**
   * Publish a database event
   * @param eventType Event type to publish
   * @param data Event data
   */
  public publish<T>(eventType: DatabaseEventType, data: T): void {
    this.emitter.emit(eventType, data);
  }

  /**
   * Subscribe to a database event only once
   * @param eventType Event type to subscribe to
   * @param listener Function to call when the event occurs
   */
  public subscribeOnce<T>(
    eventType: DatabaseEventType,
    listener: (data: T) => void,
  ): void {
    this.emitter.once(eventType, listener);
  }
}

// Export singleton instance
export const databaseEvents = DatabaseEventSystem.getInstance();
