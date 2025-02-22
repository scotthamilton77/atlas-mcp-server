import { PaginatedProjects } from '../neo4j/projectService.js';

/**
 * Helper function to extract project IDs from paginated projects result
 */
export const extractProjectIds = (result: PaginatedProjects): string[] => {
  return result.items.map(p => p.id);
};