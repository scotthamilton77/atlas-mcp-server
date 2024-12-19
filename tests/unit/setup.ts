import { beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import type { MockStorage, MockTransaction, MockIndex } from '../jest.d.ts';

// Initialize mock implementations from global
const mockStorage: MockStorage = global.mockImplementations.storage;
const mockTransaction: MockTransaction = global.mockImplementations.transaction;
const mockIndex: MockIndex = global.mockImplementations.index;

// Global test setup
beforeAll(() => {
  // Initialize test environment
});

afterAll(() => {
  // Cleanup test environment
});

beforeEach(() => {
  // Reset all mocks before each test
  jest.clearAllMocks();
});

afterEach(() => {
  // Cleanup after each test
});

// Export typed mock implementations for use in tests
export {
  mockStorage,
  mockTransaction,
  mockIndex
};
