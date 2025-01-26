/**
 * Sampling schemas for LLM interactions
 */

/** Request LLM sampling */
export const createSamplingSchema = {
  type: 'object',
  properties: {
    messages: {
      type: 'array',
      description: 'Conversation history for context',
      items: {
        type: 'object',
        properties: {
          role: {
            type: 'string',
            enum: ['user', 'assistant'],
            description: 'Message role',
          },
          content: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['text', 'image'],
                description: 'Content type',
              },
              text: {
                type: 'string',
                description: 'Text content',
              },
              data: {
                type: 'string',
                description: 'Base64 encoded image data',
              },
              mimeType: {
                type: 'string',
                description: 'Content MIME type',
              },
            },
            required: ['type'],
          },
        },
        required: ['role', 'content'],
      },
    },
    modelPreferences: {
      type: 'object',
      description: 'Model selection preferences',
      properties: {
        hints: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Suggested model name/family',
              },
            },
          },
          description: 'Preferred model suggestions',
        },
        costPriority: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Importance of minimizing cost (0-1)',
        },
        speedPriority: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Importance of low latency (0-1)',
        },
        intelligencePriority: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Importance of model capabilities (0-1)',
        },
      },
    },
    systemPrompt: {
      type: 'string',
      description: 'Optional system prompt',
    },
    includeContext: {
      type: 'string',
      enum: ['none', 'thisServer', 'allServers'],
      description: 'MCP context to include',
      default: 'none',
    },
    temperature: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Sampling temperature (0-1)',
      default: 0.7,
    },
    maxTokens: {
      type: 'number',
      minimum: 1,
      description: 'Maximum tokens to generate',
      default: 1000,
    },
    stopSequences: {
      type: 'array',
      items: {
        type: 'string',
      },
      description: 'Sequences that stop generation',
    },
  },
  required: ['messages', 'maxTokens'],
};

/** Progress reporting for long operations */
export const progressSchema = {
  type: 'object',
  properties: {
    operationId: {
      type: 'string',
      description: 'Unique operation identifier',
    },
    progress: {
      type: 'number',
      minimum: 0,
      maximum: 100,
      description: 'Operation progress percentage',
    },
    status: {
      type: 'string',
      enum: ['running', 'completed', 'failed'],
      description: 'Operation status',
    },
    message: {
      type: 'string',
      description: 'Progress message or error details',
    },
    details: {
      type: 'object',
      description: 'Operation-specific progress details',
    },
  },
  required: ['operationId', 'progress', 'status'],
};
