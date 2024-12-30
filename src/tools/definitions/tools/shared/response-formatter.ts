import { ErrorCodes, createError } from '../../../../errors/index.js';
import { Logger } from '../../../../logging/index.js';
import { ToolResponse } from '../../../../types/tool.js';

/**
 * Format and sanitize tool response
 */
export function formatResponse(result: unknown, logger: Logger): ToolResponse {
  try {
    const sanitizedResult = JSON.parse(
      JSON.stringify(result, (key, value) => {
        if (typeof value === 'bigint') {
          return value.toString();
        }
        if (
          key.toLowerCase().includes('secret') ||
          key.toLowerCase().includes('password') ||
          key.toLowerCase().includes('token')
        ) {
          return undefined;
        }
        return value;
      })
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(sanitizedResult, null, 2),
        },
      ],
    };
  } catch (error) {
    logger.error('Failed to format response', { error });
    throw createError(ErrorCodes.INTERNAL_ERROR, 'Failed to format response', 'formatResponse');
  }
}
