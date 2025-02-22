import { z } from "zod";
import { McpToolResponse } from '../../../types/mcp.js';
import { ProjectDependency } from '../../../neo4j/projectService.js';

// Valid dependency types
const VALID_DEPENDENCY_TYPES = ['requires', 'extends', 'implements', 'references'] as const;

// Base dependency schema shape for reuse
const DependencySchemaShape = {
  sourceProjectId: z.string().describe(
    "Source project ID (dependent, must start with 'proj_')."
  ),
  targetProjectId: z.string().describe(
    "Target project ID (dependency, must start with 'proj_')."
  ),
  type: z.enum(VALID_DEPENDENCY_TYPES).describe(
    "Dependency type:\n" +
    "- requires: Source needs target to function\n" +
    "- extends: Source builds on target\n" +
    "- implements: Source implements target's interface\n" +
    "- references: Source uses target"
  ),
  description: z.string().min(1).describe(
    "Explanation of the dependency relationship."
  )
} as const;

// Single dependency schema
const SingleDependencySchema = z.object({
  mode: z.literal("single"),
  ...DependencySchemaShape
}).describe(
  "Create a single project dependency."
);

// Bulk dependency schema
const BulkDependencySchema = z.object({
  mode: z.literal("bulk"),
  dependencies: z.array(z.object(DependencySchemaShape)).min(1).max(100)
}).describe(
  "Create multiple project dependencies in a single operation."
);

// Raw schema shape for tool registration
export const AddDependencySchemaShape = z.object({
  mode: z.enum(["single", "bulk"]).describe(
    "'single' for one dependency, 'bulk' for multiple."
  ),
  sourceProjectId: z.string().optional().describe(
    "Required for single mode: Source project ID (dependent, must start with 'proj_')."
  ),
  targetProjectId: z.string().optional().describe(
    "Required for single mode: Target project ID (dependency, must start with 'proj_')."
  ),
  type: z.enum(VALID_DEPENDENCY_TYPES).optional().describe("Required for single mode: Dependency type"),
  dependencies: z.array(z.object(DependencySchemaShape)).min(1).max(100).optional().describe(
    "Required for bulk mode: Array of 1-100 dependencies."
  )
}).shape;

export const RemoveDependencySchemaShape = {
  mode: z.enum(["single", "bulk"]).describe(
    "'single' for one dependency, 'bulk' for multiple."
  ),
  dependencyId: z.string().optional().describe(
    "Required for single mode: Dependency ID to remove."
  ),
  dependencyIds: z.array(z.string()).min(1).max(100).optional().describe(
    "Required for bulk mode: Array of 1-100 dependency IDs."
  )
} as const;

export const ListDependenciesSchemaShape = {
  projectId: z.string().describe(
    "Project ID to list dependencies for (returns both dependencies and dependents)."
  )
} as const;

// Schemas for validation
export const AddDependencySchema = z.discriminatedUnion("mode", [
  SingleDependencySchema,
  BulkDependencySchema
]);

// Single removal schema
const SingleRemovalSchema = z.object({
  mode: z.literal("single"),
  dependencyId: z.string()
}).describe(
  "Remove a single dependency by ID."
);

// Bulk removal schema
const BulkRemovalSchema = z.object({
  mode: z.literal("bulk"),
  dependencyIds: z.array(z.string()).min(1).max(100)
}).describe(
  "Remove multiple dependencies in a single operation."
);

export const RemoveDependencySchema = z.discriminatedUnion("mode", [
  SingleRemovalSchema,
  BulkRemovalSchema
]);

export const ListDependenciesSchema = z.object(ListDependenciesSchemaShape);

// Input types
export type AddDependencyInput = z.infer<typeof AddDependencySchema>;
export type RemoveDependencyInput = z.infer<typeof RemoveDependencySchema>;
export type ListDependenciesInput = z.infer<typeof ListDependenciesSchema>;

// Response types
export type AddDependencyResponse = McpToolResponse;
export type RemoveDependencyResponse = McpToolResponse;
export type ListDependenciesResponse = McpToolResponse;

// Data types
export interface DependencyList {
  dependencies: ProjectDependency[]; // Projects this project depends on
  dependents: ProjectDependency[];   // Projects that depend on this project
}

// Export valid types for use in other files
export const ValidDependencyTypes = VALID_DEPENDENCY_TYPES;