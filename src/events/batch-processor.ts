import { AtlasEvent, EventTypes } from '../types/events.js';
import { Logger } from '../logging/index.js';

interface BatchConfig {
  maxBatchSize: number;
  maxWaitTime: number;
  flushInterval: number;
  maxRetries?: number;
  maxConcurrentBatches?: number;
  priorityLevels?: {
    high: number;
    medium: number;
    low: number;
  };
}

interface BatchMetrics {
  processedCount: number;
  failedCount: number;
  avgProcessingTime: number;
  lastProcessed?: number;
  retryCount: number;
}

interface DeadLetterEvent {
  event: AtlasEvent;
  error: Error;
  attempts: number;
  lastAttempt: number;
}

export class EventBatchProcessor {
  private logger?: Logger;
  private readonly batches = new Map<EventTypes, AtlasEvent[]>();
  private readonly timers = new Map<EventTypes, NodeJS.Timeout>();
  private readonly metrics = new Map<EventTypes, BatchMetrics>();
  private readonly deadLetterQueue = new Map<EventTypes, DeadLetterEvent[]>();
  private readonly config: BatchConfig;
  private flushInterval?: NodeJS.Timeout;
  private memoryCheckInterval?: NodeJS.Timeout;
  private isShuttingDown = false;
  private activeProcessing = new Set<string>();

  constructor(config: Partial<BatchConfig> = {}) {
    try {
      this.logger = Logger.getInstance().child({ component: 'EventBatchProcessor' });
    } catch {
      // Logger not initialized yet, which is fine
    }
    this.config = {
      maxBatchSize: config.maxBatchSize || 100,
      maxWaitTime: config.maxWaitTime || 1000, // 1 second
      flushInterval: config.flushInterval || 5000, // 5 seconds
      maxRetries: config.maxRetries || 3,
      maxConcurrentBatches: config.maxConcurrentBatches || 3,
      priorityLevels: config.priorityLevels || {
        high: 0,
        medium: 1000,
        low: 5000,
      },
    };

    this.startPeriodicFlush();
    this.setupMemoryMonitoring();
  }

