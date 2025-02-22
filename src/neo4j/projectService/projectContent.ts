import { getSession } from "../driver.js";
import { logger } from "../../utils/logger.js";
import { McpError, ProjectErrorCode, LinkErrorCode } from "../../types/errors.js";
import { ProjectNote, ProjectLink } from "./types.js";
import { handleNeo4jError, validateImmutableProps, validateEntityId } from "./utils.js";
import { generateCustomId } from "../../utils/idGenerator.js";

// Notes Management
export const addProjectNote = async (projectId: string, note: Omit<ProjectNote, "id" | "projectId">): Promise<ProjectNote | never> => {
  const session = getSession();
  try {
    const result = await session.run(
      `MATCH (p:Project)
      WHERE p.customId = $projectId
      CREATE (n:Note {
        text: $text,
        tags: $tags,
        timestamp: $timestamp,
        customId: $noteId
      })-[:BELONGS_TO]->(p)
      RETURN n {
        .text,
        .tags,
        .timestamp,
        id: n.customId,
        projectId: p.customId,
        customId: n.customId
      } AS note`,
      {
        projectId: projectId,
        noteId: generateCustomId('NOTE'),
        text: note.text,
        tags: note.tags || [],
        timestamp: note.timestamp || new Date().toISOString()
      }
    );

    if (!result.records.length) {
      throw new McpError(
        ProjectErrorCode.PROJECT_NOT_FOUND,
        `Project with ID ${projectId} not found`
      );
    }

    return result.records[0].get("note");
  } catch (error) {
    throw handleNeo4jError(error, { projectId, note });
  } finally {
    await session.close();
  }
};

export const addProjectNotesBulk = async (
  projectId: string,
  notes: Array<Omit<ProjectNote, "id" | "projectId">>
): Promise<ProjectNote[] | never> => {
  const session = getSession();
  try {
    const result = await session.run(
      `MATCH (p:Project)
      WHERE p.customId = $projectId
      UNWIND $notes as noteData
      CREATE (n:Note {
        text: noteData.text,
        tags: COALESCE(noteData.tags, []),
        timestamp: COALESCE(noteData.timestamp, $defaultTimestamp),
        customId: noteData.customId
      })-[:BELONGS_TO]->(p)
      RETURN n {
        .text,
        .tags,
        .timestamp,
        id: n.customId,
        projectId: p.customId
      } AS note`,
      {
        projectId,
        notes: notes.map(n => ({
          ...n,
          customId: generateCustomId('NOTE')
        })),
        defaultTimestamp: new Date().toISOString()
      }
    );

    if (!result.records.length) {
      throw new McpError(
        ProjectErrorCode.PROJECT_NOT_FOUND,
        `Project with ID ${projectId} not found`
      );
    }

    return result.records.map(record => record.get("note"));
  } catch (error) {
    throw handleNeo4jError(error, { projectId, notes });
  } finally {
    await session.close();
  }
};

export const getProjectNotes = async (projectId: string): Promise<ProjectNote[] | never> => {
  const session = getSession();
  try {
    const result = await session.run(
      `MATCH (n:Note)-[:BELONGS_TO]->(p:Project)
      WHERE p.customId = $projectId
      RETURN n {
        .text,
        .tags,
        .timestamp,
        id: n.customId,
        projectId: p.customId
      } AS note`,
      { projectId }
    );
    return result.records.map(record => record.get("note"));
  } catch (error) {
    throw handleNeo4jError(error, { projectId });
  } finally {
    await session.close();
  }
};

