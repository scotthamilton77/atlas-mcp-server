import { TaskIndexManager } from '../../../../../src/task/core/indexing/index-manager.js';
import { Task, TaskStatus, TaskType } from '../../../../../src/types/task.js';

describe('TaskIndexManager', () => {
    let indexManager: TaskIndexManager;
    const mockTask: Task = {
        id: '123',
        parentId: null,
        name: 'Test Task',
        type: TaskType.TASK,
        status: TaskStatus.PENDING,
        dependencies: [],
        subtasks: [],
        metadata: {
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            sessionId: 'test-session'
        }
    };

    beforeEach(() => {
        indexManager = new TaskIndexManager();
    });

    describe('indexTask', () => {
        it('should index a task successfully', () => {
            indexManager.indexTask(mockTask);
            const retrievedTask = indexManager.getTaskById(mockTask.id);
            expect(retrievedTask).toEqual(mockTask);
        });

        it('should index task by status', () => {
            indexManager.indexTask(mockTask);
            const tasksByStatus = indexManager.getTasksByStatus(TaskStatus.PENDING);
            expect(tasksByStatus).toHaveLength(1);
            expect(tasksByStatus[0]).toEqual(mockTask);
        });

        it('should index task by parent', () => {
            indexManager.indexTask(mockTask);
            const tasksByParent = indexManager.getTasksByParent(null);
            expect(tasksByParent).toHaveLength(1);
            expect(tasksByParent[0]).toEqual(mockTask);
        });
    });

    describe('unindexTask', () => {
        it('should remove task from all indexes', () => {
            indexManager.indexTask(mockTask);
            indexManager.unindexTask(mockTask);
            
            expect(indexManager.getTaskById(mockTask.id)).toBeNull();
            expect(indexManager.getTasksByStatus(TaskStatus.PENDING)).toHaveLength(0);
            expect(indexManager.getTasksByParent(null)).toHaveLength(0);
        });
    });

    describe('indexDependencies', () => {
        it('should index task dependencies', async () => {
            const dependentTask: Task = {
                ...mockTask,
                id: '456',
                dependencies: [mockTask.id]
            };

            indexManager.indexTask(mockTask);
            indexManager.indexTask(dependentTask);
            await indexManager.indexDependencies(dependentTask);

            const dependentTasks = indexManager.getDependentTasks(mockTask.id);
            expect(dependentTasks).toHaveLength(1);
            expect(dependentTasks[0].id).toBe(dependentTask.id);
        });
    });

    describe('getRootTasks', () => {
        it('should return tasks with ROOT- prefix in parentId', () => {
            const rootTask: Task = {
                ...mockTask,
                parentId: 'ROOT-test-session'
            };
            
            indexManager.indexTask(rootTask);
            const rootTasks = indexManager.getRootTasks();
            
            expect(rootTasks).toHaveLength(1);
            expect(rootTasks[0]).toEqual(rootTask);
        });
    });
});
