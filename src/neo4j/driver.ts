import neo4j, { ManagedTransaction } from "neo4j-driver";
import { config } from "../config/index.js";

export const driver = neo4j.driver(
  config.neo4jUri,
  neo4j.auth.basic(config.neo4jUser, config.neo4jPassword)
);

export const getSession = () => driver.session();

export const withTransaction = async <T>(
  operation: (tx: ManagedTransaction) => Promise<T>
): Promise<T> => {
  const session = driver.session();
  try {
    const result = await session.executeWrite(async (tx) => {
      return await operation(tx);
    });
    return result;
  } catch (error) {
    // Transaction will automatically roll back on error
    throw error;
  } finally {
    await session.close();
  }
};

export const getReadTransaction = async <T>(operation: (tx: ManagedTransaction) => Promise<T>): Promise<T> => {
  const session = driver.session();
  return session.executeRead(operation);
};

export const closeDriver = async () => {
  await driver.close();
};

export const dropConstraints = async () => {
  const session = getSession();
  try {
    // First list all constraints
    const constraints = await session.run(`
      SHOW CONSTRAINTS
    `);

    // Drop each constraint
    for (const record of constraints.records) {
      const constraintName = record.get('name');
      if (constraintName) {
        await session.run(`
          DROP CONSTRAINT ${constraintName} IF EXISTS
        `);
      }
    }
  } catch (error) {
    console.error('Failed to drop Neo4j constraints:', error);
    throw error;
  } finally {
    await session.close();
  }
};

export const initializeSchema = async () => {
  const session = getSession();
  try {
    // Create constraint for unique project customId
    await session.run(`
      CREATE CONSTRAINT project_customid_unique IF NOT EXISTS
      FOR (p:Project)
      REQUIRE p.customId IS UNIQUE
    `);

    // Create constraint for unique note customId
    await session.run(`
      CREATE CONSTRAINT note_customid_unique IF NOT EXISTS
      FOR (n:Note)
      REQUIRE n.customId IS UNIQUE
    `);

    // Create constraint for unique link customId
    await session.run(`
      CREATE CONSTRAINT link_customid_unique IF NOT EXISTS
      FOR (l:Link)
      REQUIRE l.customId IS UNIQUE
    `);

    // Create constraint for unique member customId
    await session.run(`
      CREATE CONSTRAINT member_customid_unique IF NOT EXISTS
      FOR (m:Member)
      REQUIRE m.customId IS UNIQUE
    `);

    // Create constraint for unique whiteboard customId
    await session.run(`
      CREATE CONSTRAINT whiteboard_customid_unique IF NOT EXISTS
      FOR (w:Whiteboard)
      REQUIRE w.customId IS UNIQUE
    `);

    // Create constraint for unique whiteboard version customId
    await session.run(`
      CREATE CONSTRAINT whiteboard_version_customid_unique IF NOT EXISTS
      FOR (v:WhiteboardVersion)
      REQUIRE v.customId IS UNIQUE
    `);

    // Existing constraints
    // Create constraint for unique project names
    await session.run(`
      CREATE CONSTRAINT project_name_unique IF NOT EXISTS
      FOR (p:Project)
      REQUIRE p.name IS UNIQUE
    `);

    // Create constraint for unique whiteboard IDs
    await session.run(`
      CREATE CONSTRAINT whiteboard_id_unique IF NOT EXISTS
      FOR (w:Whiteboard)
      REQUIRE w.id IS UNIQUE
    `);

    // Create constraint for unique whiteboard version IDs
    await session.run(`
      CREATE CONSTRAINT whiteboard_version_id_unique IF NOT EXISTS
      FOR (v:WhiteboardVersion)
      REQUIRE v.id IS UNIQUE
    `);

    // Create constraint for unique combination of whiteboardId and version number
    await session.run(`
      CREATE CONSTRAINT whiteboard_version_unique IF NOT EXISTS
      FOR (v:WhiteboardVersion)
      REQUIRE (v.whiteboardId, v.version) IS UNIQUE
    `);

  } catch (error) {
    console.error('Failed to initialize Neo4j schema:', error);
    throw error;
  } finally {
    await session.close();
  }
};