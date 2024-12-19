import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { Mock } from 'jest-mock';
import {
  IndexType,
  IndexService,
  BaseIndexEntry,
  StatusIndexEntry,
  HierarchyIndexEntry,
  Index,
  IndexOperationResult
} from '../../../../src/core/indexing/index.js';
import { IndexCoordinator } from '../../../../src/core/indexing/coordinator.js';

// Type for index operation function
type IndexOperation = (index: Index<BaseIndexEntry>) => Promise<IndexOperationResult>;

describe('Index Coordinator', () => {
  let coordinator: IndexCoordinator;

  beforeEach(() => {
    coordinator = new IndexCoordinator({
      validateConfig: true,
      enforceUnique: true,
      maxConcurrentOperations: 2,
      retryAttempts: 1
    });
  });

  afterEach(async () => {
    await coordinator.dispose();
  });

  describe('Index Creation and Management', () => {
    it('creates and retrieves indexes', async () => {
      const index = await coordinator.createIndex({
        type: IndexType.PRIMARY,
        name: 'test-index',
        unique: true
      });

      expect(index).toBeDefined();
      expect(coordinator.getIndex('test-index')).toBe(index);
    });

    it('creates specialized indexes with type safety', async () => {
      const statusIndex = await coordinator.createIndex<StatusIndexEntry>({
        type: IndexType.STATUS,
        name: 'status-index',
        unique: true
      });

      const hierarchyIndex = await coordinator.createIndex<HierarchyIndexEntry>({
        type: IndexType.HIERARCHY,
        name: 'hierarchy-index',
        unique: true
      });

      expect(coordinator.getStatusIndex('status-index')).toBe(statusIndex);
      expect(coordinator.getHierarchyIndex('hierarchy-index')).toBe(hierarchyIndex);
    });

    it('enforces unique index names', async () => {
      await coordinator.createIndex({
        type: IndexType.PRIMARY,
        name: 'unique-index',
        unique: true
      });

      await expect(coordinator.createIndex({
        type: IndexType.PRIMARY,
        name: 'unique-index',
        unique: true
      })).rejects.toThrow('already exists');
    });
  });

  describe('Operation Coordination', () => {
    it('coordinates operations across multiple indexes', async () => {
      const index1 = await coordinator.createIndex({
        type: IndexType.PRIMARY,
        name: 'index1',
        unique: true
      });

      const index2 = await coordinator.createIndex({
        type: IndexType.PRIMARY,
        name: 'index2',
        unique: true
      });

      await coordinator.coordinateOperation(['index1', 'index2'], async (indexes) => {
        expect(indexes).toHaveLength(2);
        expect(indexes).toContain(index1);
        expect(indexes).toContain(index2);
      });
    });

    it('handles missing indexes in coordinated operations', async () => {
      await expect(coordinator.coordinateOperation(
        ['non-existent-index'],
        async () => { /* no-op */ }
      )).rejects.toThrow('not found');
    });

    it('limits concurrent operations', async () => {
      const operations: Promise<void>[] = [];
      const startTimes: number[] = [];
      const endTimes: number[] = [];

      // Create more operations than allowed concurrently
      for (let i = 0; i < 4; i++) {
        operations.push(coordinator.coordinateOperation([], async () => {
          startTimes.push(Date.now());
          await new Promise(resolve => setTimeout(resolve, 100));
          endTimes.push(Date.now());
        }));
      }

      await Promise.all(operations);

      // Verify operations were executed in batches
      const maxConcurrent = Math.max(
        ...endTimes.map((end, i) => 
          startTimes.filter(start => start < end && start > startTimes[i - 1] || 0).length
        )
      );

      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });
  });

  describe('Bulk Operations', () => {
    it('performs bulk operations across indexes', async () => {
      await coordinator.createIndex({
        type: IndexType.PRIMARY,
        name: 'bulk1',
        unique: true
      });

      await coordinator.createIndex({
        type: IndexType.PRIMARY,
        name: 'bulk2',
        unique: true
      });

      const results = await coordinator.bulkOperation(['bulk1', 'bulk2'], async () => ({
        success: true,
        key: 'test'
      }));

      expect(results.size).toBe(2);
      expect(results.get('bulk1')?.success).toBe(true);
      expect(results.get('bulk2')?.success).toBe(true);
    });

    it('handles errors in bulk operations', async () => {
      await coordinator.createIndex({
        type: IndexType.PRIMARY,
        name: 'error-index',
        unique: true
      });

      const results = await coordinator.bulkOperation(['error-index'], async () => {
        throw new Error('operation failed');
      });

      expect(results.get('error-index')?.success).toBe(false);
      expect(results.get('error-index')?.error?.message).toBe('operation failed');
    });
  });

  describe('Validation and Optimization', () => {
    it('validates indexes', async () => {
      await coordinator.createIndex({
        type: IndexType.PRIMARY,
        name: 'valid-index',
        unique: true
      });

      const results = await coordinator.validateIndexes();
      expect(results.get('valid-index')).toBe(true);
    });

    it('retries failed operations', async () => {
      let attempts = 0;
      // Create a properly typed mock function
      const failingOperation: IndexOperation = async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error('first attempt failed');
        }
        return { success: true, key: 'test' };
      };

      const mockOperation = jest.fn(failingOperation);

      await coordinator.createIndex({
        type: IndexType.PRIMARY,
        name: 'retry-index',
        unique: true
      });

      const results = await coordinator.bulkOperation(['retry-index'], mockOperation);
      expect(results.get('retry-index')?.success).toBe(true);
      expect(attempts).toBe(2);
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });
  });

  describe('Resource Management', () => {
    it('disposes resources properly', async () => {
      const index = await coordinator.createIndex({
        type: IndexType.PRIMARY,
        name: 'dispose-test',
        unique: true
      });

      // Mock the clear method instead of dispose
      const clearSpy = jest.spyOn(index, 'clear');
      await coordinator.dispose();

      expect(clearSpy).toHaveBeenCalled();
      expect(coordinator.getIndex('dispose-test')).toBeUndefined();
    });

    it('handles cleanup of queued operations on disposal', async () => {
      const operations: Promise<void>[] = [];

      // Queue more operations than can run concurrently
      for (let i = 0; i < 4; i++) {
        operations.push(coordinator.coordinateOperation([], async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
        }));
      }

      // Dispose while operations are running
      await coordinator.dispose();

      // Verify all operations completed or were cancelled
      await Promise.allSettled(operations);
      expect(coordinator['operationQueue']).toHaveLength(0);
      expect(coordinator['activeOperations']).toBe(0);
    });
  });
});
