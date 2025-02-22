import { getSession } from "../driver.js";
import { logger } from "../../utils/logger.js";
import { McpError, ProjectErrorCode } from "../../types/errors.js";
import { ProjectDependency, DependencyDetails, ProjectMember } from "./types.js";
import { handleNeo4jError } from "./utils.js";
import { getProjectById } from "./projectCore.js";

// Dependencies Management
export const getDependencyDetails = async (dependencyId: string): Promise<DependencyDetails | null | never> => {
  const session = getSession();
  try {
    const result = await session.run(
      `MATCH (source:Project)-[d:DEPENDS_ON]->(target:Project)
      WHERE d.customId = $dependencyId
      RETURN {
        id: d.customId,
        sourceProjectId: source.customId,
        targetProjectId: target.customId,
        type: d.type,
        description: d.description,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        sourceProject: {
          id: source.customId,
          name: source.name,
          status: source.status
        },
        targetProject: {
          id: target.customId,
          name: target.name,
          status: target.status
        }
      } as dependency`,
      { dependencyId }
    );

    return result.records.length ? result.records[0].get("dependency") : null;
  } catch (error) {
    throw handleNeo4jError(error, { dependencyId });
  } finally {
    await session.close();
  }
};

export const addDependency = async (
  sourceProjectId: string,
  targetProjectId: string,
  dependency: Omit<ProjectDependency, "id" | "sourceProjectId" | "targetProjectId" | "createdAt" | "updatedAt">
): Promise<ProjectDependency | never> => {
  const session = getSession();
  try {
    // Check if both projects exist before proceeding
    const sourceProject = await getProjectById(sourceProjectId);
    const targetProject = await getProjectById(targetProjectId);

    if (!sourceProject) {
      throw new McpError(
        ProjectErrorCode.PROJECT_NOT_FOUND,
        `Source project with ID ${sourceProjectId} not found`,
        { projectId: sourceProjectId }
      );
    }
    if (!targetProject) {
      throw new McpError(
        ProjectErrorCode.PROJECT_NOT_FOUND,
        `Target project with ID ${targetProjectId} not found`,
        { projectId: targetProjectId }
      );
    }

    const now = new Date().toISOString();

    // Check for cycles using APOC path expansion
    const cycleCheck = await session.run(
      `MATCH (source:Project {customId: $sourceId}), (target:Project {customId: $targetId})
      CALL apoc.path.expandConfig(target, {
        relationshipFilter: "DEPENDS_ON>",
        terminatorNodes: [source],
        maxLevel: 10
      })
      YIELD path
      RETURN COUNT(path) > 0 as wouldCreateCycle`,
      {
        sourceId: sourceProjectId,
        targetId: targetProjectId
      }
    );

    if (cycleCheck.records[0].get("wouldCreateCycle")) {
      throw new McpError(
        ProjectErrorCode.INVALID_DEPENDENCY,
        "Cannot create dependency: would create a circular dependency",
        { sourceProjectId, targetProjectId }
      );
    }

    // If no cycle would be created, proceed with creating the dependency
    const params = {
      sourceId: sourceProjectId,
      targetId: targetProjectId,
      dependencyId: dependency.customId,
      type: dependency.type,
      description: dependency.description
    };
    logger.info("Creating dependency with params:", { params, dependency });

    const result = await session.run(
      `MATCH (source:Project), (target:Project)
      WHERE source.customId = $sourceId
      AND target.customId = $targetId
      CREATE (source)-[d:DEPENDS_ON {
        customId: $dependencyId,
        type: $type,
        description: $description,
        createdAt: $createdAt,
        updatedAt: $updatedAt
      }]->(target)
      RETURN {
        id: d.customId,
        sourceProjectId: source.customId,
        targetProjectId: target.customId,
        type: d.type,
        description: d.description,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt
      } as dependency`,
      {
        sourceId: sourceProjectId,
        targetId: targetProjectId,
        dependencyId: dependency.customId,
        type: dependency.type,
        description: dependency.description,
        createdAt: now,
        updatedAt: now
      }
    );

    return result.records[0].get("dependency");
  } catch (error) {
    throw handleNeo4jError(error, { sourceProjectId, targetProjectId, dependency });
  } finally {
    await session.close();
  }
};

