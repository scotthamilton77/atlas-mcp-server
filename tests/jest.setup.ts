/// <reference types="jest" />
import { expect } from '@jest/globals';

// Configure Jest environment
process.env.NODE_ENV = 'test';

// Define custom matcher types
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidResult(): R;
      toBeErrorResult(): R;
    }
  }

  // Add global test utilities type
  function createTestId(): string;
}

// Add custom matchers
const matchers = {
  toBeValidResult(received: any) {
    const pass = received.success === true;
    return {
      message: () => `expected ${JSON.stringify(received)} to be a valid result`,
      pass
    };
  },
  toBeErrorResult(received: any) {
    const pass = received.success === false && received.error !== undefined;
    return {
      message: () => `expected ${JSON.stringify(received)} to be an error result`,
      pass
    };
  }
};

expect.extend(matchers);

// Add custom Jest environment setup
beforeAll(() => {
  // Setup any test environment requirements
});

afterAll(() => {
  // Cleanup any test environment requirements
});

// Add global test utilities
global.createTestId = () => Math.random().toString(36).substring(7);

// Export custom matchers for type checking
export { matchers };
