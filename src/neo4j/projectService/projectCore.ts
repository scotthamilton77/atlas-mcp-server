import { getSession } from "../driver.js";
import { logger } from "../../utils/logger.js";
import { McpError, ProjectErrorCode, BaseErrorCode } from "../../types/errors.js";
import { Project, ProjectInput, ProjectOperationErrorCode, ListProjectsOptions, PaginatedProjects, BulkProjectResult } from "./types.js";
import { handleNeo4jError, validateImmutableProps } from "./utils.js";
import { processBulk } from "../../utils/bulkOperationManager.js";
import { generateCustomId, stripCustomIdPrefix, EntityType } from "../../utils/idGenerator.js";

export const createProject = async (project: ProjectInput): Promise<Project | never> => {
  const session = getSession();
  try {
    const now = new Date().toISOString();
    const projectId = generateCustomId('PROJECT');
    const result = await session.run(
      `CREATE (p:Project {
        name: $name,
        description: $description,
        status: $status,
        createdAt: $createdAt,
        updatedAt: $updatedAt,
        customId: $customId
      })
      RETURN p {
        .name,
        .description,
        .status,
        .createdAt,
        .updatedAt,
        id: p.customId
      } AS project`,
      { ...project, createdAt: now, updatedAt: now, customId: projectId }
    );
    return result.records[0].get("project");
  } catch (error) {
    throw handleNeo4jError(error, { project });
  } finally {
    await session.close();
  }
};

