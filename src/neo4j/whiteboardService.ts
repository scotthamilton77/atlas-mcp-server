import { getSession, withTransaction } from './driver.js';
import { McpError, BaseErrorCode } from '../types/errors.js';
import { logger } from '../utils/logger.js';
import neo4j from 'neo4j-driver';

export interface Whiteboard {
  id: string;
  data: any;
  projectId?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface WhiteboardVersion {
  id: string;
  whiteboardId: string;
  version: number;
  data: any;
  createdAt: string;
  projectId?: string;
}

const generateVersionId = () => `wv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export const createWhiteboard = async (
  id: string,
  data: any = {},
  projectId?: string
): Promise<Whiteboard> => {
  const session = getSession();
  try {
    // If projectId is provided, verify project exists
    if (projectId) {
      const projectExists = await session.run(
        `MATCH (p:Project) WHERE p.customId = $projectId RETURN p`,
        { projectId }
      );
      
      if (!projectExists.records.length) {
        throw new McpError(
          BaseErrorCode.NOT_FOUND,
          `Project with ID '${projectId}' not found`
        );
      }
    }

    const result = await session.run(
      `
      CREATE (w:Whiteboard:Content {
        id: $id,
        data: $data,
        projectId: $projectId,
        version: 1,
        createdAt: datetime(),
        updatedAt: datetime()
      })
      WITH w
      OPTIONAL MATCH (p:Project) WHERE p.customId = $projectId
      FOREACH (x IN CASE WHEN p IS NOT NULL THEN [1] ELSE [] END |
        CREATE (w)-[:BELONGS_TO]->(p)
      )
      RETURN w
      `,
      { 
        id, 
        data: JSON.stringify(data), 
        projectId
      }
    );

    if (!result.records[0]) {
      throw new McpError(
        BaseErrorCode.INTERNAL_ERROR,
        'Failed to create whiteboard'
      );
    }

    const node = result.records[0].get('w').properties;
    return {
      id: node.id,
      data: JSON.parse(node.data),
      projectId: node.projectId,
      version: node.version.toNumber(),
      createdAt: new Date(node.createdAt).toISOString(),
      updatedAt: new Date(node.updatedAt).toISOString()
    };
  } catch (error) {
    if (error instanceof McpError) throw error;
    
    if (error instanceof neo4j.Neo4jError && 
        error.message.includes('already exists')) {
      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        `Whiteboard with ID '${id}' already exists`
      );
    }

    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Error creating whiteboard: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  } finally {
    await session.close();
  }
};

export const updateWhiteboard = async (
  id: string,
  newData: any,
  merge = true
): Promise<Whiteboard> => {
  try {
    return await withTransaction(async (tx) => {
      // Get existing whiteboard within transaction
      const existingResult = await tx.run(
        `
        MATCH (w:Whiteboard {id: $id})
        RETURN w
        `,
        { id }
      );

      if (!existingResult.records[0]) {
        throw new McpError(
          BaseErrorCode.NOT_FOUND,
          `Whiteboard '${id}' not found`
        );
      }

      const existingNode = existingResult.records[0].get('w').properties;
      const existingData = JSON.parse(existingNode.data);
      const currentVersion = existingNode.version.toNumber();

      // Create version node and update whiteboard in a single transaction
      const versionId = generateVersionId();
      const finalData = merge ? { ...existingData, ...newData } : newData;

      const result = await tx.run(
        `
        MATCH (w:Whiteboard {id: $id})
        // Archive current version
        CREATE (v:WhiteboardVersion {
          id: $versionId,
          whiteboardId: w.id,
          version: w.version,
          data: w.data,
          projectId: w.projectId,
          createdAt: datetime()
        })
        CREATE (w)-[:HAS_VERSION]->(v)
        // Update whiteboard
        SET w.data = $newData,
            w.version = w.version + 1,
            w.updatedAt = datetime()
        RETURN w
        `,
        { 
          id,
          versionId,
          newData: JSON.stringify(finalData)
        }
      );

      const updatedNode = result.records[0].get('w').properties;
      logger.info(`Updated whiteboard ${id} from version ${currentVersion} to ${updatedNode.version.toNumber()}`);

      return {
        id: updatedNode.id,
        data: JSON.parse(updatedNode.data),
        projectId: updatedNode.projectId,
        version: updatedNode.version.toNumber(),
        createdAt: new Date(updatedNode.createdAt).toISOString(),
        updatedAt: new Date(updatedNode.updatedAt).toISOString()
      };
    });
  } catch (error) {
    if (error instanceof McpError) throw error;
    throw new McpError(BaseErrorCode.INTERNAL_ERROR, `Error updating whiteboard: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const getWhiteboard = async (
  id: string,
  version?: number
): Promise<Whiteboard | null> => {
  const session = getSession();
  try {
    // First check if whiteboard exists and get its current version
    const currentVersionResult = await session.run(
      `
      MATCH (w:Whiteboard {id: $id})
      RETURN w.version as currentVersion
      `,
      { id }
    );

    if (!currentVersionResult.records[0]) return null;
    
    const currentVersion = currentVersionResult.records[0].get('currentVersion').toNumber();
    
    // If specific version requested, validate it exists
    if (version !== undefined) {
      if (version > currentVersion) {
        throw new McpError(
          BaseErrorCode.VALIDATION_ERROR,
          `Version ${version} does not exist. Latest version is ${currentVersion}`
        );
      }
      if (version <= 0) {
        throw new McpError(
          BaseErrorCode.VALIDATION_ERROR,
          'Version must be a positive integer'
        );
      }
    }

    const query = version
      ? `
        MATCH (w:Whiteboard {id: $id})
        OPTIONAL MATCH (w)-[:HAS_VERSION]->(v:WhiteboardVersion {version: $version})
        RETURN w, v
        `
      : `
        MATCH (w:Whiteboard {id: $id})
        RETURN w, null as v
        `;

    const result = await session.run(query, { id, version });

    if (!result.records[0]) return null;

    // If a specific version was requested and found, return that version's data
    const versionNode = result.records[0].get('v');
    if (version && versionNode) {
      const props = versionNode.properties;
      return {
        id: props.whiteboardId,
        data: JSON.parse(props.data),
        projectId: props.projectId,
        version: props.version.toNumber(),
        createdAt: new Date(props.createdAt).toISOString(),
        updatedAt: new Date(props.createdAt).toISOString() // Version nodes don't have updatedAt
      };
    }

    // Otherwise return the current whiteboard state
    const node = result.records[0].get('w').properties;
    return {
      id: node.id,
      data: JSON.parse(node.data),
      projectId: node.projectId,
      version: node.version.toNumber(),
      createdAt: new Date(node.createdAt).toISOString(),
      updatedAt: new Date(node.updatedAt).toISOString()
    };
  } catch (error) {
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Error retrieving whiteboard: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  } finally {
    await session.close();
  }
};

export const deleteWhiteboard = async (id: string): Promise<void> => {
  const session = getSession();
  try {
    const result = await session.run(
      `
      MATCH (w:Whiteboard {id: $id})
      WITH w, exists((w)-[:HAS_VERSION]->()) as hasVersions
      OPTIONAL MATCH (w)-[:HAS_VERSION]->(v:WhiteboardVersion)
      DETACH DELETE w, v
      RETURN hasVersions
      `,
      { id }
    );

    if (!result.records[0]) {
      throw new McpError(
        BaseErrorCode.NOT_FOUND,
        `Whiteboard '${id}' not found`
      );
    }

    logger.info(`Deleted whiteboard ${id} and all its versions`);
  } catch (error) {
    if (error instanceof McpError) throw error;
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Error deleting whiteboard: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  } finally {
    await session.close();
  }
};