export const addDependenciesBulk = async (
  dependencies: Array<{
    sourceProjectId: string;
    customId: string;
    targetProjectId: string;
    type: string;
    description?: string;
  }>
): Promise<{ created: ProjectDependency[]; errors: Array<{ index: number; error: string }> }> => {
  const session = getSession();
  try {
    const now = new Date().toISOString();
    const errors: Array<{ index: number; error: string }> = [];
    const created: ProjectDependency[] = [];

    // Process dependencies sequentially to properly handle cycle checks
    for (let i = 0; i < dependencies.length; i++) {
      const dep = dependencies[i];
      try {
        // Check if both projects exist
        const sourceProject = await getProjectById(dep.sourceProjectId);
        const targetProject = await getProjectById(dep.targetProjectId);

        if (!sourceProject) {
          errors.push({ index: i, error: `Source project ${dep.sourceProjectId} not found` });
          continue;
        }
        if (!targetProject) {
          errors.push({ index: i, error: `Target project ${dep.targetProjectId} not found` });
          continue;
        }

        // Check for cycles using APOC path expansion
        const cycleCheck = await session.run(
          `MATCH (source:Project {customId: $sourceId}), (target:Project {customId: $targetId})
          CALL apoc.path.expandConfig(target, {
            relationshipFilter: "DEPENDS_ON>",
            terminatorNodes: [source],
            maxLevel: 10
          })
          YIELD path
          RETURN COUNT(path) > 0 as wouldCreateCycle`,
          {
            sourceId: dep.sourceProjectId,
            targetId: dep.targetProjectId
          }
        );

        if (cycleCheck.records[0].get("wouldCreateCycle")) {
          errors.push({
            index: i,
            error: `Would create circular dependency between ${dep.sourceProjectId} and ${dep.targetProjectId}`
          });
          continue;
        }

        // Create dependency
        const result = await session.run(
          `MATCH (source:Project), (target:Project)
          WHERE source.customId = $sourceId
          AND target.customId = $targetId
          CREATE (source)-[d:DEPENDS_ON {
            customId: $dependencyId,
            type: $type,
            description: $description,
            createdAt: $createdAt,
            updatedAt: $updatedAt
          }]->(target)
          RETURN {
            id: d.customId,
            sourceProjectId: source.customId,
            targetProjectId: target.customId,
            type: d.type,
            description: d.description,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt
          } as dependency`,
          {
            sourceId: dep.sourceProjectId,
            targetId: dep.targetProjectId,
            dependencyId: dep.customId,
            type: dep.type,
            description: dep.description,
            createdAt: now,
            updatedAt: now
          }
        );

        created.push(result.records[0].get("dependency"));
      } catch (error) {
        errors.push({
          index: i,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return { created, errors };
  } catch (error) {
    throw handleNeo4jError(error, { dependencies });
  } finally {
    await session.close();
  }
};

export const removeDependency = async (dependencyId: string): Promise<boolean | never> => {
  const session = getSession();
  try {
    const result = await session.run(
      `MATCH (source:Project)-[d:DEPENDS_ON]->(target:Project)
      WHERE d.customId = $dependencyId
      DELETE d
      RETURN count(d) as deleted`,
      { dependencyId }
    );

    const deleted = result.records[0].get("deleted") === 1;
    if (!deleted) {
      logger.warn("Attempt to remove non-existent dependency", { dependencyId });
    }
    return deleted;
  } catch (error) {
    throw handleNeo4jError(error, { dependencyId });
  } finally {
    await session.close();
  }
};

export const removeDependenciesBulk = async (
  dependencyIds: string[]
): Promise<{ success: boolean; deletedCount: number; notFoundIds: string[] }> => {
  const session = getSession();
  try {
    // First check which dependencies exist
    const result = await session.run(
      `UNWIND $dependencyIds as depId
      OPTIONAL MATCH ()-[d:DEPENDS_ON]->()
      WHERE d.customId = depId
      WITH depId, d,
           CASE WHEN d IS NOT NULL THEN true ELSE false END as exists
      RETURN collect({
        id: depId,
        exists: exists
      }) as depStatuses`,
      { dependencyIds }
    );

    const depStatuses = result.records[0].get("depStatuses");
    const existingIds = depStatuses
      .filter((status: any) => status.exists)
      .map((status: any) => status.id);
    const notFoundIds = depStatuses
      .filter((status: any) => !status.exists)
      .map((status: any) => status.id);

    if (existingIds.length === 0) {
      logger.warn("No existing dependencies found for bulk deletion", { dependencyIds });
      return {
        success: false,
        deletedCount: 0,
        notFoundIds
      };
    }

    logger.info("Bulk deleting dependencies", {
      totalRequested: dependencyIds.length,
      existing: existingIds.length,
      notFound: notFoundIds.length
    });

    // Perform bulk deletion for existing dependencies
    await session.run(
      `UNWIND $existingIds as depId
      MATCH ()-[d:DEPENDS_ON]->()
      WHERE d.customId = depId
      DELETE d`,
      { existingIds }
    );

    return {
      success: true,
      deletedCount: existingIds.length,
      notFoundIds
    };
  } catch (error) {
    throw handleNeo4jError(error, { dependencyIds });
  } finally {
    await session.close();
  }
};

export const listProjectDependencies = async (projectId: string): Promise<{
  dependencies: ProjectDependency[];
  dependents: ProjectDependency[];
} | never> => {
  const session = getSession();
  try {
    const result = await session.run(
      `MATCH (p:Project)
      WHERE p.customId = $projectId

      WITH p
      // Collect outgoing dependencies
      OPTIONAL MATCH (p)-[d:DEPENDS_ON]->(target:Project)
      WITH p,
           COLLECT(CASE WHEN d IS NOT NULL
             THEN {
               id: d.customId,
               sourceProjectId: p.customId,
               targetProjectId: target.customId,
               type: d.type,
               description: d.description,
               createdAt: d.createdAt,
               updatedAt: d.updatedAt
             }
             ELSE NULL
           END) AS dependencies

      // Collect incoming dependencies (dependents)
      OPTIONAL MATCH (source:Project)-[d2:DEPENDS_ON]->(p)
      WITH p,
           dependencies,
           COLLECT(CASE WHEN d2 IS NOT NULL
             THEN {
               id: d2.customId,
               sourceProjectId: source.customId,
               targetProjectId: p.customId,
               type: d2.type,
               description: d2.description,
               createdAt: d2.createdAt,
               updatedAt: d2.updatedAt
             }
             ELSE NULL
           END) AS dependents
      RETURN {
        dependencies: [dep IN dependencies WHERE dep IS NOT NULL],
        dependents: [dep IN dependents WHERE dep IS NOT NULL]
      } AS result`,
      { projectId }
    );

    if (!result.records.length) {
      throw new McpError(
        ProjectErrorCode.PROJECT_NOT_FOUND,
        `Project with ID ${projectId} not found`
      );
    }

    return result.records[0].get("result");
  } catch (error) {
    throw handleNeo4jError(error, { projectId });
  } finally {
    await session.close();
  }
};

// Members Management
export const addProjectMember = async (
  projectId: string,
  member: Omit<ProjectMember, "id" | "projectId" | "joinedAt" | "updatedAt">
): Promise<ProjectMember | never> => {
  const session = getSession();
  try {
    const now = new Date().toISOString();
    const memberId = `MEMBER_${Date.now()}`;
    const result = await session.run(
      `MATCH (p:Project)
      WHERE p.customId = $projectId
      CREATE (m:Member {
        customId: $memberId,
        userId: $userId,
        role: $role,
        joinedAt: $joinedAt,
        updatedAt: $updatedAt
      })-[:MEMBER_OF]->(p)
      RETURN m {
        .userId,
        .role,
        .joinedAt,
        .updatedAt,
        id: m.customId,
        projectId: p.customId
      } AS member`,
      {
        projectId,
        memberId,
        userId: member.userId,
        role: member.role,
        joinedAt: now,
        updatedAt: now
      }
    );

    if (!result.records.length) {
      throw new McpError(
        ProjectErrorCode.PROJECT_NOT_FOUND,
        `Project with ID ${projectId} not found`
      );
    }

    return result.records[0].get("member");
  } catch (error) {
    throw handleNeo4jError(error, { projectId, member });
  } finally {
    await session.close();
  }
};

export const addProjectMembersBulk = async (
  projectId: string,
  members: Array<Omit<ProjectMember, "id" | "projectId" | "joinedAt" | "updatedAt">>
): Promise<{ created: ProjectMember[]; errors: Array<{ index: number; error: string }> }> => {
  const session = getSession();
  try {
    // First check if project exists
    const project = await getProjectById(projectId);
    if (!project) {
      throw new McpError(
        ProjectErrorCode.PROJECT_NOT_FOUND,
        `Project with ID ${projectId} not found`
      );
    }

    const now = new Date().toISOString();
    const result = await session.run(
      `MATCH (p:Project)
      WHERE p.customId = $projectId
      UNWIND $members as memberData
      CREATE (m:Member {
        customId: $memberId + toString(memberData.index),
        userId: memberData.userId,
        role: memberData.role,
        joinedAt: $now,
        updatedAt: $now
      })-[:MEMBER_OF]->(p)
      RETURN m {
        .userId,
        .role,
        .joinedAt,
        .updatedAt,
        id: m.customId,
        projectId: p.customId
      } AS member`,
      {
        projectId,
        memberId: `MEMBER_${Date.now()}_`,
        members: members.map((m, i) => ({ ...m, index: i })),
        now
      }
    );

    return {
      created: result.records.map(record => record.get("member")),
      errors: [] // In this case, errors would be caught by the database constraints
    };
  } catch (error) {
    throw handleNeo4jError(error, { projectId, members });
  } finally {
    await session.close();
  }
};

export const removeProjectMembersBulk = async (
  memberIds: string[]
): Promise<{ success: boolean; deletedCount: number; notFoundIds: string[] }> => {
  const session = getSession();
  try {
    // First check which members exist
    const result = await session.run(
      `UNWIND $memberIds as memberId
      OPTIONAL MATCH (m:Member)
      WHERE m.customId = memberId
      WITH memberId, m,
           CASE WHEN m IS NOT NULL THEN true ELSE false END as exists
      RETURN collect({
        id: memberId,
        exists: exists
      }) as memberStatuses`,
      { memberIds }
    );

    const memberStatuses = result.records[0].get("memberStatuses");
    const existingIds = memberStatuses
      .filter((status: any) => status.exists)
      .map((status: any) => status.id);
    const notFoundIds = memberStatuses
      .filter((status: any) => !status.exists)
      .map((status: any) => status.id);

    if (existingIds.length === 0) {
      logger.warn("No existing members found for bulk deletion", { memberIds });
      return {
        success: false,
        deletedCount: 0,
        notFoundIds
      };
    }

    logger.info("Bulk deleting members", {
      totalRequested: memberIds.length,
      existing: existingIds.length,
      notFound: notFoundIds.length
    });

    // Perform bulk deletion for existing members
    await session.run(
      `UNWIND $existingIds as memberId
      MATCH (m:Member)
      WHERE m.customId = memberId
      DETACH DELETE m`,
      { existingIds }
    );

    return {
      success: true,
      deletedCount: existingIds.length,
      notFoundIds
    };
  } catch (error) {
    throw handleNeo4jError(error, { memberIds });
  } finally {
    await session.close();
  }
};

export const removeProjectMember = async (memberId: string): Promise<boolean | never> => {
  const session = getSession();
  try {
    // First check if member exists
    const result = await session.run(
      `MATCH (m:Member)-[r:MEMBER_OF]->(p:Project)
      WHERE m.customId = $memberId
      RETURN m, p`,
      { memberId }
    );

    if (!result.records.length) {
      logger.warn("Attempt to remove non-existent member", { memberId });
      return false;
    }

    logger.info("Removing project member", {
      memberId,
      projectId: result.records[0].get("p").properties.customId,
      userId: result.records[0].get("m").properties.userId
    });

    // Now perform the deletion
    await session.run(
      `MATCH (m:Member)-[r:MEMBER_OF]->(p:Project)
      WHERE m.customId = $memberId
      DETACH DELETE m`,
      { memberId }
    );
    return true;
  } catch (error) {
    throw handleNeo4jError(error, { memberId });
  } finally {
    await session.close();
  }
};

export const listProjectMembers = async (projectId: string): Promise<ProjectMember[] | never> => {
  const session = getSession();
  try {
    const result = await session.run(
      `MATCH (m:Member)-[:MEMBER_OF]->(p:Project)
      WHERE p.customId = $projectId
      WITH m, p
      ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'member' THEN 2 ELSE 3 END, m.joinedAt
      RETURN m {
        .userId,
        .role,
        .joinedAt,
        .updatedAt,
        id: m.customId,
        projectId: p.customId
      } AS member`,
      { projectId }
    );
    return result.records.map(record => record.get("member"));
  } catch (error) {
    throw handleNeo4jError(error, { projectId });
  } finally {
    await session.close();
  }
};