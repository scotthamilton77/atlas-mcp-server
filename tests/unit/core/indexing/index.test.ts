import {
  createDefaultIndexService,
  createDevIndexService,
  createProdIndexService,
  createTestIndexService,
  IndexType,
  IndexService,
  IndexError,
  ValidationError,
  ConfigurationError,
  OperationError,
  ConcurrencyError,
  isIndexError,
  isValidationError,
  isConfigurationError,
  isOperationError,
  isConcurrencyError,
  validateIndexConfig,
  validateIndexName
} from '../../../../src/core/indexing/index.js';

import {
  initializeIndexing,
  getIndexingService,
  resetIndexing,
  startIndexing,
  stopIndexing,
  getIndexingStatus,
  handleIndexingError
} from '../../../../src/core/indexing/main.js';

// Import Jest
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

describe('Indexing System', () => {
  afterEach(async () => {
    await resetIndexing();
  });

  describe('Service Creation', () => {
    it('creates default service with correct configuration', () => {
      const service = createDefaultIndexService();
      expect(service).toBeInstanceOf(IndexService);
      expect(service['config'].validateConfig).toBe(true);
      expect(service['config'].enforceUnique).toBe(true);
    });

    it('creates dev service with validation enabled', () => {
      const service = createDevIndexService();
      expect(service['config'].validateConfig).toBe(true);
      expect(service['config'].autoOptimize).toBe(false);
      expect(service['config'].maxConcurrentOperations).toBe(1);
    });

    it('creates prod service optimized for performance', () => {
      const service = createProdIndexService();
      expect(service['config'].validateConfig).toBe(false);
      expect(service['config'].autoOptimize).toBe(true);
      expect(service['config'].maxConcurrentOperations).toBeGreaterThan(1);
    });

    it('creates test service with strict validation', () => {
      const service = createTestIndexService();
      expect(service['config'].validateConfig).toBe(true);
      expect(service['config'].autoOptimize).toBe(false);
      expect(service['config'].retryAttempts).toBe(0);
    });
  });

  describe('Lifecycle Management', () => {
    it('initializes and retrieves global service', async () => {
      const service = initializeIndexing();
      expect(service).toBeDefined();
      expect(getIndexingService()).toBe(service);
    });

    it('prevents multiple initializations', () => {
      initializeIndexing();
      expect(() => initializeIndexing()).toThrow('already initialized');
    });

    it('resets system state', async () => {
      const service = initializeIndexing();
      await resetIndexing();
      expect(() => getIndexingService()).toThrow('not initialized');
    });

    it('starts and stops indexing system', async () => {
      const service = await startIndexing();
      expect(getIndexingService()).toBe(service);
      await stopIndexing();
      expect(() => getIndexingService()).toThrow('not initialized');
    });
  });

  describe('Index Operations', () => {
    let service: IndexService;

    beforeEach(() => {
      service = createTestIndexService();
    });

    afterEach(async () => {
      await service.dispose();
    });

    it('creates and manages indexes', async () => {
      const index = await service.createIndex({
        type: IndexType.PRIMARY,
        name: 'test-index',
        unique: true
      });

      expect(index).toBeDefined();
      expect(service.getIndex('test-index')).toBe(index);
    });

    it('enforces unique index names when configured', async () => {
      await service.createIndex({
        type: IndexType.PRIMARY,
        name: 'unique-index',
        unique: true
      });

      await expect(service.createIndex({
        type: IndexType.PRIMARY,
        name: 'unique-index',
        unique: true
      })).rejects.toThrow('already exists');
    });

    it('validates index configuration', () => {
      expect(() => validateIndexConfig({
        type: IndexType.PRIMARY,
        name: '',
        unique: true
      })).toThrow(ConfigurationError);

      expect(() => validateIndexConfig({
        type: 'INVALID' as IndexType,
        name: 'test',
        unique: true
      })).toThrow(ConfigurationError);
    });

    it('validates index names', () => {
      expect(() => validateIndexName('valid-name')).not.toThrow();
      expect(() => validateIndexName('valid_name')).not.toThrow();
      expect(() => validateIndexName('invalid name')).toThrow(ConfigurationError);
      expect(() => validateIndexName('invalid@name')).toThrow(ConfigurationError);
    });
  });

  describe('Error Handling', () => {
    it('identifies error types correctly', () => {
      const indexError = new IndexError('test', 'TEST_ERROR');
      const validationError = new ValidationError('test');
      const configError = new ConfigurationError('test');
      const opError = new OperationError('test');
      const concurrencyError = new ConcurrencyError('test');

      expect(isIndexError(indexError)).toBe(true);
      expect(isValidationError(validationError)).toBe(true);
      expect(isConfigurationError(configError)).toBe(true);
      expect(isOperationError(opError)).toBe(true);
      expect(isConcurrencyError(concurrencyError)).toBe(true);

      expect(isValidationError(indexError)).toBe(false);
      expect(isConfigurationError(validationError)).toBe(false);
      expect(isOperationError(configError)).toBe(false);
      expect(isConcurrencyError(opError)).toBe(false);
    });

    it('handles errors appropriately', () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

      handleIndexingError(new Error('test error'));
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });

  describe('System Status', () => {
    it('reports correct initialization status', () => {
      expect(getIndexingStatus()).toEqual({
        initialized: false,
        mode: 'none',
        indexes: 0
      });

      const service = initializeIndexing('test');
      expect(getIndexingStatus()).toEqual({
        initialized: true,
        mode: 'test',
        indexes: 0
      });
    });

    it('tracks number of indexes', async () => {
      const service = initializeIndexing();
      await service.createIndex({
        type: IndexType.PRIMARY,
        name: 'index1',
        unique: true
      });

      await service.createIndex({
        type: IndexType.STATUS,
        name: 'index2',
        unique: true
      });

      const status = getIndexingStatus();
      expect(status.indexes).toBe(2);
    });
  });
});
