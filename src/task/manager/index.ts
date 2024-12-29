import { TaskManagerErrorHandler } from './error-handler.js';

let errorHandler: TaskManagerErrorHandler | null = null;

/**
 * Gets the task manager error handler instance
 */
export function getErrorHandler(): TaskManagerErrorHandler {
  if (!errorHandler) {
    errorHandler = new TaskManagerErrorHandler();
  }
  return errorHandler;
}

export { TaskManagerErrorHandler } from './error-handler.js';
export { TaskManager } from './task-manager.js';
