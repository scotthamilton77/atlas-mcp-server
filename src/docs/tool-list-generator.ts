/**
 * Generates formatted tool descriptions for client LLMs
 */

interface ToolParameter {
    description: string;
    required?: boolean;
}

interface ToolDescription {
    name: string;
    description: string;
    parameters?: Record<string, ToolParameter>;
}

interface ToolDescriptions {
    [key: string]: ToolDescription;
}

import { toolDescriptions } from './tool-descriptions.js';

export function generateToolList() {
    const header = `atlas-mcp-server
Tools (${Object.keys(toolDescriptions).length})
Resources (0)

IMPORTANT: Session Initialization Required
Before using any task operations, you must:
1. Create a session using create_session
2. Create a task list using create_task_list
3. Then proceed with task operations

Tasks cannot be created or managed without an active session and task list.

`;

    const tools = Object.entries(toolDescriptions as ToolDescriptions).map(([name, tool]) => {
        // Start with the tool name
        let output = name + '\n';
        
        // Add description and parameters in dash format
        output += tool.description;
        
        // Add parameters section if tool has parameters
        if (tool.parameters && Object.keys(tool.parameters).length > 0) {
            // Add parameters list with dashes
            output += " Parameters:";
            Object.entries(tool.parameters).forEach(([paramName, param]) => {
                const required = param.required ? '*' : '';
                output += ` - ${paramName}${required}: ${param.description}`;
            });

            // Add the separate Parameters section with proper spacing
            output += "\n\nParameters";
            Object.entries(tool.parameters).forEach(([paramName, param]) => {
                const required = param.required ? '*' : '';
                output += `\n${paramName}${required}\n${param.description}`;
            });
        }

        return output;
    }).join('\n\n');

    return header + tools;
}