export const createProjectsBulk = async (projects: ProjectInput[]): Promise<BulkProjectResult> => {
  logger.info("Starting bulk project creation", { count: projects.length });

  const result = await processBulk<ProjectInput, Project, ProjectOperationErrorCode>(
    projects,
    async (project) => {
      try {
        return await createProject(project);
      } catch (error) {
        // Re-throw McpErrors directly, wrap other errors
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(
          BaseErrorCode.INTERNAL_ERROR,
          `Error creating project: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
    {
      operationName: 'project creation',
      concurrency: 5,
      defaultErrorCode: BaseErrorCode.INTERNAL_ERROR
    }
  );

  return {
    success: result.success,
    message: result.message,
    successes: result.successes,
    errors: result.errors
  };
};

export const getProjectById = async (id: string): Promise<Project | null | never> => {
  const session = getSession();
  try {
    const result = await session.run(
      `MATCH (p:Project)
      WHERE p.customId = $id
      RETURN p {
        .name,
        .description,
        .status,
        .createdAt,
        .updatedAt,
        id: p.customId
      } AS project`,
      { id }
    );
    return result.records.length ? result.records[0].get("project") : null;
  } catch (error) {
    throw handleNeo4jError(error, { id });
  } finally {
    await session.close();
  }
};

export const updateProject = async (id: string, updates: Partial<ProjectInput>): Promise<Project | null | never> => {
  const session = getSession();
  try {
    validateImmutableProps(updates, ["id", "createdAt", "updatedAt"]);

    // Check if project exists
    const currentProject = await getProjectById(id);
    if (!currentProject) {
      throw new McpError(
        ProjectErrorCode.PROJECT_NOT_FOUND,
        `Project with ID ${id} not found`
      );
    }

    const now = new Date().toISOString();
    const result = await session.run(
      `MATCH (p:Project)
      WHERE p.customId = $id
      SET p += $updates,
          p.updatedAt = $now
      RETURN p {
        .name,
        .description,
        .status,
        .createdAt,
        .updatedAt,
        id: p.customId
      } AS project`,
      { id, updates, now }
    );
    return result.records.length ? result.records[0].get("project") : null;
  } catch (error) {
    throw handleNeo4jError(error, { id, updates });
  } finally {
    await session.close();
  }
};

export const updateProjectsBulk = async (
  updates: Array<{ id: string; updates: Partial<ProjectInput> }>
): Promise<{ updated: Project[]; notFound: string[] } | never> => {
  const session = getSession();
  try {
    // Validate all updates
    updates.forEach(update => {
      validateImmutableProps(update.updates, ["id", "createdAt", "updatedAt"]);
    });

    const now = new Date().toISOString();
    const result = await session.run(
      `UNWIND $updates as updateData
      OPTIONAL MATCH (p:Project)
      WHERE p.customId = updateData.id
      WITH p, updateData
      WHERE p IS NOT NULL
      SET p += updateData.updates,
          p.updatedAt = $now
      RETURN p {
        .name,
        .description,
        .status,
        .createdAt,
        .updatedAt,
        id: p.customId
      } AS project,
      updateData.id as requestedId`,
      {
        updates: updates.map(u => ({
          id: u.id,
          updates: u.updates
        })),
        now
      }
    );
    
    const updated = result.records.map(record => record.get("project"));
    const notFound = updates.map(u => u.id).filter(id => !updated.find(p => p.id === id));
    return { updated, notFound };
  } catch (error) {
    throw handleNeo4jError(error, { updates });
  } finally {
    await session.close();
  }
};

interface DeleteProjectResult {
  success: boolean;
  relatedNodes?: {
    noteCount: number;
    linkCount: number;
    memberCount: number;
    outgoingDepsCount: number;
    incomingDepsCount: number;
  };
}

export const deleteProject = async (id: string): Promise<DeleteProjectResult | never> => {
  const session = getSession();
  try {
    // First check if project exists and get related nodes count
    const result = await session.run(
      `MATCH (p:Project)
      WHERE p.customId = $id
      OPTIONAL MATCH (p)<-[:BELONGS_TO]-(notes:Note)
      OPTIONAL MATCH (p)<-[:BELONGS_TO]-(links:Link)
      OPTIONAL MATCH (p)<-[:MEMBER_OF]-(members:Member)
      OPTIONAL MATCH (p)-[outDeps:DEPENDS_ON]->()
      OPTIONAL MATCH ()-[inDeps:DEPENDS_ON]->(p)
      RETURN p, 
             count(notes) as noteCount, 
             count(links) as linkCount,
             count(members) as memberCount,
             count(outDeps) as outgoingDepsCount,
             count(inDeps) as incomingDepsCount`,
      { id }
    );
    
    if (!result.records.length) {
      logger.warn("Attempt to delete non-existent project", { id });
      return { success: false };
    }
    
    const record = result.records[0];
    const relatedNodes = {
      noteCount: record.get("noteCount").toNumber(),
      linkCount: record.get("linkCount").toNumber(),
      memberCount: record.get("memberCount").toNumber(),
      outgoingDepsCount: record.get("outgoingDepsCount").toNumber(),
      incomingDepsCount: record.get("incomingDepsCount").toNumber()
    };
    logger.info("Deleting project and related nodes", {
      id,
      noteCount: record.get("noteCount"),
      linkCount: record.get("linkCount"),
      memberCount: record.get("memberCount"),
      outgoingDependencies: record.get("outgoingDepsCount"),
      incomingDependencies: record.get("incomingDepsCount")
    });
    
    // Now perform the deletion
    await session.run(
      `MATCH (p:Project)
      WHERE p.customId = $id
      OPTIONAL MATCH (p)<-[:BELONGS_TO]-(n)
      OPTIONAL MATCH (p)<-[:MEMBER_OF]-(m)
      OPTIONAL MATCH (p)-[od:DEPENDS_ON]->()
      OPTIONAL MATCH ()-[id:DEPENDS_ON]->(p)
      DETACH DELETE n, m, p`,
      { id }
    );
    
    return { success: true, relatedNodes };
  } catch (error) {
    throw handleNeo4jError(error, { id });
  } finally {
    await session.close();
  }
};

export const deleteProjectsBulk = async (ids: string[]): Promise<{ success: boolean; deletedCount: number; notFoundIds: string[] } | never> => {
  const session = getSession();
  try {
    // First check which projects exist and get related nodes count
    const result = await session.run(
      `UNWIND $ids as projectId
      OPTIONAL MATCH (p:Project)
      WHERE p.customId = projectId
      WITH projectId, p,
           CASE WHEN p IS NOT NULL THEN true ELSE false END as exists
      RETURN collect({
        id: projectId,
        exists: exists
      }) as projectStatuses`,
      { ids }
    );
    
    const projectStatuses = result.records[0].get("projectStatuses");
    const existingIds = projectStatuses
      .filter((status: any) => status.exists)
      .map((status: any) => status.id);
    const notFoundIds = projectStatuses
      .filter((status: any) => !status.exists)
      .map((status: any) => status.id);

    if (existingIds.length === 0) {
      logger.warn("No existing projects found for bulk deletion", { ids });
      return {
        success: false,
        deletedCount: 0,
        notFoundIds
      };
    }
    
    logger.info("Bulk deleting projects", {
      totalRequested: ids.length,
      existing: existingIds.length,
      notFound: notFoundIds.length
    });
    
    // Perform bulk deletion for existing projects
    await session.run(
      `UNWIND $ids as projectId
      MATCH (p:Project)
      WHERE p.customId = projectId
      OPTIONAL MATCH (p)<-[:BELONGS_TO]-(n)
      OPTIONAL MATCH (p)<-[:MEMBER_OF]-(m)
      OPTIONAL MATCH (p)-[od:DEPENDS_ON]->()
      OPTIONAL MATCH ()-[id:DEPENDS_ON]->(p)
      DETACH DELETE n, m, p`,
      { ids: existingIds }
    );
    
    return {
      success: true,
      deletedCount: existingIds.length,
      notFoundIds
    };
  } catch (error) {
    throw handleNeo4jError(error, { ids });
  } finally {
    await session.close();
  }
};

export const listProjects = async (options: ListProjectsOptions = {}): Promise<PaginatedProjects | never> => {
  const session = getSession();
  try {
    const {
      page = 1,
      limit = 10,
    } = options;

    const skip = Math.max(0, (Number(page) - 1)) * Number(limit);
    const limitNum = Math.max(1, Number(limit));

    logger.debug("Neo4j listProjects query parameters", {
      skip,
      limit: limitNum
    });
    
    const result = await session.run(
      `MATCH (p:Project)
      WITH p
      ORDER BY p.createdAt DESC
      SKIP toInteger($skip) LIMIT toInteger($limit)
      RETURN p {
        .name,
        .description,
        .status,
        .createdAt,
        .updatedAt,
        id: p.customId
      } AS project`,
      {
        skip: skip,
        limit: limitNum
      }
    );

    logger.info("Neo4j listProjects query result", {
      recordCount: result.records.length,
      summary: result.summary,
      records: result.records.map(r => r.get("project"))
    });

    // Get total count for pagination
    const countResult = await session.run(
      `MATCH (p:Project)
      RETURN count(p) as total`,
      {}
    );

    logger.info("Neo4j listProjects count result", {
      total: countResult.records[0].get("total").toNumber(),
      summary: countResult.summary
    });

    return {
      items: result.records.map(record => record.get("project")),
      total: countResult.records[0].get("total").toNumber(),
      page,
      limit
    };
  } catch (error) {
    throw handleNeo4jError(error, { options });
  } finally {
    await session.close();
  }
};