/**
 * Sampling handler for LLM interactions
 */
import { Logger } from '../logging/index.js';
import { ErrorCodes, createError } from '../errors/index.js';
import { v4 as uuidv4 } from 'uuid';

interface ProgressUpdate {
  operationId: string;
  progress: number;
  status: 'running' | 'completed' | 'failed';
  message?: string;
  details?: Record<string, unknown>;
}

export class SamplingHandler {
  private readonly logger: Logger;
  private readonly activeOperations: Map<string, ProgressUpdate> = new Map();

  constructor() {
    this.logger = Logger.getInstance().child({
      component: 'SamplingHandler',
    });
  }

  async createSamplingMessage(args: Record<string, unknown>): Promise<{
    content: Array<{ type: string; text: string }>;
    _meta?: { operationId: string };
  }> {
    const operationId = uuidv4();

    try {
      // Validate required fields
      if (!args.messages || !Array.isArray(args.messages)) {
        throw createError(
          ErrorCodes.INVALID_INPUT,
          'Messages array is required',
          'createSamplingMessage'
        );
      }

      // Initialize progress tracking
      this.activeOperations.set(operationId, {
        operationId,
        progress: 0,
        status: 'running',
        message: 'Initializing sampling request',
      });

      // Update progress
      await this.updateProgress(operationId, {
        progress: 20,
        message: 'Validating request parameters',
      });

      // Validate model preferences if provided
      if (args.modelPreferences) {
        const prefs = args.modelPreferences as Record<string, unknown>;
        ['costPriority', 'speedPriority', 'intelligencePriority'].forEach(pref => {
          const value = prefs[pref] as number;
          if (value !== undefined && (value < 0 || value > 1)) {
            throw createError(
              ErrorCodes.INVALID_INPUT,
              `${pref} must be between 0 and 1`,
              'createSamplingMessage'
            );
          }
        });
      }

      // Update progress
      await this.updateProgress(operationId, {
        progress: 40,
        message: 'Processing messages',
      });

      // Process messages
      const messages = args.messages as Array<{
        role: string;
        content: { type: string; text?: string; data?: string; mimeType?: string };
      }>;

      // Validate each message
      messages.forEach(msg => {
        if (!msg.role || !['user', 'assistant'].includes(msg.role)) {
          throw createError(
            ErrorCodes.INVALID_INPUT,
            'Invalid message role',
            'createSamplingMessage'
          );
        }
        if (!msg.content || !msg.content.type) {
          throw createError(
            ErrorCodes.INVALID_INPUT,
            'Invalid message content',
            'createSamplingMessage'
          );
        }
      });

      // Update progress
      await this.updateProgress(operationId, {
        progress: 60,
        message: 'Preparing sampling request',
      });

      // Format response
      const response = {
        content: [
          {
            type: 'text',
            text: 'Sampling request prepared successfully',
          },
        ],
        _meta: { operationId },
      };

      // Complete operation
      await this.updateProgress(operationId, {
        progress: 100,
        status: 'completed',
        message: 'Sampling request completed',
      });

      return response;
    } catch (error) {
      // Handle failure
      await this.updateProgress(operationId, {
        progress: 100,
        status: 'failed',
        message: error instanceof Error ? error.message : 'Sampling request failed',
      });

      throw error;
    }
  }

  async getProgress(operationId: string): Promise<ProgressUpdate | undefined> {
    return this.activeOperations.get(operationId);
  }

  private async updateProgress(
    operationId: string,
    update: Partial<Omit<ProgressUpdate, 'operationId'>>
  ): Promise<void> {
    const current = this.activeOperations.get(operationId);
    if (!current) return;

    const updated = {
      ...current,
      ...update,
    };

    this.activeOperations.set(operationId, updated);

    this.logger.debug('Operation progress updated', {
      operationId,
      progress: updated.progress,
      status: updated.status,
      message: updated.message,
    });

    // Clean up completed/failed operations after a delay
    if (updated.status === 'completed' || updated.status === 'failed') {
      setTimeout(() => {
        this.activeOperations.delete(operationId);
      }, 300000); // Keep for 5 minutes
    }
  }
}
