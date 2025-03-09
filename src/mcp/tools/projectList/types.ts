import { z } from "zod";

// Define valid modes based on the resource endpoints
export const PROJECT_LIST_MODES = [
  "all",             // List all projects (atlas-project://list-all)
  "details",         // Get project details (atlas-project://{projectId})
  "notes",           // Get project notes (atlas-project://{projectId}/notes)
  "links",           // Get project links (atlas-project://{projectId}/links)
  "dependencies",    // Get project dependencies (atlas-project://{projectId}/dependencies)
  "members"          // Get project members (atlas-project://{projectId}/members)
] as const;

// Input schema for the tool
export const ProjectListInputSchema = z.object({
  mode: z.enum(PROJECT_LIST_MODES).describe(
    "The type of project information to retrieve: 'all' for listing all projects, 'details' for a specific project, or specific content like 'notes', 'links', 'dependencies', or 'members'"
  ),
  
  // Required for all modes except 'all'
  projectId: z.string().optional().describe(
    "Project ID (required for all modes except 'all')"
  ),
  
  // Pagination parameters (for 'all' mode)
  page: z.number().int().positive().optional().describe(
    "Page number for pagination (default: 1)"
  ),
  limit: z.number().int().positive().max(100).optional().describe(
    "Number of items per page (default: 10, max: 100)"
  ),
  
  // Filtering for notes
  tags: z.array(z.string()).optional().describe(
    "Filter notes by tags (for 'notes' mode)"
  ),
  
  // Filtering for links
  category: z.string().optional().describe(
    "Filter links by category (for 'links' mode)"
  ),
  
  // Filtering for members
  role: z.string().optional().describe(
    "Filter members by role (for 'members' mode)"
  ),
  
  // Include flags for 'details' mode
  includeNotes: z.boolean().optional().describe(
    "Include notes in project details (for 'details' mode)"
  ),
  includeLinks: z.boolean().optional().describe(
    "Include links in project details (for 'details' mode)"
  ),
  includeDependencies: z.boolean().optional().describe(
    "Include dependencies in project details (for 'details' mode)"
  ),
  includeMembers: z.boolean().optional().describe(
    "Include members in project details (for 'details' mode)"
  )
});

// Type definition for the input
export type ProjectListInput = z.infer<typeof ProjectListInputSchema>;

// Define the schema for public export
export const ProjectListSchema = {
  mode: ProjectListInputSchema.shape.mode,
  projectId: ProjectListInputSchema.shape.projectId,
  page: ProjectListInputSchema.shape.page,
  limit: ProjectListInputSchema.shape.limit,
  tags: ProjectListInputSchema.shape.tags,
  category: ProjectListInputSchema.shape.category,
  role: ProjectListInputSchema.shape.role,
  includeNotes: ProjectListInputSchema.shape.includeNotes,
  includeLinks: ProjectListInputSchema.shape.includeLinks,
  includeDependencies: ProjectListInputSchema.shape.includeDependencies,
  includeMembers: ProjectListInputSchema.shape.includeMembers
};