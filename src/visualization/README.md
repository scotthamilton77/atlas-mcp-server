# Task Visualization System

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Status](https://img.shields.io/badge/Status-Stable-blue.svg)]()

The visualization system provides real-time, hierarchical views of tasks with progress tracking and
detailed metadata display. It maintains session-based files that update automatically as tasks
change.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Components](#components)
- [File Format](#file-format)
- [Features](#features)
- [Best Practices](#best-practices)

## Overview

The visualization system converts task data into human and machine-readable formats, providing:

- Real-time task hierarchy visualization
- Progress tracking with visual indicators
- Status summaries and statistics
- Detailed task metadata display
- Session-based file management

## Architecture

### Core Components

- **VisualizationManager**: Singleton manager handling visualization lifecycle
- **TaskVisualizer**: Handles file creation and updates
- **Formatters**: Convert task data into specific formats
  - MarkdownFormatter: Human-readable format
  - JsonFormatter: Machine-readable format

### Event Integration

- Subscribes to TaskManager events:
  - TASK_CREATED
  - TASK_UPDATED
  - TASK_DELETED
  - CACHE_CLEARED

### File Management

- Session-based files (tasks-YYYY-MM-DD.{md,json})
- Automatic cleanup of old files
- Real-time updates to existing files

## Components

### VisualizationManager

```typescript
class VisualizationManager {
  // Singleton instance management
  static async initialize(taskManager: TaskManager, config: Config);
  static getInstance(): VisualizationManager;

  // Event handling
  private handleTaskEvent(event: TaskEvent): Promise<void>;
  private handleTasksClear(): Promise<void>;

  // Resource management
  async cleanup(): Promise<void>;
}
```

### TaskVisualizer

```typescript
class TaskVisualizer {
  // Core functionality
  async updateVisualizations(tasks: Task[]): Promise<void>;
  async cleanupOldFiles(): Promise<void>;

  // File management
  private async getSessionFile(format: string): Promise<string>;
  private async initializeOutputDir(): Promise<void>;
}
```

### Formatters

```typescript
interface TaskFormatter {
  format(tasks: Task[]): string;
}

class MarkdownFormatter implements TaskFormatter {
  // Markdown-specific formatting
  private formatTaskHierarchy(tasks: Task[]): string;
  private formatTaskDetails(task: Task): string;
  private generateProgressBar(percentage: number): string;
}

class JsonFormatter implements TaskFormatter {
  // JSON-specific formatting
  private generateSummary(tasks: Task[]): object;
  private buildTaskTree(tasks: Task[]): object;
}
```

## File Format

### Markdown Format (tasks-YYYY-MM-DD.md)

```markdown
# Task Overview

## Summary

Total Tasks: 10 Status Breakdown:

- 🔄 IN_PROGRESS: 4 (40%)
- ⏳ PENDING: 3 (30%)
- ✅ COMPLETED: 3 (30%)

## Task Hierarchy

- 🔄 **Project Setup** `██████████░░░░░░░░░░` 50%
  - ✅ **Environment Setup** `████████████████████` 100%
  - 🔄 **Configuration** `██████░░░░░░░░░░░░░░` 30%

## Detailed Tasks

[Task details with metadata...]
```

### JSON Format (tasks-YYYY-MM-DD.json)

```json
{
  "summary": {
    "totalTasks": 10,
    "statusCounts": {
      "IN_PROGRESS": 4,
      "PENDING": 3,
      "COMPLETED": 3
    }
  },
  "hierarchy": {
    "nodes": [...],
    "edges": [...]
  },
  "tasks": [...]
}
```

## Features

### Status Indicators

- ⏳ PENDING: Task not started
- 🔄 IN_PROGRESS: Active work
- ✅ COMPLETED: Task finished
- ❌ CANCELLED: Task discontinued
- 🚫 BLOCKED: Waiting on dependencies

### Progress Tracking

- Visual progress bars: `████░░░░░░░░░░░░░░` (30%)
- Percentage-based completion
- Status summaries and statistics

### Hierarchy Display

- Indented task structure
- Parent-child relationships
- Dependency tracking
- Clear status propagation

### Metadata Formatting

- Priority levels
- Technical requirements
- Planning and progress notes
- Custom fields and tags

## Best Practices

### File Management

- Use session-based files for temporal organization
- Clean up old files automatically
- Maintain both MD and JSON formats

### Visualization

- Keep hierarchy depth manageable
- Use clear status indicators
- Include relevant metadata
- Format progress visually

### Performance

- Update files efficiently
- Handle large task sets
- Manage file cleanup
- Monitor file size

### Error Handling

- Validate file paths
- Handle write errors
- Manage concurrent updates
- Log visualization issues
