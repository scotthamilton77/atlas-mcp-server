import { logger } from '../../../utils/logger.js';
import { listProjectMembers, getProjectById } from '../../../neo4j/projectService.js';
import { 
  ProjectMembersResourceResponse, 
  ProjectMembersParamsSchema,
  ProjectMembersQuerySchema,
  ProjectMembersResourceData,
  ValidMemberRoles
} from './types.js';
import { McpError, BaseErrorCode, ProjectErrorCode } from '../../../types/errors.js';

type MemberRole = typeof ValidMemberRoles[number];

export const getProjectMembers = async (
  uri: URL,
  variables: Record<string, unknown>
): Promise<ProjectMembersResourceResponse> => {
  try {
    // Validate URI parameters
    const validatedParams = ProjectMembersParamsSchema.parse(variables);
    
    // Parse and validate query parameters
    const queryParams: Record<string, string | number> = {};
    uri.searchParams.forEach((value, key) => {
      if (key === 'limit') {
        queryParams[key] = parseInt(value, 10);
      } else {
        queryParams[key] = value;
      }
    });

    const validatedQuery = ProjectMembersQuerySchema.parse(queryParams);

    logger.info("Getting project members", { 
      projectId: validatedParams.projectId,
      query: validatedQuery,
      uri: uri.href
    });

    // First verify the project exists
    const project = await getProjectById(validatedParams.projectId);
    if (!project) {
      throw new McpError(
        ProjectErrorCode.PROJECT_NOT_FOUND,
        `Project with ID ${validatedParams.projectId} not found`,
        { projectId: validatedParams.projectId }
      );
    }

    // Get all members for the project
    const allMembers = await listProjectMembers(validatedParams.projectId);

    // Apply filtering
    let filteredMembers = allMembers;
    
    if (validatedQuery.role) {
      filteredMembers = filteredMembers.filter(member => 
        member.role === validatedQuery.role
      );
    }

    if (validatedQuery.userId) {
      filteredMembers = filteredMembers.filter(member => 
        member.userId === validatedQuery.userId
      );
    }

    // Apply sorting
    const sortOrder = validatedQuery.sortOrder === 'desc' ? -1 : 1;
    filteredMembers.sort((a, b) => {
      switch (validatedQuery.sortBy) {
        case 'role':
          // Sort by role priority (owner > admin > member > viewer)
          const roleOrder = ValidMemberRoles.indexOf(a.role as MemberRole) - 
                          ValidMemberRoles.indexOf(b.role as MemberRole);
          return sortOrder * roleOrder;
        case 'joinedAt':
          return sortOrder * (new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime());
        case 'updatedAt':
          return sortOrder * (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
        default:
          return 0;
      }
    });

    // Apply limit
    const limitedMembers = filteredMembers.slice(0, validatedQuery.limit);

    // Collect metadata
    const roleCount = allMembers.reduce((acc, member) => {
      const role = member.role as MemberRole;
      acc[role] = (acc[role] || 0) + 1;
      return acc;
    }, {} as Record<MemberRole, number>);

    const timestamps = allMembers.map(member => new Date(member.joinedAt).getTime());
    const oldestMember = timestamps.length ? new Date(Math.min(...timestamps)).toISOString() : undefined;
    const newestMember = timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : undefined;

    // Calculate active members (those updated in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const activeMembers = allMembers.filter(member => 
      new Date(member.updatedAt) > thirtyDaysAgo
    ).length;

    // Format the resource data
    const resourceData: ProjectMembersResourceData = {
      members: {
        items: limitedMembers,
        total: allMembers.length,
        filtered: filteredMembers.length
      },
      metadata: {
        projectId: validatedParams.projectId,
        roles: {
          owner: roleCount['owner'] || 0,
          admin: roleCount['admin'] || 0,
          member: roleCount['member'] || 0,
          viewer: roleCount['viewer'] || 0
        },
        activeMembers,
        oldestMember,
        newestMember
      },
      query: {
        role: validatedQuery.role,
        userId: validatedQuery.userId,
        sortBy: validatedQuery.sortBy,
        sortOrder: validatedQuery.sortOrder,
        limit: validatedQuery.limit
      },
      fetchedAt: new Date().toISOString()
    };

    logger.info("Project members retrieved successfully", { 
      projectId: validatedParams.projectId,
      total: allMembers.length,
      filtered: filteredMembers.length,
      returned: limitedMembers.length
    });

    return {
      contents: [{
        uri: uri.href,
        text: JSON.stringify(resourceData, null, 2),
        mimeType: "application/json"
      }],
      _type: "resource_response"
    };
  } catch (error) {
    // Handle specific error cases
    if (error instanceof McpError) {
      throw error;
    }

    logger.error("Error getting project members", { 
      error: error instanceof Error ? error.message : 'Unknown error',
      projectId: variables.projectId,
      uri: uri.href
    });

    // Convert other errors to McpError
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Error getting project members: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { projectId: variables.projectId }
    );
  }
};