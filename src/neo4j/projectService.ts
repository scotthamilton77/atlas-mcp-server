// Re-export types
export type {
  Project,
  ProjectNote,
  ProjectLink,
  ProjectDependency,
  DependencyDetails,
  ProjectMember,
  ListProjectsOptions,
  PaginatedProjects
} from "./projectService/types.js";

// Re-export core project operations
export {
  createProject,
  createProjectsBulk,
  getProjectById,
  updateProject,
  updateProjectsBulk,
  deleteProject,
  deleteProjectsBulk,
  listProjects
} from "./projectService/projectCore.js";

// Re-export content management operations
export {
  addProjectNote,
  addProjectNotesBulk,
  getProjectNotes,
  addProjectLink,
  addProjectLinksBulk,
  updateProjectLink,
  updateProjectLinksBulk,
  deleteProjectLink,
  deleteProjectLinksBulk,
  getProjectLinks
} from "./projectService/projectContent.js";

// Re-export relationship management operations
export {
  getDependencyDetails,
  addDependency,
  addDependenciesBulk,
  removeDependency,
  removeDependenciesBulk,
  listProjectDependencies,
  addProjectMember,
  addProjectMembersBulk,
  removeProjectMember,
  removeProjectMembersBulk,
  listProjectMembers
} from "./projectService/projectRelations.js";

// Note: This file now serves as the main entry point for the project service,
// re-exporting functionality from modular files while maintaining the same public API.
// This approach allows for better code organization and maintainability while
// ensuring backward compatibility with existing code that imports from this file.