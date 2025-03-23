/**
 * Database import module for Neo4j backup service
 */
import { logger } from '../../../utils/logger.js';
import { neo4jDriver } from '../driver.js';
import { clearNeo4jDatabase } from '../index.js';
import { NodeLabels } from '../types.js';
import { BackupData, ImportOptions, ImportResult } from './types.js';
import { FileManager } from './file-manager.js';

/**
 * Service for importing data from backups into Neo4j database
 */
export class ImportService {
  /**
   * Import data from a backup file into the Neo4j database
   * @param options Import configuration options
   * @returns Result of the import operation
   */
  static async importBackup(options: ImportOptions): Promise<ImportResult> {
    try {
      logger.info('Starting Neo4j database import', { backupPath: options.backupPath });
      
      // Default options
      const clearDatabase = options.clearDatabase === true;
      const mergeData = options.mergeData === true;
      const includeProjects = options.includeProjects !== false;
      const includeTasks = options.includeTasks !== false;
      const includeKnowledge = options.includeKnowledge !== false;
      const includeRelationships = options.includeRelationships !== false;
      
      // Clear database if requested
      if (clearDatabase) {
        logger.warn('Clearing database before import');
        await clearNeo4jDatabase();
      }
      
      // Extract backup data
      const backupData = await FileManager.extractBackupData(options.backupPath);
      
      // Count of entities imported/updated
      const imported = {
        projects: 0,
        tasks: 0,
        knowledge: 0,
        relationships: 0
      };
      
      const updated = {
        projects: 0,
        tasks: 0,
        knowledge: 0,
        relationships: 0
      };
      
      // Get Neo4j session
      const session = await neo4jDriver.getSession();
      
      try {
        // Import projects
        if (includeProjects && backupData.projects && backupData.projects.length > 0) {
          logger.info(`Importing ${backupData.projects.length} projects`);
          
          for (const project of backupData.projects) {
            try {
              const query = mergeData ? 
                `
                MERGE (p:${NodeLabels.Project} {id: $project.id})
                ON CREATE SET 
                  p = $project,
                  p.importedAt = datetime()
                ON MATCH SET 
                  p = $project,
                  p.updatedAt = datetime(),
                  p.importedAt = datetime()
                RETURN p
                ` : 
                `
                CREATE (p:${NodeLabels.Project})
                SET 
                  p = $project,
                  p.importedAt = datetime()
                RETURN p
                `;
              
              const result = await session.executeWrite(async tx => {
                return await tx.run(query, { project });
              });
              
              if (result.records.length > 0) {
                if (mergeData && result.summary.counters.containsUpdates()) {
                  updated.projects++;
                } else {
                  imported.projects++;
                }
              }
            } catch (error) {
              logger.error('Error importing project', { projectId: project.id, error });
            }
          }
        }
        
        // Import tasks
        if (includeTasks && backupData.tasks && backupData.tasks.length > 0) {
          logger.info(`Importing ${backupData.tasks.length} tasks`);
          
          for (const task of backupData.tasks) {
            try {
              const query = mergeData ? 
                `
                MERGE (t:${NodeLabels.Task} {id: $task.id})
                ON CREATE SET 
                  t = $task,
                  t.importedAt = datetime()
                ON MATCH SET 
                  t = $task,
                  t.updatedAt = datetime(),
                  t.importedAt = datetime()
                RETURN t
                ` : 
                `
                CREATE (t:${NodeLabels.Task})
                SET 
                  t = $task,
                  t.importedAt = datetime()
                RETURN t
                `;
              
              const result = await session.executeWrite(async tx => {
                return await tx.run(query, { task });
              });
              
              if (result.records.length > 0) {
                if (mergeData && result.summary.counters.containsUpdates()) {
                  updated.tasks++;
                } else {
                  imported.tasks++;
                }
              }
            } catch (error) {
              logger.error('Error importing task', { taskId: task.id, error });
            }
          }
        }
        
        // Import knowledge
        if (includeKnowledge && backupData.knowledge && backupData.knowledge.length > 0) {
          logger.info(`Importing ${backupData.knowledge.length} knowledge items`);
          
          for (const knowledge of backupData.knowledge) {
            try {
              const query = mergeData ? 
                `
                MERGE (k:${NodeLabels.Knowledge} {id: $knowledge.id})
                ON CREATE SET 
                  k = $knowledge,
                  k.importedAt = datetime()
                ON MATCH SET 
                  k = $knowledge,
                  k.updatedAt = datetime(),
                  k.importedAt = datetime()
                RETURN k
                ` : 
                `
                CREATE (k:${NodeLabels.Knowledge})
                SET 
                  k = $knowledge,
                  k.importedAt = datetime()
                RETURN k
                `;
              
              const result = await session.executeWrite(async tx => {
                return await tx.run(query, { knowledge });
              });
              
              if (result.records.length > 0) {
                if (mergeData && result.summary.counters.containsUpdates()) {
                  updated.knowledge++;
                } else {
                  imported.knowledge++;
                }
              }
            } catch (error) {
              logger.error('Error importing knowledge', { knowledgeId: knowledge.id, error });
            }
          }
        }
        
        // Import relationships
        if (includeRelationships && backupData.relationships && backupData.relationships.length > 0) {
          logger.info(`Importing ${backupData.relationships.length} relationships`);
          
          for (const rel of backupData.relationships) {
            try {
              const query = `
                MATCH (source {id: $sourceId})
                MATCH (target {id: $targetId})
                WHERE source:${rel.sourceLabel} AND target:${rel.targetLabel}
                ${mergeData ? 'MERGE' : 'CREATE'} (source)-[r:${rel.type}]->(target)
                ${rel.properties && Object.keys(rel.properties).length > 0 
                  ? 'SET r = $properties' 
                  : ''}
                RETURN r
              `;
              
              const result = await session.executeWrite(async tx => {
                return await tx.run(query, { 
                  sourceId: rel.sourceId, 
                  targetId: rel.targetId,
                  properties: rel.properties || {}
                });
              });
              
              if (result.records.length > 0) {
                if (mergeData && result.summary.counters.containsUpdates()) {
                  updated.relationships++;
                } else {
                  imported.relationships++;
                }
              }
            } catch (error) {
              logger.error('Error importing relationship', { 
                sourceId: rel.sourceId, 
                targetId: rel.targetId, 
                type: rel.type,
                error 
              });
            }
          }
        }
      } finally {
        await session.close();
      }
      
      const importResult: ImportResult = {
        success: true,
        timestamp: new Date().toISOString(),
        entitiesImported: imported
      };
      
      if (mergeData) {
        importResult.entitiesUpdated = updated;
      }
      
      logger.info('Neo4j database import completed successfully', {
        importedEntities: importResult.entitiesImported,
        updatedEntities: importResult.entitiesUpdated
      });
      
      return importResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to import Neo4j database', { error });
      
      return {
        success: false,
        timestamp: new Date().toISOString(),
        entitiesImported: {
          projects: 0,
          tasks: 0,
          knowledge: 0,
          relationships: 0
        },
        error: errorMessage
      };
    }
  }
}
