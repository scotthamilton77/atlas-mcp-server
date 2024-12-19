import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  IndexType,
  BaseIndexEntry,
  StatusIndexEntry,
  HierarchyIndexEntry,
  IndexService,
  createIndexService,
  IndexOperationResult,
  IndexQueryOptions,
  IndexConfig
} from '../../../../src/core/indexing/index.js';
import { TaskStatus } from '../../../../src/shared/types/task.js';

// Define the IndexEntry type inline
interface IndexEntry<T> {
  key: string;
  value: T;
  metadata?: Record<string, unknown>;
}

interface TestEntry extends BaseIndexEntry {
  id: string;
  value: string;
  metadata?: Record<string, unknown>;
}

describe('Index Operations', () => {
  let service: IndexService;

  beforeEach(() => {
    service = createIndexService({
      validateConfig: true,
      enforceUnique: true,
      cacheSize: 100
    });
  });

  afterEach(async () => {
    await service.dispose();
  });

  describe('Basic Operations', () => {
    it('performs single entry operations', async () => {
      const index = await service.createIndex<TestEntry>({
        type: IndexType.PRIMARY,
        name: 'test-index',
        unique: true
      });

      // Insert
      const entry: TestEntry = { id: 'test1', value: 'value1' };
      await index.insert('test1', entry);

      // Get
      const retrieved = await index.get('test1');
      expect(retrieved).toEqual(entry);

      // Update
      const updated: TestEntry = { id: 'test1', value: 'updated' };
      await index.update('test1', updated);
      const afterUpdate = await index.get('test1');
      expect(afterUpdate).toEqual(updated);

      // Delete
      await index.delete('test1');
      const afterDelete = await index.get('test1');
      expect(afterDelete).toBeUndefined();
    });

    it('handles bulk operations', async () => {
      const index = await service.createIndex<TestEntry>({
        type: IndexType.PRIMARY,
        name: 'bulk-test',
        unique: true
      });

      // Bulk insert
      const entries = [
        { key: '1', value: { id: '1', value: 'one' } },
        { key: '2', value: { id: '2', value: 'two' } },
        { key: '3', value: { id: '3', value: 'three' } }
      ];

      await index.bulkInsert(entries);

      // Verify all entries
      for (const { key, value } of entries) {
        const retrieved = await index.get(key);
        expect(retrieved).toEqual(value);
      }

      // Bulk update
      const updates = [
        { key: '1', value: { id: '1', value: 'ONE' } },
        { key: '2', value: { id: '2', value: 'TWO' } }
      ];

      await index.bulkUpdate(updates);

      // Verify updates
      for (const { key, value } of updates) {
        const retrieved = await index.get(key);
        expect(retrieved).toEqual(value);
      }

      // Bulk delete
      await index.bulkDelete(['1', '2']);
      expect(await index.get('1')).toBeUndefined();
      expect(await index.get('2')).toBeUndefined();
      expect(await index.get('3')).toBeDefined();
    });
  });

  describe('Query Operations', () => {
    it('performs filtered queries', async () => {
      const index = await service.createIndex<TestEntry>({
        type: IndexType.PRIMARY,
        name: 'query-test',
        unique: true
      });

      // Insert test data
      await index.insert('1', { id: '1', value: 'test1', metadata: { tag: 'a' } });
      await index.insert('2', { id: '2', value: 'test2', metadata: { tag: 'a' } });
      await index.insert('3', { id: '3', value: 'other', metadata: { tag: 'b' } });

      // Query by value
      const valueResults = await index.query({
        filter: { field: 'value', value: 'test' }
      });
      expect(valueResults.entries).toHaveLength(2);

      // Query by metadata
      const metadataResults = await index.query({
        filter: { field: 'metadata.tag', value: 'a' }
      });
      expect(metadataResults.entries).toHaveLength(2);
    });

    it('supports pagination', async () => {
      const index = await service.createIndex<TestEntry>({
        type: IndexType.PRIMARY,
        name: 'pagination-test',
        unique: true
      });

      // Insert test data
      for (let i = 0; i < 10; i++) {
        await index.insert(
          `key${i}`,
          { id: `key${i}`, value: `value${i}` }
        );
      }

      // First page
      const page1 = await index.query({
        limit: 3,
        offset: 0
      });
      expect(page1.entries).toHaveLength(3);
      expect(page1.total).toBe(10);

      // Second page
      const page2 = await index.query({
        limit: 3,
        offset: 3
      });
      expect(page2.entries).toHaveLength(3);
      expect((page2.entries[0] as IndexEntry<TestEntry>).value.id).toBe('key3');
    });

    it('supports sorting', async () => {
      const index = await service.createIndex<TestEntry>({
        type: IndexType.PRIMARY,
        name: 'sort-test',
        unique: true
      });

      // Insert test data in random order
      await index.insert('3', { id: '3', value: 'c' });
      await index.insert('1', { id: '1', value: 'a' });
      await index.insert('2', { id: '2', value: 'b' });

      // Sort by value ascending
      const ascResults = await index.query({
        sort: { field: 'value', order: 'asc' }
      });
      expect(ascResults.entries.map(e => (e as IndexEntry<TestEntry>).value.value)).toEqual(['a', 'b', 'c']);

      // Sort by value descending
      const descResults = await index.query({
        sort: { field: 'value', order: 'desc' }
      });
      expect(descResults.entries.map(e => (e as IndexEntry<TestEntry>).value.value)).toEqual(['c', 'b', 'a']);
    });
  });

  describe('Status Index Operations', () => {
    it('handles status transitions', async () => {
      const index = await service.createStatusIndex('status-test', {
        unique: true,
        type: IndexType.STATUS
      });

      const entry: StatusIndexEntry = {
        taskId: 'task1',
        status: TaskStatus.PENDING,
        updatedAt: new Date().toISOString()
      };

      // Initial insert
      await index.insert('task1', entry);
      
      // Valid transition
      const updated: StatusIndexEntry = {
        ...entry,
        status: TaskStatus.IN_PROGRESS,
        updatedAt: new Date().toISOString()
      };
      await index.update('task1', updated);

      // Invalid transition should fail
      const invalid: StatusIndexEntry = {
        ...updated,
        status: TaskStatus.COMPLETED,  // Can't go directly to completed
        updatedAt: new Date().toISOString()
      };
      await expect(index.update('task1', invalid)).rejects.toThrow();
    });
  });

  describe('Hierarchy Index Operations', () => {
    it('maintains hierarchy relationships', async () => {
      const index = await service.createHierarchyIndex('hierarchy-test', {
        unique: true,
        type: IndexType.HIERARCHY
      });

      // Create hierarchy
      const root: HierarchyIndexEntry = {
        taskId: 'root',
        parentId: null,
        children: [],
        depth: 0,
        path: ['root']
      };

      const child: HierarchyIndexEntry = {
        taskId: 'child',
        parentId: 'root',
        children: [],
        depth: 1,
        path: ['root', 'child']
      };

      await index.insert('root', root);
      await index.insert('child', child);

      // Update parent's children
      const updatedRoot: HierarchyIndexEntry = {
        ...root,
        children: ['child']
      };
      await index.update('root', updatedRoot);

      // Verify relationships
      const retrievedRoot = await index.get('root');
      const retrievedChild = await index.get('child');

      expect(retrievedRoot).toBeDefined();
      expect(retrievedChild).toBeDefined();

      if (retrievedRoot && retrievedChild) {
        const rootValue = (retrievedRoot as IndexEntry<HierarchyIndexEntry>).value;
        const childValue = (retrievedChild as IndexEntry<HierarchyIndexEntry>).value;

        expect(rootValue.children).toContain('child');
        expect(childValue.parentId).toBe('root');
        expect(childValue.path).toEqual(['root', 'child']);
      }
    });

    it('enforces hierarchy constraints', async () => {
      const index = await service.createHierarchyIndex('depth-test', {
        unique: true,
        type: IndexType.HIERARCHY
      });

      // Create hierarchy
      const root: HierarchyIndexEntry = {
        taskId: 'root',
        parentId: null,
        children: [],
        depth: 0,
        path: ['root']
      };

      const child: HierarchyIndexEntry = {
        taskId: 'child',
        parentId: 'root',
        children: [],
        depth: 1,
        path: ['root', 'child']
      };

      await index.insert('root', root);
      await index.insert('child', child);

      // Circular reference should fail
      const circular: HierarchyIndexEntry = {
        taskId: 'root',
        parentId: 'child',
        children: [],
        depth: 2,
        path: ['root', 'child', 'root']
      };

      await expect(index.update('root', circular)).rejects.toThrow();
    });
  });
});
