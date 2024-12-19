import { describe, it, expect } from '@jest/globals';
import { TaskSchemaValidator, taskValidation } from '../../../../src/core/validation/schemas/task-validator.js';
import { TaskType, TaskStatus, NoteType } from '../../../../src/shared/types/task.js';
import { CreateTask, UpdateTask } from '../../../../src/core/validation/schemas/task-types.js';
import { ValidationOperation } from '../../../../src/core/validation/types.js';
import { createMockTask } from '../../../helpers/validation.js';

// Helper to create a UUID v4
const uuidv4 = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

describe('Task Validation', () => {
  describe('TaskSchemaValidator', () => {
    const validator = new TaskSchemaValidator();
    const baseContext = {
      operation: ValidationOperation.CREATE,
      timestamp: Date.now(),
      sessionId: 'test-session'
    };

    describe('base task validation', () => {
      it('should validate a valid task', async () => {
        const task = createMockTask({
          id: uuidv4(),
          parentId: null
        });
        const result = await validator.validate(baseContext, task);
        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();
      });

      describe('id validation', () => {
        it('should reject task without id', async () => {
          const task = createMockTask();
          delete (task as any).id;
          const result = await validator.validate(baseContext, task);
          expect(result.success).toBe(false);
          expect(result.error?.path).toContain('id');
        });

        it('should reject task with invalid id type', async () => {
          const task = createMockTask();
          (task as any).id = 123;
          const result = await validator.validate(baseContext, task);
          expect(result.success).toBe(false);
          expect(result.error?.path).toContain('id');
        });
      });

      describe('name validation', () => {
        it('should reject task without name', async () => {
          const task = createMockTask({ id: uuidv4() });
          delete (task as any).name;
          const result = await validator.validate(baseContext, task);
          expect(result.success).toBe(false);
          expect(result.error?.path).toContain('name');
        });

        it('should reject task with empty name', async () => {
          const task = createMockTask({ id: uuidv4(), name: '' });
          const result = await validator.validate(baseContext, task);
          expect(result.success).toBe(false);
          expect(result.error?.path).toContain('name');
        });

        it('should reject task with name exceeding max length', async () => {
          const task = createMockTask({
            id: uuidv4(),
            name: 'a'.repeat(201) // MAX_NAME_LENGTH + 1
          });
          const result = await validator.validate(baseContext, task);
          expect(result.success).toBe(false);
          expect(result.error?.path).toContain('name');
        });
      });

      describe('type validation', () => {
        it('should reject task without type', async () => {
          const task = createMockTask({ id: uuidv4() });
          delete (task as any).type;
          const result = await validator.validate(baseContext, task);
          expect(result.success).toBe(false);
          expect(result.error?.path).toContain('type');
        });

        it('should reject task with invalid type', async () => {
          const task = createMockTask({ id: uuidv4() });
          (task as any).type = 'invalid';
          const result = await validator.validate(baseContext, task);
          expect(result.success).toBe(false);
          expect(result.error?.path).toContain('type');
        });

        it('should validate all valid task types', async () => {
          const types = [TaskType.TASK, TaskType.GROUP, TaskType.MILESTONE];
          for (const type of types) {
            const task = createMockTask({ id: uuidv4(), type });
            const result = await validator.validate(baseContext, task);
            expect(result.success).toBe(true);
          }
        });
      });

      describe('notes validation', () => {
        it('should validate task with valid notes', async () => {
          const task = createMockTask({
            id: uuidv4(),
            notes: [
              {
                type: NoteType.TEXT,
                content: 'Test note'
              },
              {
                type: NoteType.CODE,
                content: 'console.log("test")',
                language: 'javascript'
              }
            ]
          });
          const result = await validator.validate(baseContext, task);
          expect(result.success).toBe(true);
        });

        it('should reject task with invalid note type', async () => {
          const task = createMockTask({
            id: uuidv4(),
            notes: [
              {
                type: 'invalid' as NoteType,
                content: 'Test note'
              }
            ]
          });
          const result = await validator.validate(baseContext, task);
          expect(result.success).toBe(false);
          expect(result.error?.path).toContain('notes');
        });

        it('should reject task with empty note content', async () => {
          const task = createMockTask({
            id: uuidv4(),
            notes: [
              {
                type: NoteType.TEXT,
                content: ''
              }
            ]
          });
          const result = await validator.validate(baseContext, task);
          expect(result.success).toBe(false);
          expect(result.error?.path).toContain('notes');
        });
      });

      describe('reasoning validation', () => {
        it('should validate task with valid reasoning', async () => {
          const task = createMockTask({
            id: uuidv4(),
            reasoning: {
              approach: 'Test approach',
              assumptions: ['Test assumption'],
              alternatives: ['Test alternative'],
              risks: ['Test risk'],
              tradeoffs: ['Test tradeoff'],
              constraints: ['Test constraint'],
              dependencies_rationale: ['Test rationale'],
              impact_analysis: ['Test impact']
            }
          });
          const result = await validator.validate(baseContext, task);
          expect(result.success).toBe(true);
        });

        it('should validate task with partial reasoning', async () => {
          const task = createMockTask({
            id: uuidv4(),
            reasoning: {
              approach: 'Test approach',
              assumptions: ['Test assumption']
            }
          });
          const result = await validator.validate(baseContext, task);
          expect(result.success).toBe(true);
        });
      });

      describe('description validation', () => {
        it('should validate task with description', async () => {
          const task = createMockTask({
            id: uuidv4(),
            description: 'Test description'
          });
          const result = await validator.validate(baseContext, task);
          expect(result.success).toBe(true);
        });

        it('should validate task without description', async () => {
          const task = createMockTask({
            id: uuidv4(),
            description: undefined
          });
          const result = await validator.validate(baseContext, task);
          expect(result.success).toBe(true);
        });
      });

      describe('subtasks validation', () => {
        it('should validate group task with valid subtasks', async () => {
          const subtask = createMockTask({ id: uuidv4() });
          const task = createMockTask({
            id: uuidv4(),
            type: TaskType.GROUP,
            subtasks: [subtask]
          });
          const result = await validator.validate(baseContext, task);
          expect(result.success).toBe(true);
        });

        it('should validate deeply nested subtasks', async () => {
          const leaf = createMockTask({ id: uuidv4() });
          const middle = createMockTask({
            id: uuidv4(),
            type: TaskType.GROUP,
            subtasks: [leaf]
          });
          const root = createMockTask({
            id: uuidv4(),
            type: TaskType.GROUP,
            subtasks: [middle]
          });
          const result = await validator.validate(baseContext, root);
          expect(result.success).toBe(true);
        });
      });

      describe('dependencies validation', () => {
        it('should validate task with valid dependencies', async () => {
          const task = createMockTask({
            id: uuidv4(),
            dependencies: [uuidv4(), uuidv4()]
          });
          const result = await validator.validate(baseContext, task);
          expect(result.success).toBe(true);
        });

        it('should reject task with invalid dependency format', async () => {
          const task = createMockTask({
            id: uuidv4(),
            dependencies: ['invalid-id']
          });
          const result = await validator.validate(baseContext, task);
          expect(result.success).toBe(false);
          expect(result.error?.path).toContain('dependencies');
        });
      });

      describe('metadata validation', () => {
        it('should reject task with invalid timestamp format', async () => {
          const task = createMockTask({
            id: uuidv4(),
            metadata: {
              ...createMockTask().metadata,
              created: 'invalid-date',
              updated: 'invalid-date'
            }
          });
          const result = await validator.validate(baseContext, task);
          expect(result.success).toBe(false);
          expect(result.error?.path).toContain('metadata');
        });

        it('should reject task with invalid tags format', async () => {
          const task = createMockTask({
            id: uuidv4(),
            metadata: {
              ...createMockTask().metadata,
              tags: [123] as any
            }
          });
          const result = await validator.validate(baseContext, task);
          expect(result.success).toBe(false);
          expect(result.error?.path).toContain('metadata.tags');
        });
      });

      describe('array validations', () => {
        it('should reject task with too many dependencies', async () => {
          const task = createMockTask({
            id: uuidv4(),
            dependencies: Array(51).fill(null).map(() => uuidv4()) // Exceeds MAX_DEPENDENCIES
          });
          const result = await validator.validate(baseContext, task);
          expect(result.success).toBe(false);
          expect(result.error?.path).toContain('dependencies');
        });

        it('should reject task with too many subtasks', async () => {
          const task = createMockTask({
            id: uuidv4(),
            type: TaskType.GROUP,
            subtasks: Array(101).fill(null).map(() => createMockTask({ id: uuidv4() })) // Exceeds MAX_SUBTASKS
          });
          const result = await validator.validate(baseContext, task);
          expect(result.success).toBe(false);
          expect(result.error?.path).toContain('subtasks');
        });

        it('should reject task with invalid notes array', async () => {
          const task = createMockTask({
            id: uuidv4(),
            notes: [{}] as any // Invalid note structure
          });
          const result = await validator.validate(baseContext, task);
          expect(result.success).toBe(false);
          expect(result.error?.path).toContain('notes');
        });

        it('should reject task with invalid reasoning arrays', async () => {
          const task = createMockTask({
            id: uuidv4(),
            reasoning: {
              assumptions: [123] as any, // Invalid array item type
              risks: {} as any // Invalid array
            }
          });
          const result = await validator.validate(baseContext, task);
          expect(result.success).toBe(false);
          expect(result.error?.path).toContain('reasoning');
        });
      });
    });

    describe('operation-specific validation', () => {
      describe('create validation', () => {
        const createContext = { ...baseContext, operation: ValidationOperation.CREATE };

        it('should validate valid create task data', async () => {
          const task = createMockTask();
          const taskData = {
            name: task.name,
            type: task.type,
            status: task.status,
            parentId: task.parentId,
            metadata: {
              context: task.metadata.context,
              tags: task.metadata.tags
            }
          };
          const result = await validator.validate(createContext, taskData);
          expect(result.success).toBe(true);
        });

        it('should validate bulk create tasks', async () => {
          const tasks = [
            createMockTask({ name: 'Task 1' }),
            createMockTask({ name: 'Task 2' })
          ].map(task => ({
            name: task.name,
            type: task.type,
            status: task.status,
            parentId: task.parentId,
            metadata: {
              context: task.metadata.context,
              tags: task.metadata.tags
            }
          }));
          const result = await validator.validate(createContext, tasks);
          expect(result.success).toBe(true);
        });
      });

      describe('update validation', () => {
        const updateContext = { ...baseContext, operation: ValidationOperation.UPDATE };

        it('should validate partial updates', async () => {
          const update = {
            name: 'Updated Name',
            status: TaskStatus.IN_PROGRESS,
            metadata: {
              context: 'updated context',
              tags: ['updated']
            }
          } as UpdateTask;
          const result = await validator.validate(updateContext, update, { partial: true });
          expect(result.success).toBe(true);
        });

        it('should validate bulk updates', async () => {
          const updates = [
            {
              id: uuidv4(),
              updates: {
                name: 'Updated 1',
                metadata: {
                  context: 'updated context',
                  tags: ['updated']
                }
              } as UpdateTask
            },
            {
              id: uuidv4(),
              updates: {
                status: TaskStatus.COMPLETED,
                metadata: {
                  context: 'completed context',
                  tags: ['completed']
                }
              } as UpdateTask
            }
          ];
          const result = await validator.validate(updateContext, updates);
          expect(result.success).toBe(true);
        });
      });

      describe('status change validation', () => {
        const statusContext = { ...baseContext, operation: ValidationOperation.STATUS_CHANGE };

        it('should validate valid status change', async () => {
          const change = {
            id: uuidv4(),
            status: TaskStatus.IN_PROGRESS,
            metadata: {
              changedBy: 'user-1',
              timestamp: new Date().toISOString()
            }
          };
          const result = await validator.validate(statusContext, change);
          expect(result.success).toBe(true);
        });
      });
    });
  });

  describe('taskValidation utilities', () => {
    describe('isValidStatusTransition', () => {
      const validTransitions = [
        { from: TaskStatus.PENDING, to: TaskStatus.IN_PROGRESS },
        { from: TaskStatus.IN_PROGRESS, to: TaskStatus.COMPLETED },
        { from: TaskStatus.IN_PROGRESS, to: TaskStatus.FAILED },
        { from: TaskStatus.IN_PROGRESS, to: TaskStatus.BLOCKED },
        { from: TaskStatus.COMPLETED, to: TaskStatus.IN_PROGRESS },
        { from: TaskStatus.FAILED, to: TaskStatus.IN_PROGRESS },
        { from: TaskStatus.BLOCKED, to: TaskStatus.IN_PROGRESS }
      ];

      validTransitions.forEach(({ from, to }) => {
        it(`should allow transition from ${from} to ${to}`, () => {
          expect(taskValidation.isValidStatusTransition(from, to)).toBe(true);
        });
      });

      const invalidTransitions = [
        { from: TaskStatus.PENDING, to: TaskStatus.COMPLETED },
        { from: TaskStatus.COMPLETED, to: TaskStatus.FAILED },
        { from: TaskStatus.FAILED, to: TaskStatus.COMPLETED },
        { from: TaskStatus.BLOCKED, to: TaskStatus.COMPLETED }
      ];

      invalidTransitions.forEach(({ from, to }) => {
        it(`should not allow transition from ${from} to ${to}`, () => {
          expect(taskValidation.isValidStatusTransition(from, to)).toBe(false);
        });
      });
    });

    describe('canHaveSubtasks', () => {
      it('should allow subtasks for group tasks', () => {
        expect(taskValidation.canHaveSubtasks(TaskType.GROUP)).toBe(true);
      });

      it('should not allow subtasks for non-group tasks', () => {
        expect(taskValidation.canHaveSubtasks(TaskType.TASK)).toBe(false);
        expect(taskValidation.canHaveSubtasks(TaskType.MILESTONE)).toBe(false);
      });
    });

    describe('canHaveDependencies', () => {
      it('should allow dependencies for non-group tasks', () => {
        expect(taskValidation.canHaveDependencies(TaskType.TASK)).toBe(true);
        expect(taskValidation.canHaveDependencies(TaskType.MILESTONE)).toBe(true);
      });

      it('should not allow dependencies for group tasks', () => {
        expect(taskValidation.canHaveDependencies(TaskType.GROUP)).toBe(false);
      });
    });

    describe('getValidChildTypes', () => {
      it('should return all types for group tasks', () => {
        const validTypes = taskValidation.getValidChildTypes(TaskType.GROUP);
        expect(validTypes).toContain(TaskType.TASK);
        expect(validTypes).toContain(TaskType.GROUP);
        expect(validTypes).toContain(TaskType.MILESTONE);
      });

      it('should return empty array for non-group tasks', () => {
        expect(taskValidation.getValidChildTypes(TaskType.TASK)).toHaveLength(0);
        expect(taskValidation.getValidChildTypes(TaskType.MILESTONE)).toHaveLength(0);
      });
    });
  });
});
