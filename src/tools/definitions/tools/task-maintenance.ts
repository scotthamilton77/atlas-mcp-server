import { ToolFactory, ToolImplementation } from './shared/types.js';
import { formatResponse } from './shared/response-formatter.js';

/**
 * Task maintenance tools implementation
 */

/**
 * Clear all tasks tool
 */
export const clearAllTasksTool: ToolFactory = (context): ToolImplementation => ({
  definition: {
    name: 'clear_all_tasks',
    description: `Remove all tasks from the database.

Impact:
- Deletes ALL tasks permanently
- Removes all relationships and dependencies
- Clears all metadata and notes
- Resets database to initial state
- Cannot be undone

When to Use:
- Starting fresh project phase
- Major project restructuring
- Development environment reset
- Test environment cleanup

Best Practices:
- Export tasks before clearing
- Verify confirmation flag
- Document clear reasoning
- Consider selective deletion
- Plan new task structure
- Archive important metadata

Safety Checks:
- Requires explicit confirmation
- Validates database state
- Ensures clean deletion
- Prevents partial clears

Example:
{
  "confirm": true,
  "reasoning": "Resetting task structure for Q2 planning. Previous tasks have been archived and new project structure will be implemented with updated requirements and dependencies."
}`,
    inputSchema: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description: `Explicit confirmation required to prevent accidental deletion.
Note: This operation:
- Removes ALL tasks from the database
- Cannot be undone
- Should be used with caution
- Requires explicit confirmation`,
        },
        reasoning: {
          type: 'string',
          description: `Explanation for clearing all tasks. Best practices:
- Document why a complete reset is needed
- Note where existing tasks are archived
- Outline plan for new structure
- Record migration/backup details`,
        },
      },
      required: ['confirm'],
    },
  },
  handler: async (args: Record<string, unknown>) => {
    await context.taskManager.clearAllTasks(args.confirm as boolean);
    return formatResponse({ success: true }, context.logger);
  },
});

/**
 * Vacuum database tool
 */
export const vacuumDatabaseTool: ToolFactory = (context): ToolImplementation => ({
  definition: {
    name: 'vacuum_database',
    description: `Optimize database storage and performance.

Performance Impact:
- Reclaims unused space
- Rebuilds indexes
- Updates statistics
- Optimizes query plans
- May take several minutes

When to Use:
- After bulk operations (creates/deletes)
- During maintenance windows
- When performance degrades
- After large deletions
- Before major operations

Best Practices:
- Run during low activity
- Monitor space usage
- Schedule regularly
- Backup before running
- Check performance impact
- Allow sufficient time
- Monitor system resources

Resource Usage:
- CPU: Moderate to high
- Memory: Temporary increase
- Disk I/O: Heavy
- Storage: Temporary spike

Example:
{
  "analyze": true,
  "reasoning": "Running optimization after bulk task deletion to reclaim space and update query statistics for better performance."
}`,
    inputSchema: {
      type: 'object',
      properties: {
        analyze: {
          type: 'boolean',
          description: `Whether to analyze after vacuum for query optimization.
Note: This operation:
- Reclaims unused space
- Updates statistics
- May take time for large datasets
- Improves query performance`,
          default: true,
        },
        reasoning: {
          type: 'string',
          description: `Explanation for vacuum operation. Best practices:
- Document performance issues
- Note recent bulk operations
- Record space reclamation goals
- Track optimization results`,
        },
      },
    },
  },
  handler: async (args: Record<string, unknown>) => {
    await context.taskManager.vacuumDatabase(args.analyze as boolean);
    return formatResponse({ success: true }, context.logger);
  },
});

/**
 * Repair relationships tool
 */
export const repairRelationshipsTool: ToolFactory = (context): ToolImplementation => ({
  definition: {
    name: 'repair_relationships',
    description: `Fix task hierarchy and dependency issues.

Repairs Performed:
- Resolves circular dependencies
- Fixes broken parent-child links
- Removes invalid dependencies
- Updates status inconsistencies
- Corrects metadata anomalies

When to Use:
- After failed operations
- Fixing circular dependencies
- Resolving orphaned tasks
- Maintaining task integrity
- Before major updates

Best Practices:
- Run dry-run first
- Fix critical paths
- Verify results
- Document changes
- Update affected tasks
- Monitor cascading effects

Validation Steps:
- Path integrity check
- Dependency cycle detection
- Parent-child validation
- Status consistency check
- Metadata validation

Example:
{
  "dryRun": true,
  "reasoning": "Checking for relationship issues after recent bulk operations. Using dry-run to assess the scope of necessary repairs before applying fixes."
}`,
    inputSchema: {
      type: 'object',
      properties: {
        dryRun: {
          type: 'boolean',
          description: `Preview changes without applying them.
Note: This operation:
- Identifies broken relationships
- Detects circular dependencies
- Finds orphaned tasks
- Reports potential fixes`,
          default: false,
        },
        reasoning: {
          type: 'string',
          description: `Explanation for repair operation. Best practices:
- Document known issues
- Note suspected causes
- Record repair strategy
- Track affected tasks`,
        },
      },
    },
  },
  handler: async (args: Record<string, unknown>) => {
    const result = await context.taskManager.repairRelationships(args.dryRun as boolean);
    return formatResponse(result, context.logger);
  },
});