// Links Management
export const addProjectLink = async (
  projectId: string, 
  link: Omit<ProjectLink, "id" | "projectId" | "createdAt" | "updatedAt">
): Promise<ProjectLink | never> => {
  const session = getSession();
  try {
    const now = new Date().toISOString();
    const result = await session.run(
      `// First check for duplicate URL
      MATCH (p:Project)
      WHERE p.customId = $projectId
      OPTIONAL MATCH (existingLink:Link)-[:BELONGS_TO]->(p)
      WHERE existingLink.url = $url
      WITH p, existingLink
      WHERE existingLink IS NULL
      
      // Create new link if no duplicate found
      CREATE (l:Link {
        title: $title,
        url: $url,
        description: $description,
        category: $category,
        createdAt: $createdAt,
        updatedAt: $updatedAt,
        customId: $linkId
      })-[:BELONGS_TO]->(p)
      
      // Return either the new link or null if duplicate found
      RETURN l {
        .title,
        .url,
        .description,
        .category,
        .createdAt,
        .updatedAt,
        id: l.customId,
        projectId: p.customId
      } AS link`,
      {
        projectId,
        linkId: generateCustomId('LINK'),
        title: link.title,
        url: link.url,
        description: link.description || "",
        category: link.category || "general",
        createdAt: now,
        updatedAt: now
      }
    );

    if (!result.records.length) {
      // Check if it's due to duplicate URL
      const duplicateCheck = await session.run(
        `MATCH (l:Link)-[:BELONGS_TO]->(p:Project)
        WHERE p.customId = $projectId AND l.url = $url
        RETURN l.url`,
        { projectId, url: link.url }
      );
      
      if (duplicateCheck.records.length > 0) {
        throw new McpError(
          LinkErrorCode.DUPLICATE_URL,
          `URL already exists in project: ${link.url}`
        );
      }

      throw new McpError(
        ProjectErrorCode.PROJECT_NOT_FOUND,
        `Project with ID ${projectId} not found`
      );
    }

    return result.records[0].get("link");
  } catch (error) {
    throw handleNeo4jError(error, { projectId, link });
  } finally {
    await session.close();
  }
};

export const addProjectLinksBulk = async (
  projectId: string,
  links: Array<Omit<ProjectLink, "id" | "projectId" | "createdAt" | "updatedAt">>
): Promise<ProjectLink[] | never> => {
  const session = getSession();
  try {
    const now = new Date().toISOString();
    
    // First check for duplicate URLs
    const duplicateCheck = await session.run(
      `MATCH (p:Project)
      WHERE p.customId = $projectId
      MATCH (l:Link)-[:BELONGS_TO]->(p)
      WHERE l.url IN $urls
      RETURN COLLECT(l.url) as duplicateUrls`,
      { 
        projectId,
        urls: links.map(l => l.url)
      }
    );
    
    const duplicateUrls = duplicateCheck.records[0].get("duplicateUrls");
    if (duplicateUrls.length > 0) {
      throw new McpError(
        LinkErrorCode.DUPLICATE_URL,
        `The following URLs already exist in the project: ${duplicateUrls.join(", ")}`
      );
    }

    const result = await session.run(
      `MATCH (p:Project)
      WHERE p.customId = $projectId
      UNWIND $links as linkData
      
      // Create new links (we already checked for duplicates)
      CREATE (l:Link {
        title: linkData.title,
        url: linkData.url,
        description: COALESCE(linkData.description, ""),
        category: COALESCE(linkData.category, "general"),
        createdAt: $now,
        updatedAt: $now,
        customId: linkData.customId
      })-[:BELONGS_TO]->(p)
      RETURN l {
        .title,
        .url,
        .description,
        .category,
        .createdAt,
        .updatedAt,
        id: l.customId,
        projectId: p.customId
      } AS link`,
      { 
        projectId,
        links: links.map(l => ({ ...l, customId: generateCustomId('LINK') })),
        now 
      }
    );

    if (!result.records.length) {
      throw new McpError(
        ProjectErrorCode.PROJECT_NOT_FOUND,
        `Project with ID ${projectId} not found`
      );
    }

    return result.records.map(record => record.get("link"));
  } catch (error) {
    throw handleNeo4jError(error, { projectId, links });
  } finally {
    await session.close();
  }
};

export const updateProjectLink = async (
  linkId: string, 
  updates: Partial<Omit<ProjectLink, "id" | "projectId" | "createdAt" | "updatedAt">>
): Promise<ProjectLink | null | never> => {
  const session = getSession();
  try {
    validateImmutableProps(updates, ["id", "projectId", "createdAt", "updatedAt"]);
    
    const now = new Date().toISOString();
    const result = await session.run(
      `MATCH (l:Link)-[:BELONGS_TO]->(p:Project)
      WHERE l.customId = $linkId
      SET l += $updates,
          l.updatedAt = $now
      RETURN l {
        .title,
        .url,
        .description,
        .category,
        .createdAt,
        .updatedAt,
        id: l.customId,
        projectId: p.customId
      } AS link`,
      { linkId, updates, now }
    );
    return result.records.length ? result.records[0].get("link") : null;
  } catch (error) {
    throw handleNeo4jError(error, { linkId, updates });
  } finally {
    await session.close();
  }
};

