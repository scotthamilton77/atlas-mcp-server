import { v4 as uuidv4 } from 'uuid';
import { Task, TaskStatus, TaskType, NoteType } from '../../src/shared/types/task.js';

// Helper to create consistent timestamps
const NOW = new Date().toISOString();
const SESSION_ID = uuidv4();

// Basic task fixture
export const createBasicTask = (overrides: Partial<Task> = {}): Task => ({
  id: uuidv4(),
  parentId: null,
  name: 'Test Task',
  description: 'A test task for unit testing',
  type: TaskType.TASK,
  status: TaskStatus.PENDING,
  metadata: {
    created: NOW,
    updated: NOW,
    sessionId: SESSION_ID
  },
  ...overrides
});

// Task with notes
export const createTaskWithNotes = (overrides: Partial<Task> = {}): Task => ({
  ...createBasicTask(),
  notes: [
    {
      type: NoteType.TEXT,
      content: 'Test note content'
    },
    {
      type: NoteType.CODE,
      content: 'console.log("test");',
      language: 'javascript'
    },
    {
      type: NoteType.MARKDOWN,
      content: '# Test Heading\nTest content'
    }
  ],
  ...overrides
});

// Task with reasoning
export const createTaskWithReasoning = (overrides: Partial<Task> = {}): Task => ({
  ...createBasicTask(),
  reasoning: {
    approach: 'Test approach',
    assumptions: ['Test assumption 1', 'Test assumption 2'],
    alternatives: ['Alternative 1', 'Alternative 2'],
    risks: ['Risk 1', 'Risk 2'],
    tradeoffs: ['Tradeoff 1', 'Tradeoff 2'],
    constraints: ['Constraint 1', 'Constraint 2'],
    dependencies_rationale: ['Dependency reason 1'],
    impact_analysis: ['Impact 1', 'Impact 2']
  },
  ...overrides
});

// Task with dependencies
export const createTaskWithDependencies = (dependencies: string[] = []): Task => ({
  ...createBasicTask(),
  dependencies
});

// Task hierarchy
export const createTaskHierarchy = (): Task => {
  const parentId = uuidv4();
  const childId1 = uuidv4();
  const childId2 = uuidv4();
  const grandchildId = uuidv4();

  return {
    ...createBasicTask({ id: parentId, type: TaskType.GROUP }),
    subtasks: [
      {
        ...createBasicTask({
          id: childId1,
          parentId,
          name: 'Child Task 1',
          dependencies: [childId2]
        })
      },
      {
        ...createBasicTask({
          id: childId2,
          parentId,
          name: 'Child Task 2',
          subtasks: [
            {
              ...createBasicTask({
                id: grandchildId,
                parentId: childId2,
                name: 'Grandchild Task'
              })
            }
          ]
        })
      }
    ]
  };
};

// Task with all features
export const createComplexTask = (): Task => ({
  ...createTaskWithNotes(),
  ...createTaskWithReasoning(),
  dependencies: [uuidv4(), uuidv4()],
  metadata: {
    created: NOW,
    updated: NOW,
    sessionId: SESSION_ID,
    context: 'Test context',
    tags: ['test', 'complex']
  }
});

// Collection of tasks in different states
export const createTaskCollection = (): Task[] => {
  const tasks: Task[] = [];
  const statuses = Object.values(TaskStatus);
  const types = Object.values(TaskType);

  for (let i = 0; i < 5; i++) {
    tasks.push(createBasicTask({
      status: statuses[i % statuses.length],
      type: types[i % types.length],
      name: `Task ${i + 1}`
    }));
  }

  return tasks;
};
