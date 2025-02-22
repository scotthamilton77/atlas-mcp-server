import { z } from "zod";
import { McpToolResponse } from '../../../types/mcp.js';
import { ProjectMember } from '../../../neo4j/projectService.js';

// Valid member roles
const VALID_ROLES = ['owner', 'admin', 'member', 'viewer'] as const;

// Base member schema shape for reuse
const MemberSchemaShape = {
  userId: z.string().describe(
    "User ID to add as member."
  ),
  role: z.enum(VALID_ROLES).describe(
    "Member role:\n" +
    "- owner: Full project control\n" +
    "- admin: Manage members and content\n" +
    "- member: Contribute content\n" +
    "- viewer: Read-only access"
  )
} as const;

// Single member schema
const SingleMemberSchema = z.object({
  mode: z.literal("single"),
  projectId: z.string().describe(
    "Project ID to add member to (must start with 'proj_')."
  ),
  ...MemberSchemaShape
}).describe(
  "Add a single member to a project."
);

// Bulk member schema
const BulkMemberSchema = z.object({
  mode: z.literal("bulk"),
  projectId: z.string().describe(
    "Project ID to add members to (must start with 'proj_')."
  ),
  members: z.array(z.object(MemberSchemaShape)).min(1).max(100).describe(
    "Array of members to add (1-100 members)."
  )
}).describe(
  "Add multiple members to a project in a single operation."
);

// Single removal schema
const SingleRemovalSchema = z.object({
  mode: z.literal("single"),
  memberId: z.string().describe(
    "Member ID to remove (must start with 'member_')."
  )
}).describe(
  "Remove a single member by ID."
);

// Bulk removal schema
const BulkRemovalSchema = z.object({
  mode: z.literal("bulk"),
  memberIds: z.array(z.string()).min(1).max(100).describe(
    "Array of member IDs to remove (1-100 members)."
  )
}).describe(
  "Remove multiple members in a single operation."
);

// Schema shapes for tool registration
export const AddMemberSchemaShape = {
  mode: z.enum(["single", "bulk"]).describe(
    "'single' for one member, 'bulk' for multiple members."
  ),
  projectId: z.string().describe(
    "Project ID to add members to (must start with 'proj_')."
  ),
  userId: z.string().optional().describe(
    "Required for single mode: User ID to add."
  ),
  role: z.enum(VALID_ROLES).optional().describe(
    "Required for single mode: Member role."
  ),
  members: z.array(z.object(MemberSchemaShape)).min(1).max(100).optional().describe(
    "Required for bulk mode: Array of 1-100 members with user ID and role."
  )
} as const;

export const RemoveMemberSchemaShape = {
  mode: z.enum(["single", "bulk"]).describe(
    "'single' for one member, 'bulk' for multiple members."
  ),
  memberId: z.string().optional().describe(
    "Required for single mode: Member ID to remove."
  ),
  memberIds: z.array(z.string()).min(1).max(100).optional().describe(
    "Required for bulk mode: Array of 1-100 member IDs to remove."
  )
} as const;

export const ListMembersSchemaShape = {
  projectId: z.string().describe(
    "Project ID to list members for (must start with 'proj_')."
  )
} as const;

// Schemas for validation
export const AddMemberSchema = z.discriminatedUnion("mode", [
  SingleMemberSchema,
  BulkMemberSchema
]);

export const RemoveMemberSchema = z.discriminatedUnion("mode", [
  SingleRemovalSchema,
  BulkRemovalSchema
]);

export const ListMembersSchema = z.object(ListMembersSchemaShape);

// Input types
export type AddMemberInput = z.infer<typeof AddMemberSchema>;
export type RemoveMemberInput = z.infer<typeof RemoveMemberSchema>;
export type ListMembersInput = z.infer<typeof ListMembersSchema>;

// Response types
export type AddMemberResponse = McpToolResponse;
export type RemoveMemberResponse = McpToolResponse;
export type ListMembersResponse = McpToolResponse;

// Export valid roles for use in other files
export const ValidMemberRoles = VALID_ROLES;