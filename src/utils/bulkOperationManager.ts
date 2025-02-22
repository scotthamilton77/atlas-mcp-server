import { logger } from './logger.js';
import { McpError } from '../types/errors.js';

export interface BulkOperationError<T, ErrorCode extends string = string> {
  index: number;
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
  item: T;
}

export interface BulkOperationResult<InputT, OutputT, ErrorCode extends string = string> {
  success: boolean;
  message: string;
  successes: OutputT[];
  errors: BulkOperationError<InputT, ErrorCode>[];
}

/**
 * Processes an array of items concurrently with a configurable concurrency limit.
 * Each operation is executed in isolation, with failures captured but not stopping other operations.
 * 
 * @param items Array of items to process
 * @param operation Async function to process each item
 * @param options Configuration options
 * @returns Object containing successful results and errors
 */
export async function processBulk<InputT, OutputT, ErrorCode extends string = string>(
  items: InputT[],
  operation: (item: InputT, index: number) => Promise<OutputT>,
  options: {
    concurrency?: number;
    operationName?: string;
    defaultErrorCode?: ErrorCode;
  } = {}
): Promise<BulkOperationResult<InputT, OutputT, ErrorCode>> {
  const {
    concurrency = 5,
    operationName = 'bulk operation',
    defaultErrorCode = 'INTERNAL_ERROR' as ErrorCode
  } = options;

  const successes: OutputT[] = [];
  const errors: BulkOperationError<InputT, ErrorCode>[] = [];
  let index = 0;

  logger.info(`Starting ${operationName}`, {
    totalItems: items.length,
    concurrency
  });

  async function worker() {
    while (index < items.length) {
      const currentIndex = index++;
      const item = items[currentIndex];

      try {
        const result = await operation(item, currentIndex);
        successes.push(result);
        
        logger.debug(`Successfully processed item ${currentIndex + 1}/${items.length}`, {
          operationName,
          index: currentIndex
        });
      } catch (err: unknown) {
        const errorDetails = err instanceof McpError ? {
          code: err.code as ErrorCode,
          message: err.message,
          details: err.details
        } : {
          code: defaultErrorCode,
          message: err instanceof Error ? err.message : 'Unknown error'
        };

        const error: BulkOperationError<InputT, ErrorCode> = {
          index: currentIndex,
          error: errorDetails,
          item
        };
        errors.push(error);

        logger.error(`Failed to process item ${currentIndex + 1}/${items.length}`, {
          operationName,
          index: currentIndex,
          error: errorDetails
        });
      }
    }
  }

  // Launch workers with configured concurrency
  await Promise.all(
    Array(Math.min(concurrency, items.length))
      .fill(null)
      .map(() => worker())
  );

  const result: BulkOperationResult<InputT, OutputT, ErrorCode> = {
    success: successes.length > 0,
    message: `Successfully processed ${successes.length} items${
      errors.length > 0 ? `, ${errors.length} failed` : ''
    }`,
    successes,
    errors
  };

  logger.info(`Completed ${operationName}`, {
    totalItems: items.length,
    successCount: successes.length,
    errorCount: errors.length
  });

  return result;
}