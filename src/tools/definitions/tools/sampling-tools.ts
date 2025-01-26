/**
 * Sampling tool implementations
 */
import { ToolImplementation } from './shared/types.js';
import { Logger } from '../../../logging/index.js';
import { SamplingHandler } from '../../sampling-handler.js';

interface SamplingContext {
  samplingHandler: SamplingHandler;
  logger: Logger;
}

export function createSamplingTools(context: SamplingContext): ToolImplementation[] {
  return [
    {
      definition: {
        name: 'create_sampling',
        description:
          'Request LLM sampling with progress tracking. Supports conversation history, model preferences, and completion monitoring.',
        inputSchema: {
          type: 'object',
          properties: {
            messages: {
              type: 'array',
              description: 'Messages with role (user/assistant) and content (text/image)',
              items: {
                type: 'object',
                properties: {
                  role: {
                    type: 'string',
                    enum: ['user', 'assistant'],
                  },
                  content: {
                    type: 'object',
                    properties: {
                      type: { type: 'string', enum: ['text', 'image'] },
                      text: { type: 'string' },
                      data: { type: 'string' },
                      mimeType: { type: 'string' },
                    },
                    required: ['type'],
                  },
                },
                required: ['role', 'content'],
              },
            },
            modelPreferences: {
              type: 'object',
              description: 'Optional model selection preferences (cost, speed, capabilities)',
              properties: {
                hints: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { name: { type: 'string' } },
                  },
                },
                costPriority: { type: 'number', minimum: 0, maximum: 1 },
                speedPriority: { type: 'number', minimum: 0, maximum: 1 },
                intelligencePriority: { type: 'number', minimum: 0, maximum: 1 },
              },
            },
          },
          required: ['messages'],
        },
      },
      handler: args => context.samplingHandler.createSamplingMessage(args),
    },
    {
      definition: {
        name: 'get_progress',
        description:
          'Get progress of a long-running operation. Returns completion status, progress percentage, and details.',
        inputSchema: {
          type: 'object',
          properties: {
            operationId: {
              type: 'string',
              description: 'Operation identifier from create_sampling response',
            },
          },
          required: ['operationId'],
        },
      },
      handler: async args => {
        const progress = await context.samplingHandler.getProgress(args.operationId as string);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(progress, null, 2),
            },
          ],
        };
      },
    },
  ];
}
