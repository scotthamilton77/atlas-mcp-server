import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProjectService } from "../../../services/neo4j/projectService.js";
import { toProjectResource, ResourceTemplates, ResourceURIs } from "../types.js";
import { logger } from "../../../utils/logger.js";
import { BaseErrorCode, McpError, ProjectErrorCode } from "../../../types/errors.js";
import { neo4jDriver } from "../../../services/neo4j/driver.js";

/**
 * Register Project Resources
 * 
 * This function registers resource endpoints for the Projects entity
 * - GET atlas://projects - List all projects
 * - GET atlas://projects/{projectId} - Get specific project by ID
 * 
 * @param server The MCP server instance
 */
export function registerProjectResources(server: McpServer) {
  // List all projects
  server.resource(
    "projects-list", 
    ResourceURIs.PROJECTS, 
    {
      name: "All Projects",
      description: "List of all projects in the Atlas platform with pagination support",
      mimeType: "application/json"
    },
    async (uri) => {
    try {
      logger.info("Listing projects", { uri: uri.href });

      // Parse query parameters
      const queryParams = new URLSearchParams(uri.search);
      const filters: Record<string, any> = {};

      // Parse status parameter
      const status = queryParams.get("status");
      if (status) {
        // Filter expects string, not string[]
        filters.status = String(status);
      }

      // Parse taskType parameter
      const taskType = queryParams.get("taskType");
      if (taskType) {
        // Filter expects string, not string[]
        filters.taskType = String(taskType);
      }

      // Parse pagination parameters
      const page = queryParams.has("page") 
        ? parseInt(queryParams.get("page") || "1", 10) 
        : 1;
      
      const limit = queryParams.has("limit") 
        ? parseInt(queryParams.get("limit") || "20", 10)
        : 20;

      // Add pagination to filters
      filters.page = page;
      filters.limit = limit;

      // Query the database directly for better control over field extraction
      const session = await neo4jDriver.getSession();
      
      try {
        // Build query conditions
        let conditions = [];
        const params: Record<string, any> = {};
        
        if (filters.status) {
          params.status = filters.status;
          conditions.push('p.status = $status');
        }
        
        if (filters.taskType) {
          params.taskType = filters.taskType;
          conditions.push('p.taskType = $taskType');
        }
        
        const whereClause = conditions.length > 0 
          ? `WHERE ${conditions.join(' AND ')}`
          : '';
          
        // Build the query
        const query = `
          MATCH (p:Project)
          ${whereClause}
          RETURN p.id as id,
                p.name as name,
                p.description as description,
                p.status as status,
                p.urls as urls,
                p.completionRequirements as completionRequirements,
                p.outputFormat as outputFormat,
                p.taskType as taskType,
                p.createdAt as createdAt,
                p.updatedAt as updatedAt
          ORDER BY p.createdAt DESC
        `;
        
        const result = await session.executeRead(async (tx: any) => {
          const result = await tx.run(query, params);
          return result.records;
        });
        
        // Process records into projects
        const projects = result.map((record: any) => {
          // Extract all fields directly
          const project = {
            id: record.get('id'),
            name: record.get('name'),
            description: record.get('description'),
            status: record.get('status'),
            urls: [],
            completionRequirements: record.get('completionRequirements'),
            outputFormat: record.get('outputFormat'),
            taskType: record.get('taskType'),
            createdAt: record.get('createdAt'),
            updatedAt: record.get('updatedAt')
          };
          
          // Handle JSON parsing for URLs
          const rawUrls = record.get('urls');
          if (rawUrls && typeof rawUrls === 'string') {
            try {
              project.urls = JSON.parse(rawUrls);
            } catch (e) {
              logger.error("Error parsing URLs JSON", { error: e, rawUrls });
              project.urls = [];
            }
          }
          
          return project;
        });
        
        // Apply pagination
        const page = filters.page || 1;
        const limit = filters.limit || 20;
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedProjects = projects.slice(startIndex, endIndex);
        
        // Create pagination metadata
        const pagination = {
          total: projects.length,
          page,
          limit,
          totalPages: Math.ceil(projects.length / limit)
        };
        
        logger.info(`Found ${projects.length} projects, returning page ${page} with ${paginatedProjects.length} items`);
        
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({
                projects: paginatedProjects,
                pagination
              }, null, 2)
            }
          ]
        };
      } finally {
        await session.close();
      }
    } catch (error) {
      logger.error("Error listing projects", { 
        error,
        uri: uri.href
      });

      throw new McpError(
        BaseErrorCode.INTERNAL_ERROR,
        `Failed to list projects: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  // Get project by ID
  server.resource(
    "project-by-id", 
    ResourceTemplates.PROJECT, 
    {
      name: "Project by ID",
      description: "Retrieves a single project by its unique identifier",
      mimeType: "application/json"
    },
    async (uri, params) => {
    try {
      const projectId = params.projectId as string;
      
      logger.info("Fetching project by ID", { 
        projectId,
        uri: uri.href
      });

      if (!projectId) {
        throw new McpError(
          BaseErrorCode.VALIDATION_ERROR,
          "Project ID is required"
        );
      }

      // Query the database directly for better control over field extraction
      const session = await neo4jDriver.getSession();
      
      try {
        const query = `
          MATCH (p:Project {id: $id})
          RETURN p.id as id,
                p.name as name,
                p.description as description,
                p.status as status,
                p.urls as urls,
                p.completionRequirements as completionRequirements,
                p.outputFormat as outputFormat,
                p.taskType as taskType,
                p.createdAt as createdAt,
                p.updatedAt as updatedAt
        `;
        
        const result = await session.executeRead(async (tx: any) => {
          const result = await tx.run(query, { id: projectId });
          return result.records;
        });
        
        if (!result || result.length === 0) {
          throw new McpError(
            ProjectErrorCode.PROJECT_NOT_FOUND,
            `Project with ID ${projectId} not found`,
            { projectId }
          );
        }
        
        const record = result[0];
        
        // Extract all fields directly
        const project = {
          id: record.get('id'),
          name: record.get('name'),
          description: record.get('description'),
          status: record.get('status'),
          urls: [],
          completionRequirements: record.get('completionRequirements'),
          outputFormat: record.get('outputFormat'),
          taskType: record.get('taskType'),
          createdAt: record.get('createdAt'),
          updatedAt: record.get('updatedAt')
        };
        
        // Handle JSON parsing for URLs
        const rawUrls = record.get('urls');
        if (rawUrls && typeof rawUrls === 'string') {
          try {
            project.urls = JSON.parse(rawUrls);
          } catch (e) {
            logger.error("Error parsing URLs JSON", { error: e, rawUrls });
            project.urls = [];
          }
        }
        
        logger.info("Project data from database:", { 
          project: JSON.stringify(project, null, 2) 
        });
        
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(project, null, 2)
            }
          ]
        };
      } finally {
        await session.close();
      }
    } catch (error) {
      // Handle specific error cases
      if (error instanceof McpError) {
        throw error;
      }

      logger.error("Error fetching project by ID", { 
        error,
        params
      });

      throw new McpError(
        BaseErrorCode.INTERNAL_ERROR,
        `Failed to fetch project: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });
}
