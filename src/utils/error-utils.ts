import { SerializableError } from '../types/events.js';

/**
 * Converts an Error object to a SerializableError object
 * that can be safely stringified to JSON
 */
/**
 * Gets all enumerable property names of an Error object,
 * including those from the prototype chain
 */
function getErrorPropertyNames(error: Error): string[] {
  const propertyNames = new Set<string>();
  let currentObj: any = error;

  while (currentObj && currentObj !== Object.prototype) {
    Object.getOwnPropertyNames(currentObj).forEach(name => propertyNames.add(name));
    currentObj = Object.getPrototypeOf(currentObj);
  }

  return Array.from(propertyNames);
}

export function toSerializableError(err: Error | unknown): SerializableError {
  // Convert unknown to Error
  const error: Error = err instanceof Error ? err : new Error(String(err));

  // Create base serializable error
  const serializableError: SerializableError = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };

  // Add any additional serializable properties
  getErrorPropertyNames(error).forEach(key => {
    try {
      const value = (error as any)[key];
      // Skip if undefined, function, or symbol
      if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
        return;
      }
      // Only include if JSON serializable
      JSON.stringify(value);
      serializableError[key] = value;
    } catch {
      // Skip non-serializable properties
    }
  });

  return serializableError;
}
