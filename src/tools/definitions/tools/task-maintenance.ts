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
    description: `Reset the task system to an empty state. This tool enables LLM agents to:

CORE CAPABILITIES:
1. System Reset
   - Remove all tasks
   - Clear relationships
   - Reset metadata
   - Clean database

VALIDATION RULES:
1. Safety Requirements
   - Explicit confirmation
   - Valid reasoning
   - No active operations
   - Clean system state

EXAMPLE:

We need to reset the system for a new project:
{
  "confirm": true,
  "reasoning": "Initiating Q2 planning phase. Current tasks previously archived to project/archive/q1-2024.json. New structure will focus on platform scalability initiatives."
}`,
    inputSchema: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description: `Safety confirmation flag. VALIDATION:
- Must be explicitly true
- Cannot be omitted
- Prevents accidents
- Final check`,
        },
        reasoning: {
          type: 'string',
          description: `Reset justification. REQUIRED INFORMATION:
- Purpose of reset
- Archive location
- New structure plan
- Migration details`,
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
    description: `Optimize the task database for performance. This tool enables LLM agents to:

CORE CAPABILITIES:
1. Storage Optimization
   - Reclaim space
   - Rebuild indexes
   - Update statistics
   - Improve queries

VALIDATION RULES:
1. Timing Requirements
   - No active operations
   - Low system load
   - Sufficient space
   - Adequate time

EXAMPLE:

We need to optimize after bulk task deletions:
{
  "analyze": true,
  "reasoning": "Optimizing storage after removing completed Q1 tasks. Current fragmentation affecting query performance."
}`,
    inputSchema: {
      type: 'object',
      properties: {
        analyze: {
          type: 'boolean',
          description: `Run analysis phase. VALIDATION:
- Optional boolean
- Defaults to true
- Improves planning
- Updates stats`,
          default: true,
        },
        reasoning: {
          type: 'string',
          description: `Optimization reason. REQUIRED INFORMATION:
- Current issues
- Expected benefits
- System impact
- Timing choice`,
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
    description: `Fix task relationship issues. This tool enables LLM agents to:

CORE CAPABILITIES:
1. Relationship Repair
   - Fix dependencies
   - Correct hierarchies
   - Update statuses
   - Resolve conflicts

VALIDATION RULES:
1. Safety Requirements
   - Valid system state
   - No active changes
   - Clean hierarchies
   - Valid paths

EXAMPLE:

We need to check and fix task relationships:
{
  "dryRun": true,
  "reasoning": "Validating task relationships after system migration. Using dry-run to assess required fixes."
}`,
    inputSchema: {
      type: 'object',
      properties: {
        dryRun: {
          type: 'boolean',
          description: `Safety check mode. VALIDATION:
- Optional boolean
- Defaults to false
- No changes made
- Shows fixes`,
          default: false,
        },
        reasoning: {
          type: 'string',
          description: `Repair justification. REQUIRED INFORMATION:
- Current issues
- Expected fixes
- System impact
- Verification plan`,
        },
      },
    },
  },
  handler: async (args: Record<string, unknown>) => {
    const result = await context.taskManager.repairRelationships(args.dryRun as boolean);
    return formatResponse(result, context.logger);
  },
});
