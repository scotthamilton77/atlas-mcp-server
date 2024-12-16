import { Task, TaskStatuses, TaskTypes } from '../types/task.js';

// ASCII/Unicode symbols for terminal visualization
const SYMBOLS = {
    VERTICAL: '│',
    HORIZONTAL: '─',
    CORNER: '└',
    TEE: '├',
    PENDING: '○',
    IN_PROGRESS: '◔',
    COMPLETED: '●',
    FAILED: '✕',
    BLOCKED: '⊘',
    TASK: '📋',
    MILESTONE: '🏁',
    GROUP: '📁'
};

/**
 * Generates an ASCII/Unicode tree visualization of tasks
 */
export function generateTerminalTree(tasks: Task[], level = 0, isLast = true, prefix = ''): string {
    if (tasks.length === 0) return '';

    let output = '';
    tasks.forEach((task, index) => {
        const isLastItem = index === tasks.length - 1;
        const connector = isLastItem ? SYMBOLS.CORNER : SYMBOLS.TEE;
        const statusSymbol = SYMBOLS[task.status as keyof typeof SYMBOLS];
        const typeSymbol = SYMBOLS[task.type as keyof typeof SYMBOLS];
        
        // Build the line prefix for proper indentation
        const linePrefix = prefix + (isLast ? '    ' : SYMBOLS.VERTICAL + '   ');
        
        // Create the task line with status and type indicators
        output += `${prefix}${connector}${SYMBOLS.HORIZONTAL} ${statusSymbol} ${typeSymbol} ${task.name}\n`;
        
        // Add task details if they exist
        if (task.description) {
            output += `${linePrefix}  Description: ${task.description}\n`;
        }
        if (task.dependencies.length > 0) {
            output += `${linePrefix}  Dependencies: ${task.dependencies.join(', ')}\n`;
        }
        
        // Recursively add subtasks
        if (task.subtasks.length > 0) {
            output += generateTerminalTree(
                task.subtasks.map(id => ({ id } as Task)), 
                level + 1, 
                isLastItem,
                linePrefix
            );
        }
    });

    return output;
}

/**
 * Generates a Mermaid.js diagram definition for tasks
 */
export function generateMermaidDiagram(tasks: Task[]): string {
    let diagram = 'graph TD;\n';
    
    function processTask(task: Task) {
        // Node style based on status
        const style = getNodeStyle(task.status);
        diagram += `    ${task.id}["${task.type}: ${task.name}"]${style}\n`;
        
        // Add dependencies
        task.dependencies.forEach(depId => {
            diagram += `    ${depId} --> ${task.id}\n`;
        });
        
        // Add subtasks
        task.subtasks.forEach(subtaskId => {
            diagram += `    ${task.id} --> ${subtaskId}\n`;
        });
    }
    
    // Process all tasks
    tasks.forEach(processTask);
    
    return diagram;
}

/**
 * Generates an HTML visualization of the task tree
 */
export function generateHtmlVisualization(tasks: Task[]): string {
    const mermaidDiagram = generateMermaidDiagram(tasks);
    
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Task Visualization</title>
    <meta charset="UTF-8">
    <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
    <style>
        body {
            font-family: system-ui, -apple-system, sans-serif;
            margin: 2rem;
            background: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            padding: 2rem;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .task-tree {
            margin-top: 2rem;
        }
        .task-details {
            margin-top: 2rem;
        }
        .status-legend {
            display: flex;
            gap: 1rem;
            margin: 1rem 0;
            padding: 1rem;
            background: #f8f9fa;
            border-radius: 4px;
        }
        .status-item {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .status-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
        }
        .pending { background: #6c757d; }
        .in-progress { background: #007bff; }
        .completed { background: #28a745; }
        .failed { background: #dc3545; }
        .blocked { background: #ffc107; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Task Visualization</h1>
        
        <div class="status-legend">
            <div class="status-item">
                <div class="status-dot pending"></div>
                Pending
            </div>
            <div class="status-item">
                <div class="status-dot in-progress"></div>
                In Progress
            </div>
            <div class="status-item">
                <div class="status-dot completed"></div>
                Completed
            </div>
            <div class="status-item">
                <div class="status-dot failed"></div>
                Failed
            </div>
            <div class="status-item">
                <div class="status-dot blocked"></div>
                Blocked
            </div>
        </div>

        <div class="task-tree">
            <div class="mermaid">
${mermaidDiagram}
            </div>
        </div>

        <div class="task-details">
            <h2>Task Details</h2>
            <pre>${JSON.stringify(tasks, null, 2)}</pre>
        </div>
    </div>

    <script>
        mermaid.initialize({
            startOnLoad: true,
            theme: 'default',
            flowchart: {
                curve: 'basis'
            }
        });
    </script>
</body>
</html>`;
}

/**
 * Helper function to get Mermaid node style based on task status
 */
function getNodeStyle(status: string): string {
    switch (status) {
        case TaskStatuses.PENDING:
            return ':::pending';
        case TaskStatuses.IN_PROGRESS:
            return ':::inProgress';
        case TaskStatuses.COMPLETED:
            return ':::completed';
        case TaskStatuses.FAILED:
            return ':::failed';
        case TaskStatuses.BLOCKED:
            return ':::blocked';
        default:
            return '';
    }
}