  private exitHandler = () => {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
    }
  };

  private startPeriodicFlush(): void {
    // Clear any existing interval
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }

    // Start new interval
    this.flushInterval = setInterval(() => {
      if (!this.isShuttingDown) {
        this.flushAllBatches().catch(error => {
          this.logger?.error('Periodic flush failed', { error });
        });
      }
    }, this.config.flushInterval);

    // Ensure cleanup on process exit
    process.on('beforeExit', this.exitHandler);
  }

  private checkMemoryPressure = () => {
    const memUsage = process.memoryUsage();
    const heapUsed = memUsage.heapUsed / memUsage.heapTotal;

    if (heapUsed > 0.8) {
      // 80% heap usage
      this.logger?.warn('High memory pressure detected', { heapUsed });
      // Force flush all batches
      this.flushAllBatches().catch(error => {
        this.logger?.error('Emergency flush failed', { error });
      });
    }
  };

  private setupMemoryMonitoring(): void {
    // Clear any existing interval
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
    }
    this.memoryCheckInterval = setInterval(this.checkMemoryPressure, 30000); // Check every 30 seconds
  }

  addEvent<T extends AtlasEvent>(event: T, callback: (events: T[]) => Promise<void>): void {
    if (this.isShuttingDown) {
      this.logger?.warn('Rejecting event during shutdown', { eventType: event.type });
      return;
    }
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
      this.flushBatch(event.type, callback as (events: AtlasEvent[]) => Promise<void>).catch(
        error => {
          this.logger?.error('Failed to flush batch on size limit', {
            error,
            eventType: event.type,
            batchSize: batch.length,
          });
        }
      );
    }
  }

  private async flushBatch(
    type: EventTypes,
    callback: (events: AtlasEvent[]) => Promise<void>
  ): Promise<void> {
    // Check concurrent batch limit
    if (this.activeProcessing.size >= (this.config.maxConcurrentBatches || 3)) {
      this.logger?.debug('Concurrent batch limit reached, deferring', { type });
      return;
    }

    const batchId = `${type}_${Date.now()}`;
    this.activeProcessing.add(batchId);
    try {
      const batch = this.batches.get(type);
      if (!batch?.length) {
        return;
      }

      const startTime = Date.now();

      // Clear batch and timer before processing to prevent race conditions
      this.batches.delete(type);
      const timer = this.timers.get(type);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(type);
      }

      // Process batch with timeout
      try {
        await Promise.race([
          callback(batch),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Batch processing timeout')), 30000)
          ),
        ]);

        // Update success metrics
        const metrics = this.getMetrics(type);
        metrics.processedCount += batch.length;
        metrics.lastProcessed = Date.now();
        metrics.avgProcessingTime =
          metrics.avgProcessingTime * 0.9 + (Date.now() - startTime) * 0.1;

        this.logger?.debug('Batch processed successfully', {
          eventType: type,
          batchSize: batch.length,
          processingTime: Date.now() - startTime,
        });
      } catch (error) {
        // Update failure metrics
        const metrics = this.getMetrics(type);
        metrics.failedCount += batch.length;
        metrics.retryCount++;

        this.logger?.error('Failed to process batch', {
          error,
          eventType: type,
          batchSize: batch.length,
          attempt: metrics.retryCount,
        });

        if (metrics.retryCount >= (this.config.maxRetries || 3)) {
          // Move to dead letter queue
          const deadLetterEvents = batch.map(event => ({
            event,
            error: error as Error,
            attempts: metrics.retryCount,
            lastAttempt: Date.now(),
          }));

          const existing = this.deadLetterQueue.get(type) || [];
          this.deadLetterQueue.set(type, [...existing, ...deadLetterEvents]);

          this.logger?.error('Events moved to dead letter queue', {
            eventType: type,
            count: batch.length,
            totalAttempts: metrics.retryCount,
          });
        } else {
          // Requeue with exponential backoff
          const retryDelay = Math.min(1000 * Math.pow(2, metrics.retryCount), 30000);

          setTimeout(() => {
            const retriedEvents = batch.map(event => ({
              ...event,
              retryCount: (event.retryCount || 0) + 1,
            }));
            retriedEvents.forEach(event => this.addEvent(event, callback));
          }, retryDelay);
        }
      }
    } finally {
      this.activeProcessing.delete(batchId);
    }
  }

  private async flushAllBatches(): Promise<void> {
    const types = Array.from(this.batches.keys());
    for (const type of types) {
      const callback = async (events: AtlasEvent[]) => {
        this.logger?.debug('Processing periodic flush', {
          eventType: type,
          batchSize: events.length,
        });
      };
      await this.flushBatch(type, callback);
    }
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    // Clear periodic flush interval
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = undefined;
    }

    // Clear memory check interval
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
      this.memoryCheckInterval = undefined;
    }

    // Remove event listeners
    process.off('beforeExit', this.exitHandler);

    // Clear all timers
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();

    // Wait for active processing to complete
    if (this.activeProcessing.size > 0) {
      this.logger?.info('Waiting for active batch processing to complete', {
        remaining: this.activeProcessing.size,
      });

      await new Promise<void>(resolve => {
        const checkInterval = setInterval(() => {
          if (this.activeProcessing.size === 0) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
      });
    }

    // Clear remaining state
    this.batches.clear();
    this.metrics.clear();
    this.deadLetterQueue.clear();
    this.isShuttingDown = false;
  }

  getMetrics(type: EventTypes): BatchMetrics {
    if (!this.metrics.has(type)) {
      this.metrics.set(type, {
        processedCount: 0,
        failedCount: 0,
        avgProcessingTime: 0,
        retryCount: 0,
      });
    }
    return this.metrics.get(type)!;
  }

  getDeadLetterEvents(type?: EventTypes): Map<EventTypes, DeadLetterEvent[]> {
    if (type) {
      const events = this.deadLetterQueue.get(type);
      return new Map([[type, events || []]]);
    }
    return new Map(this.deadLetterQueue);
  }

  cleanup(): void {
    this.shutdown().catch(error => {
      this.logger?.error('Error during cleanup', { error });
    });
  }
}
