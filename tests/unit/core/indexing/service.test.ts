import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  IndexType,
  BaseIndexEntry,
  StatusIndexEntry,
  HierarchyIndexEntry,
  IndexService,
  createIndexService,
  IndexQueryOptions,
  IndexConfig
} from '../../../../src/core/indexing/index.js';

// Test entry type
interface TestEntry extends BaseIndexEntry {
  id: string;
  value: string;
}

describe('Index Service', () => {
  let service: IndexService;

  beforeEach(() => {
    service = createIndexService({
      validateConfig: true,
      enforceUnique: true,
      cacheSize: 100,
      autoOptimize: false,
      maxConcurrentOperations: 1,
      retryAttempts: 1
    });
  });

  afterEach(async () => {
    await service.dispose();
  });

  describe('Index Creation', () => {
    it('creates primary indexes', async () => {
      const index = await service.createIndex<TestEntry>({
        type: IndexType.PRIMARY,
        name: 'primary-index',
        unique: true
      });

      expect(index).toBeDefined();
      expect(index.config.type).toBe(IndexType.PRIMARY);
      expect(service.getIndex<TestEntry>('primary-index')).toBe(index);
    });

    it('creates status indexes with type safety', async () => {
      const config: Partial<IndexConfig> = {
        unique: true,
        type: IndexType.STATUS
      };
      const index = await service.createStatusIndex('status-index', config);
      expect(index.config.type).toBe(IndexType.STATUS);
      expect(service.getStatusIndex('status-index')).toBe(index);
    });

    it('creates hierarchy indexes with type safety', async () => {
      const config: Partial<IndexConfig> = {
        unique: true,
        type: IndexType.HIERARCHY
      };
      const index = await service.createHierarchyIndex('hierarchy-index', config);
      expect(index.config.type).toBe(IndexType.HIERARCHY);
      expect(service.getHierarchyIndex('hierarchy-index')).toBe(index);
    });

    it('enforces unique index names', async () => {
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
  });

  describe('Index Operations', () => {
    it('performs operations across indexes', async () => {
      await service.createIndex<TestEntry>({
        type: IndexType.PRIMARY,
        name: 'index1',
        unique: true
      });

      await service.createIndex<TestEntry>({
        type: IndexType.PRIMARY,
        name: 'index2',
        unique: true
      });

      const results = await service.performOperation(['index1', 'index2'], async () => ({
        success: true,
        key: 'test'
      }));

      expect(results.size).toBe(2);
      expect(results.get('index1')?.success).toBe(true);
      expect(results.get('index2')?.success).toBe(true);
    });

    it('handles operation failures', async () => {
      await service.createIndex<TestEntry>({
        type: IndexType.PRIMARY,
        name: 'error-index',
        unique: true
      });

      const results = await service.performOperation(['error-index'], async () => {
        throw new Error('operation failed');
      });

      expect(results.get('error-index')?.success).toBe(false);
      expect(results.get('error-index')?.error?.message).toBe('operation failed');
    });

    it('queries across multiple indexes', async () => {
      const index1 = await service.createIndex<TestEntry>({
        type: IndexType.PRIMARY,
        name: 'query1',
        unique: true
      });

      const index2 = await service.createIndex<TestEntry>({
        type: IndexType.PRIMARY,
        name: 'query2',
        unique: true
      });

      // Insert test data
      await index1.insert('1', { id: '1', value: 'test1' });
      await index2.insert('2', { id: '2', value: 'test2' });

      const queryOptions: IndexQueryOptions<TestEntry> = {
        filter: { value: 'test' }
      };

      const results = await service.query(['query1', 'query2'], queryOptions);

      expect(results.size).toBe(2);
      expect(results.get('query1')?.entries).toHaveLength(1);
      expect(results.get('query2')?.entries).toHaveLength(1);
    });
  });

  describe('Validation and Backup', () => {
    it('validates indexes', async () => {
      await service.createIndex<TestEntry>({
        type: IndexType.PRIMARY,
        name: 'valid-index',
        unique: true
      });

      const results = await service.validate();
      expect(results.get('valid-index')?.valid).toBe(true);
    });

    it('performs backup and restore operations', async () => {
      const index = await service.createIndex<TestEntry>({
        type: IndexType.PRIMARY,
        name: 'backup-test',
        unique: true
      });

      await index.insert('test', { id: 'test', value: 'data' });

      // Mock backup/restore paths
      const backupPath = '/tmp/test-backup';
      const results = await service.backup(backupPath);
      expect(results.get('backup-test')).toBe(true);

      // Clear and restore
      await index.clear();
      const restoreResults = await service.restore(backupPath);
      expect(restoreResults.get('backup-test')).toBe(true);

      // Verify data was restored
      const entry = await index.get('test');
      expect(entry?.value).toBe('data');
    });
  });

  describe('Resource Management', () => {
    it('disposes resources properly', async () => {
      const index = await service.createIndex<TestEntry>({
        type: IndexType.PRIMARY,
        name: 'dispose-test',
        unique: true
      });

      const clearSpy = jest.spyOn(index, 'clear');
      await service.dispose();

      expect(clearSpy).toHaveBeenCalled();
      expect(service.getIndex('dispose-test')).toBeUndefined();
    });

    it('handles cleanup during disposal', async () => {
      const operations: Promise<unknown>[] = [];

      // Start multiple operations
      for (let i = 0; i < 4; i++) {
        operations.push(
          (async () => {
            await service.performOperation([], async () => {
              await new Promise(resolve => setTimeout(resolve, 100));
              return { success: true, key: 'test' };
            });
          })()
        );
      }

      // Dispose while operations are running
      await service.dispose();

      // Verify all operations completed or were cancelled
      await Promise.allSettled(operations);
      expect(service.listIndexes().size).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('retries failed operations', async () => {
      let attempts = 0;
      const failingOperation = async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error('first attempt failed');
        }
        return { success: true, key: 'test' };
      };

      await service.createIndex<TestEntry>({
        type: IndexType.PRIMARY,
        name: 'retry-test',
        unique: true
      });

      const results = await service.performOperation(['retry-test'], failingOperation);
      expect(results.get('retry-test')?.success).toBe(true);
      expect(attempts).toBe(2);
    });

    it('handles validation errors', async () => {
      await expect(service.createIndex({
        type: IndexType.PRIMARY,
        name: '',  // Invalid name
        unique: true
      })).rejects.toThrow('Index name is required');
    });

    it('handles concurrent operation limits', async () => {
      const operations: Promise<unknown>[] = [];
      const startTimes: number[] = [];

      // Start more operations than allowed
      for (let i = 0; i < 4; i++) {
        operations.push(
          service.performOperation([], async () => {
            startTimes.push(Date.now());
            await new Promise(resolve => setTimeout(resolve, 100));
            return { success: true, key: 'test' };
          })
        );
      }

      await Promise.all(operations);

      // Verify operations were executed sequentially
      for (let i = 1; i < startTimes.length; i++) {
        expect(startTimes[i] - startTimes[i - 1]).toBeGreaterThanOrEqual(100);
      }
    });
  });
});
