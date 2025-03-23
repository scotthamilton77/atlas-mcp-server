import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Neo4jKnowledge, Neo4jProject, Neo4jTask } from "../../services/neo4j/types.js";

/**
 * Resource URIs for the Atlas MCP resources
 */
export const ResourceURIs = {
  // Project resources
  PROJECTS: "atlas://projects",
  PROJECT_TEMPLATE: "atlas://projects/{projectId}",
  
  // Task resources
  TASKS: "atlas://tasks",
  TASKS_BY_PROJECT: "atlas://projects/{projectId}/tasks",
  TASK_TEMPLATE: "atlas://tasks/{taskId}",
  
  // Knowledge resources
  KNOWLEDGE: "atlas://knowledge",
  KNOWLEDGE_BY_PROJECT: "atlas://projects/{projectId}/knowledge",
  KNOWLEDGE_TEMPLATE: "atlas://knowledge/{knowledgeId}"
};

/**
 * Resource templates for the Atlas MCP resources
 */
export const ResourceTemplates = {
  // Project resource templates
  PROJECT: new ResourceTemplate(
    ResourceURIs.PROJECT_TEMPLATE, 
    { 
      list: () => ({
        resources: [
          { 
            uri: ResourceURIs.PROJECTS, 
            name: "All Projects",
            description: "List of all projects in the Atlas platform"
          }
        ]
      })
    }
  ),
  
  // Task resource templates
  TASK: new ResourceTemplate(
    ResourceURIs.TASK_TEMPLATE,
    { 
      list: () => ({
        resources: [
          { 
            uri: ResourceURIs.TASKS, 
            name: "All Tasks",
            description: "List of all tasks in the Atlas platform"
          }
        ]
      })
    }
  ),
  TASKS_BY_PROJECT: new ResourceTemplate(
    ResourceURIs.TASKS_BY_PROJECT,
    {
      list: undefined
    }
  ),
  
  // Knowledge resource templates
  KNOWLEDGE: new ResourceTemplate(
    ResourceURIs.KNOWLEDGE_TEMPLATE,
    { 
      list: () => ({
        resources: [
          { 
            uri: ResourceURIs.KNOWLEDGE, 
            name: "All Knowledge",
            description: "List of all knowledge items in the Atlas platform"
          }
        ]
      })
    }
  ),
  KNOWLEDGE_BY_PROJECT: new ResourceTemplate(
    ResourceURIs.KNOWLEDGE_BY_PROJECT,
    {
      list: undefined
    }
  )
};

/**
 * Project resource response interface
 */
export interface ProjectResource {
  id: string;
  name: string;
  description: string;
  status: string;
  urls: Array<{ title: string; url: string }>;
  completionRequirements: string;
  outputFormat: string;
  taskType: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Task resource response interface
 */
export interface TaskResource {
  id: string;
  projectId: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  assignedTo: string | null;
  urls: Array<{ title: string; url: string }>;
  tags: string[];
  completionRequirements: string;
  outputFormat: string;
  taskType: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Knowledge resource response interface
 */
export interface KnowledgeResource {
  id: string;
  projectId: string;
  text: string;
  tags: string[];
  domain: string;
  citations: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Convert Neo4j Project to Project Resource
 */
export function toProjectResource(project: Neo4jProject): ProjectResource {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    status: project.status,
    urls: project.urls || [],
    completionRequirements: project.completionRequirements,
    outputFormat: project.outputFormat,
    taskType: project.taskType,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  };
}

/**
 * Convert Neo4j Task to Task Resource
 */
export function toTaskResource(task: Neo4jTask): TaskResource {
  return {
    id: task.id,
    projectId: task.projectId,
    title: task.title,
    description: task.description,
    priority: task.priority,
    status: task.status,
    assignedTo: task.assignedTo || null,
    urls: task.urls || [],
    tags: task.tags || [],
    completionRequirements: task.completionRequirements,
    outputFormat: task.outputFormat,
    taskType: task.taskType,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt
  };
}

/**
 * Convert Neo4j Knowledge to Knowledge Resource
 */
export function toKnowledgeResource(knowledge: Neo4jKnowledge): KnowledgeResource {
  return {
    id: knowledge.id,
    projectId: knowledge.projectId,
    text: knowledge.text,
    tags: knowledge.tags || [],
    domain: knowledge.domain,
    citations: knowledge.citations || [],
    createdAt: knowledge.createdAt,
    updatedAt: knowledge.updatedAt
  };
}
