import {
    baseIdSchema,
    taskIdSchema,
    sessionIdSchema,
    taskListIdSchema,
    idArraySchema,
    optionalIdSchema,
    taskReferenceSchema,
    sessionReferenceSchema
} from '../../../src/validation/id-schema.js';
import { generateShortId, generateTestId } from '../../../src/utils/id-generator.js';

describe('ID Schema Validation', () => {
    describe('baseIdSchema', () => {
        it('accepts valid short IDs', () => {
            const id = generateShortId();
            const result = baseIdSchema.safeParse(id);
            expect(result.success).toBe(true);
        });

        it('rejects invalid IDs', () => {
            const invalidIds = ['', 'abc', 'toolong123', 'invalid!@#', '12345-67'];
            invalidIds.forEach(id => {
                const result = baseIdSchema.safeParse(id);
                expect(result.success).toBe(false);
            });
        });
    });

    describe('entity-specific schemas', () => {
        it('validates task IDs', () => {
            const id = generateTestId('tk', 1);
            const result = taskIdSchema.safeParse(id);
            expect(result.success).toBe(true);
        });

        it('validates session IDs', () => {
            const id = generateTestId('ss', 1);
            const result = sessionIdSchema.safeParse(id);
            expect(result.success).toBe(true);
        });

        it('validates task list IDs', () => {
            const id = generateTestId('tl', 1);
            const result = taskListIdSchema.safeParse(id);
            expect(result.success).toBe(true);
        });
    });

    describe('idArraySchema', () => {
        it('validates arrays of valid IDs', () => {
            const ids = [
                generateTestId('t1', 1),
                generateTestId('t2', 2),
                generateTestId('t3', 3)
            ];
            const result = idArraySchema.safeParse(ids);
            expect(result.success).toBe(true);
        });

        it('rejects arrays with invalid IDs', () => {
            const ids = [
                generateTestId('t1', 1),
                'invalid',
                generateTestId('t3', 3)
            ];
            const result = idArraySchema.safeParse(ids);
            expect(result.success).toBe(false);
        });
    });

    describe('optionalIdSchema', () => {
        it('accepts valid IDs', () => {
            const id = generateShortId();
            const result = optionalIdSchema.safeParse(id);
            expect(result.success).toBe(true);
        });

        it('accepts undefined', () => {
            const result = optionalIdSchema.safeParse(undefined);
            expect(result.success).toBe(true);
        });

        it('rejects invalid IDs', () => {
            const result = optionalIdSchema.safeParse('invalid');
            expect(result.success).toBe(false);
        });
    });

    describe('taskReferenceSchema', () => {
        it('validates complete task references', () => {
            const taskRef = {
                id: generateTestId('tk', 1),
                parentId: generateTestId('tk', 2),
                dependencies: [generateTestId('tk', 3), generateTestId('tk', 4)],
                subtasks: [generateTestId('tk', 5), generateTestId('tk', 6)]
            };
            const result = taskReferenceSchema.safeParse(taskRef);
            expect(result.success).toBe(true);
        });

        it('validates minimal task references', () => {
            const taskRef = {
                id: generateTestId('tk', 1)
            };
            const result = taskReferenceSchema.safeParse(taskRef);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.dependencies).toEqual([]);
                expect(result.data.subtasks).toEqual([]);
            }
        });

        it('rejects invalid task references', () => {
            const taskRef = {
                id: 'invalid',
                parentId: 'also-invalid',
                dependencies: ['not-valid'],
                subtasks: ['still-not-valid']
            };
            const result = taskReferenceSchema.safeParse(taskRef);
            expect(result.success).toBe(false);
        });
    });

    describe('sessionReferenceSchema', () => {
        it('validates complete session references', () => {
            const sessionRef = {
                id: generateTestId('ss', 1),
                activeTaskListId: generateTestId('tl', 1),
                taskListIds: [generateTestId('tl', 2), generateTestId('tl', 3)]
            };
            const result = sessionReferenceSchema.safeParse(sessionRef);
            expect(result.success).toBe(true);
        });

        it('validates minimal session references', () => {
            const sessionRef = {
                id: generateTestId('ss', 1)
            };
            const result = sessionReferenceSchema.safeParse(sessionRef);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.taskListIds).toEqual([]);
            }
        });

        it('rejects invalid session references', () => {
            const sessionRef = {
                id: 'invalid',
                activeTaskListId: 'not-valid',
                taskListIds: ['still-not-valid']
            };
            const result = sessionReferenceSchema.safeParse(sessionRef);
            expect(result.success).toBe(false);
        });
    });
});
