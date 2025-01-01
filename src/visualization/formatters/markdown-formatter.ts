import { Task } from '../../types/task.js';
import { BaseFormatter } from './base-formatter.js';

/**
 * Formats tasks as a markdown document with rich formatting
 */
export class MarkdownFormatter extends BaseFormatter {
  format(tasks: Task[]): string {
    const sortedTasks = this.sortTasks(tasks);
    const hierarchy = this.buildHierarchy(sortedTasks);

    let output = '# Task Overview\n\n';

    // Add summary section
    output += this.formatSummary(tasks);

    // Add task hierarchy
    output += '\n## Task Hierarchy\n\n';
    output += this.formatTaskHierarchy(hierarchy);

    // Add detailed task list
    output += '\n## Detailed Tasks\n\n';
    output += this.formatDetailedTasks(sortedTasks);

    return output;
  }

  private formatSummary(tasks: Task[]): string {
    const total = tasks.length;
    const byStatus = tasks.reduce(
      (acc, task) => {
        acc[task.status] = (acc[task.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    let summary = '## Summary\n\n';
    summary += `Total Tasks: ${total}\n\n`;
    summary += '### Status Breakdown\n\n';

    Object.entries(byStatus).forEach(([status, count]) => {
      const percentage = ((count / total) * 100).toFixed(1);
      summary += `- ${this.getStatusEmoji(status)} ${status}: ${count} (${percentage}%)\n`;
    });

    return summary;
  }

  private formatTaskHierarchy(
    hierarchy: Map<string, Task[]>,
    parentPath: string = '',
    level: number = 0
  ): string {
    let output = '';
    const indent = '  '.repeat(level);
    const tasks = hierarchy.get(parentPath) || [];

    tasks.forEach(task => {
      const progress = this.getTaskProgress(task);
      const progressBar = this.createProgressBar(progress);
      output += `${indent}- ${this.getStatusEmoji(task.status)} **${task.name}** ${progressBar}\n`;

      // Add child tasks recursively
      const childOutput = this.formatTaskHierarchy(hierarchy, task.path, level + 1);
      if (childOutput) {
        output += childOutput;
      }
    });

    return output;
  }

  private formatDetailedTasks(tasks: Task[]): string {
    let output = '';

    tasks.forEach(task => {
      output += `### ${this.getStatusEmoji(task.status)} ${task.path}\n\n`;
      output += `**Name:** ${task.name}\n\n`;
      output += `**Status:** ${task.status}\n\n`;

      if (task.description) {
        output += `**Description:** ${task.description}\n\n`;
      }

      if (task.dependencies?.length) {
        output += '**Dependencies:**\n';
        task.dependencies.forEach(dep => {
          output += `- ${dep}\n`;
        });
        output += '\n';
      }

      if (task.metadata) {
        output += '**Metadata:**\n';
        output += '```json\n';
        output += JSON.stringify(task.metadata, null, 2);
        output += '\n```\n\n';
      }

      // Add notes sections if they exist
      this.formatNotes('Planning Notes', task.planningNotes, output);
      this.formatNotes('Progress Notes', task.progressNotes, output);
      this.formatNotes('Completion Notes', task.completionNotes, output);
      this.formatNotes('Troubleshooting Notes', task.troubleshootingNotes, output);

      output += '---\n\n';
    });

    return output;
  }

  private formatNotes(title: string, notes: string[] | undefined, output: string): string {
    if (notes?.length) {
      output += `**${title}:**\n`;
      notes.forEach(note => {
        output += `- ${note}\n`;
      });
      output += '\n';
    }
    return output;
  }

  private createProgressBar(percentage: number): string {
    const width = 20;
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;

    const filledChar = '█';
    const emptyChar = '░';

    return `\`${filledChar.repeat(filled)}${emptyChar.repeat(empty)}\` ${percentage}%`;
  }
}