export const updateProjectLinksBulk = async (
  updates: Array<{
    linkId: string;
    updates: Partial<Omit<ProjectLink, "id" | "projectId" | "createdAt" | "updatedAt">>;
  }>
): Promise<{ updated: ProjectLink[]; notFound: string[] } | never> => {
  const session = getSession();
  try {
    const now = new Date().toISOString();
    const result = await session.run(
      `UNWIND $updates as updateData
      OPTIONAL MATCH (l:Link)-[:BELONGS_TO]->(p:Project)
      WHERE l.customId = updateData.linkId
      WITH l, p, updateData
      WHERE l IS NOT NULL
      SET l += updateData.updates,
          l.updatedAt = $now
      RETURN l {
        .title,
        .url,
        .description,
        .category,
        .createdAt,
        .updatedAt,
        id: l.customId,
        projectId: p.customId
      } AS link,
      updateData.linkId as requestedId`,
      {
        updates: updates.map(u => ({
          linkId: u.linkId,
          updates: u.updates
        })),
        now
      }
    );
    
    const updated = [];
    const notFound = new Set(updates.map(u => u.linkId));

    for (const record of result.records) {
      const link = record.get("link");
      if (link) {
        updated.push(link);
        notFound.delete(record.get("requestedId"));
      }
    }

    return {
      updated,
      notFound: Array.from(notFound)
    };
  } catch (error) {
    throw handleNeo4jError(error, { updates });
  } finally {
    await session.close();
  }
};

export const deleteProjectLink = async (linkId: string): Promise<boolean | never> => {
  const session = getSession();
  try {
    // First check if link exists
    const result = await session.run(
      `MATCH (l:Link)-[r:BELONGS_TO]->(p:Project)
      WHERE l.customId = $linkId
      RETURN l, p`,
      { linkId }
    );
    
    if (!result.records.length) {
      logger.warn("Attempt to delete non-existent link", { linkId });
      return false;
    }
    
    logger.info("Deleting project link", {
      linkId,
      projectId: result.records[0].get("p").properties.customId
    });
    
    // Now perform the deletion
    await session.run(
      `MATCH (l:Link)-[r:BELONGS_TO]->(p:Project)
      WHERE l.customId = $linkId
      DETACH DELETE l`,
      { linkId }
    );
    return true;
  } catch (error) {
    throw handleNeo4jError(error, { linkId });
  } finally {
    await session.close();
  }
};

export const deleteProjectLinksBulk = async (
  linkIds: string[]
): Promise<{ success: boolean; deletedCount: number; notFoundIds: string[] } | never> => {
  const session = getSession();
  try {
    // First check which links exist
    const result = await session.run(
      `UNWIND $linkIds as linkId
      OPTIONAL MATCH (l:Link)
      WHERE l.customId = linkId
      WITH linkId, l,
           CASE WHEN l IS NOT NULL THEN true ELSE false END as exists
      RETURN collect({
        id: linkId,
        exists: exists
      }) as linkStatuses`,
      { linkIds }
    );
    
    const linkStatuses = result.records[0].get("linkStatuses");
    const existingIds = linkStatuses
      .filter((status: any) => status.exists)
      .map((status: any) => status.id);
    const notFoundIds = linkStatuses
      .filter((status: any) => !status.exists)
      .map((status: any) => status.id);

    if (existingIds.length === 0) {
      logger.warn("No existing links found for bulk deletion", { linkIds });
      return {
        success: false,
        deletedCount: 0,
        notFoundIds
      };
    }
    
    logger.info("Bulk deleting links", {
      totalRequested: linkIds.length,
      existing: existingIds.length,
      notFound: notFoundIds.length
    });
    
    // Perform bulk deletion for existing links
    await session.run(
      `UNWIND $ids as linkId
      MATCH (l:Link)
      WHERE l.customId = linkId
      DETACH DELETE l`,
      { ids: existingIds }
    );
    
    return {
      success: true,
      deletedCount: existingIds.length,
      notFoundIds
    };
  } catch (error) {
    throw handleNeo4jError(error, { linkIds });
  } finally {
    await session.close();
  }
};

export const getProjectLinks = async (projectId: string): Promise<ProjectLink[] | never> => {
  const session = getSession();
  try {
    const result = await session.run(
      `MATCH (l:Link)-[:BELONGS_TO]->(p:Project)
      WHERE p.customId = $projectId
      RETURN l {
        .title,
        .url,
        .description,
        .category,
        .createdAt,
        .updatedAt,
        id: l.customId,
        projectId: p.customId
      } AS link`,
      { projectId }
    );
    return result.records.map(record => record.get("link"));
  } catch (error) {
    throw handleNeo4jError(error, { projectId });
  } finally {
    await session.close();
  }
};