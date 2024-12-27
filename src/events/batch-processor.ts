import { AtlasEvent, EventTypes } from '../types/events.js';
import { Logger } from '../logging/index.js';

interface BatchConfig {
  maxBatchSize: number;
  maxWaitTime: number;
  flushInterval: number;
}

export class EventBatchProcessor {
  private logger?: Logger;
  private readonly batches = new Map<EventTypes, AtlasEvent[]>();
  private readonly timers = new Map<EventTypes, NodeJS.Timeout>();
  private readonly config: BatchConfig;

  constructor(config: Partial<BatchConfig> = {}) {
    try {
      this.logger = Logger.getInstance().child({ component: 'EventBatchProcessor' });
    } catch {
      // Logger not initialized yet, which is fine
    }
    this.config = {
      maxBatchSize: config.maxBatchSize || 100,
      maxWaitTime: config.maxWaitTime || 1000, // 1 second
      flushInterval: config.flushInterval || 5000 // 5 seconds
    };

    // Start periodic flush
    setInterval(() => this.flushAllBatches(), this.config.flushInterval);
  }

  addEvent<T extends AtlasEvent>(event: T, callback: (events: T[]) => Promise<void>): void {
    const batch = this.batches.get(event.type) || [];
    batch.push(event);
    this.batches.set(event.type, batch);

    // Clear existing timer
    const existingTimer = this.timers.get(event.type);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer for max wait time
    const timer = setTimeout(async () => {
      await this.flushBatch(event.type, callback as (events: AtlasEvent[]) => Promise<void>);
    }, this.config.maxWaitTime);

    this.timers.set(event.type, timer);

    // Flush if batch size exceeded
    if (batch.length >= this.config.maxBatchSize) {
      this.flushBatch(event.type, callback as (events: AtlasEvent[]) => Promise<void>)
        .catch(error => {
          this.logger?.error('Failed to flush batch on size limit', {
            error,
            eventType: event.type,
            batchSize: batch.length
          });
        });
    }
  }

  private async flushBatch(type: EventTypes, callback: (events: AtlasEvent[]) => Promise<void>): Promise<void> {
    const batch = this.batches.get(type);
    if (!batch?.length) {
      return;
    }

    try {
      // Clear batch and timer before processing to prevent race conditions
      this.batches.delete(type);
      const timer = this.timers.get(type);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(type);
      }

      // Process batch
      await callback(batch);

      this.logger?.debug('Batch processed successfully', {
        eventType: type,
        batchSize: batch.length
      });
    } catch (error) {
      this.logger?.error('Failed to process batch', {
        error,
        eventType: type,
        batchSize: batch.length
      });

      // Requeue failed events with exponential backoff
      const retryDelay = Math.min(1000 * Math.pow(2, batch[0].retryCount || 0), 30000);
      setTimeout(() => {
        const retriedEvents = batch.map(event => ({
          ...event,
          retryCount: (event.retryCount || 0) + 1
        }));
        retriedEvents.forEach(event => this.addEvent(event, callback));
      }, retryDelay);
    }
  }

  private async flushAllBatches(): Promise<void> {
    const types = Array.from(this.batches.keys());
    for (const type of types) {
      const callback = async (events: AtlasEvent[]) => {
        this.logger?.debug('Processing periodic flush', {
          eventType: type,
          batchSize: events.length
        });
      };
      await this.flushBatch(type, callback);
    }
  }

  cleanup(): void {
    // Clear all timers
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();

    // Clear batches
    this.batches.clear();
  }
}
