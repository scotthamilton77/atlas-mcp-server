import { validateCreateTask, validateUpdateTask } from '../../../src/validation/task.js';
import { TaskType, TaskStatus, NoteType } from '../../../src/types/task.js';

describe('Task Validation', () => {
    describe('validateCreateTask', () => {
        it('should validate a valid task creation input', () => {
            const validInput = {
                name: 'Test Task',
                description: 'Test Description',
                type: TaskType.TASK,
                notes: [{
                    type: NoteType.TEXT,
                    content: 'Test note'
                }]
            };

            expect(() => validateCreateTask(validInput)).not.toThrow();
        });

        it('should validate a task with code note', () => {
            const validInput = {
                name: 'Test Task',
                notes: [{
                    type: NoteType.CODE,
                    content: 'console.log("test")',
                    language: 'javascript'
                }]
            };

            expect(() => validateCreateTask(validInput)).not.toThrow();
        });

        it('should reject task with empty name', () => {
            const invalidInput = {
                name: '',
                type: TaskType.TASK
            };

            expect(() => validateCreateTask(invalidInput)).toThrow();
        });

        it('should reject task with invalid note type', () => {
            const invalidInput = {
                name: 'Test Task',
                notes: [{
                    type: 'invalid' as NoteType,
                    content: 'Test'
                }]
            };

            expect(() => validateCreateTask(invalidInput)).toThrow();
        });

        it('should reject code note without language', () => {
            const invalidInput = {
                name: 'Test Task',
                notes: [{
                    type: NoteType.CODE,
                    content: 'console.log("test")'
                }]
            };

            expect(() => validateCreateTask(invalidInput)).toThrow();
        });
    });

    describe('validateUpdateTask', () => {
        it('should validate a valid task update', () => {
            const validUpdate = {
                name: 'Updated Task',
                status: TaskStatus.IN_PROGRESS,
                notes: [{
                    type: NoteType.TEXT,
                    content: 'Updated note'
                }]
            };

            expect(() => validateUpdateTask(validUpdate)).not.toThrow();
        });

        it('should validate partial updates', () => {
            const partialUpdate = {
                status: TaskStatus.COMPLETED
            };

            expect(() => validateUpdateTask(partialUpdate)).not.toThrow();
        });

        it('should reject invalid status transition', () => {
            const invalidUpdate = {
                status: 'invalid' as TaskStatus
            };

            expect(() => validateUpdateTask(invalidUpdate)).toThrow();
        });

        it('should validate metadata updates', () => {
            const validUpdate = {
                metadata: {
                    context: 'New context',
                    tags: ['tag1', 'tag2']
                }
            };

            expect(() => validateUpdateTask(validUpdate)).not.toThrow();
        });

        it('should reject invalid metadata', () => {
            const invalidUpdate = {
                metadata: {
                    tags: 'not-an-array' as any
                }
            };

            expect(() => validateUpdateTask(invalidUpdate)).toThrow();
        });
    });
});
