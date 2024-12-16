import { Task } from '../types/task.js';
import { generateTerminalTree, generateHtmlVisualization } from '../visualization/index.js';
import fs from 'fs/promises';
import path from 'path';

export class VisualizationHandler {
    /**
     * Generates and saves visualizations for tasks
     */
    static async visualizeTasks(tasks: Task[], outputDir: string): Promise<{
        terminalOutput: string;
        htmlPath: string;
    }> {
        // Create output directory if it doesn't exist
        await fs.mkdir(outputDir, { recursive: true });

        // Generate terminal tree visualization
        const terminalOutput = generateTerminalTree(tasks);

        // Generate and save HTML visualization
        const htmlOutput = generateHtmlVisualization(tasks);
        const htmlPath = path.join(outputDir, 'task-visualization.html');
        await fs.writeFile(htmlPath, htmlOutput, 'utf-8');

        return {
            terminalOutput,
            htmlPath
        };
    }

    /**
     * Generates terminal visualization only
     */
    static getTerminalVisualization(tasks: Task[]): string {
        return generateTerminalTree(tasks);
    }

    /**
     * Generates and saves HTML visualization only
     */
    static async saveHtmlVisualization(tasks: Task[], outputPath: string): Promise<string> {
        const htmlOutput = generateHtmlVisualization(tasks);
        await fs.writeFile(outputPath, htmlOutput, 'utf-8');
        return outputPath;
    }
}
