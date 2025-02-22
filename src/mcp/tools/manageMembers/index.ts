import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { 
  AddMemberSchemaShape,
  RemoveMemberSchemaShape,
  ListMembersSchemaShape,
  ValidMemberRoles
} from './types.js';
import { addMember } from './addMember.js';
import { removeMember } from './removeMember.js';
import { listMembers } from './listMembers.js';
import { registerTool, createToolExample, createToolMetadata } from '../../../types/tool.js';
import { z } from 'zod';

export const registerMemberTools = (server: McpServer) => {
  // Register add member tool
  registerTool(
    server,
    "project.member.add",
    "Add project members with role-based access (owner/admin/member/viewer). Supports single or bulk addition with permission levels.",
    AddMemberSchemaShape,
    addMember,
    createToolMetadata({
      examples: [
        createToolExample(
          {
            projectId: "proj_123",
            userId: "user_456",
            role: "member"
          },
          `{
  "id": "member_abc",
  "userId": "user_456",
  "role": "member"
}`,
          "Add single member with basic role"
        ),
        createToolExample(
          {
            projectId: "proj_789",
            members: [
              {
                userId: "user_012",
                role: "admin"
              },
              {
                userId: "user_345",
                role: "member"
              }
            ]
          },
          `{
  "success": true,
  "message": "Successfully added 2 members",
  "created": [{
    "id": "member_def",
    "userId": "user_012",
    "role": "admin"
  }],
  "errors": []
}`,
          "Add multiple members with different roles"
        )
      ],
      requiredPermission: "project:member:add",
      returnSchema: z.union([
        // Single member response
        z.object({
          id: z.string().describe("Member ID (member_ prefix)"),
          projectId: z.string().describe("Project ID"),
          userId: z.string().describe("User ID"),
          role: z.enum(ValidMemberRoles).describe("Access role"),
          joinedAt: z.string().describe("Join time")
        }),
        // Bulk creation response
        z.object({
          success: z.boolean().describe("Operation success"),
          message: z.string().describe("Result message"),
          created: z.array(z.object({
            id: z.string().describe("Member ID"),
            projectId: z.string().describe("Project ID"),
            userId: z.string().describe("User ID"),
            role: z.enum(ValidMemberRoles).describe("Role"),
            joinedAt: z.string().describe("Joined")
          })).describe("Created members"),
          errors: z.array(z.object({
            index: z.number().describe("Error index"),
            error: z.string().describe("Error message")
          })).describe("Creation errors")
        })
      ]),
      rateLimit: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 20 // 20 member additions per minute (single or bulk)
      }
    })
  );

  // Register remove member tool
  registerTool(
    server,
    "project.member.remove",
    "Remove members from a project. Use 'single' mode with memberId or 'bulk' mode with memberIds array. " +
    "Requires owner or admin role. This action cannot be undone.",
    RemoveMemberSchemaShape,
    removeMember,
    createToolMetadata({
      examples: [
        createToolExample(
          {
            memberId: "member_abc"
          },
          `{
  "success": true,
  "message": "Member member_abc removed successfully"
}`,
          "Remove a single member"
        ),
        createToolExample(
          {
            memberIds: ["member_abc", "member_def"]
          },
          `{
  "success": true,
  "message": "Successfully removed 2 members",
  "deletedCount": 2,
  "notFoundIds": []
}`,
          "Remove multiple members"
        )
      ],
      requiredPermission: "project:member:remove",
      returnSchema: z.union([
        // Single removal response
        z.object({
          success: z.boolean().describe("Operation success"),
          message: z.string().describe("Result message")
        }),
        // Bulk removal response
        z.object({
          success: z.boolean().describe("Operation success"),
          message: z.string().describe("Result message"),
          deletedCount: z.number().describe("Members removed"),
          notFoundIds: z.array(z.string()).describe("Members not found")
        })
      ]),
      rateLimit: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 20 // 20 member removals per minute (single or bulk)
      }
    })
  );

  // Register list members tool
  registerTool(
    server,
    "project.member.list",
    "List project members ordered by join date (owners first). Returns member roles and join dates.",
    ListMembersSchemaShape,
    listMembers,
    createToolMetadata({
      examples: [
        createToolExample(
          {
            projectId: "proj_123"
          },
          `[
  {
    "id": "member_abc",
    "projectId": "proj_123",
    "userId": "user_456",
    "role": "owner",
    "joinedAt": "2025-02-20T13:45:30Z"
  },
  {
    "id": "member_def",
    "projectId": "proj_123",
    "userId": "user_789",
    "role": "member",
    "joinedAt": "2025-02-20T13:46:00Z"
  }
]`,
          "List project members"
        )
      ],
      requiredPermission: "project:member:list",
      returnSchema: z.array(z.object({
        id: z.string().describe("Member ID"),
        projectId: z.string().describe("Project ID"),
        userId: z.string().describe("User ID"),
        role: z.enum(ValidMemberRoles).describe("Role"),
        joinedAt: z.string().describe("Join time")
      })),
      rateLimit: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 30 // 30 member list requests per minute
      }
    })
  );
};