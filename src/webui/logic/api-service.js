/**
 * @fileoverview Manages all interactions with the Neo4j backend.
 * @module src/webui/logic/api-service
 */

import { config } from './config.js';
import { dom } from './dom-elements.js'; // Though not directly used, good for consistency if needed later
import { state, utils } from './app-state.js';
import { uiHelpers } from './ui-service.js';
import { renderHelpers } from './ui-service.js'; // For rendering after fetching

/**
 * Neo4j API interaction service.
 * @type {object}
 */
export const api = {
  /**
   * Connects to the Neo4j database and verifies connectivity.
   * Initializes `state.driver`.
   * @returns {Promise<boolean>} True if connection is successful, false otherwise.
   */
  connect: async () => {
    uiHelpers.clearError();
    uiHelpers.updateNeo4jStatus("Connecting...", "var(--warning-color)");
    try {
      if (typeof neo4j === "undefined") {
        throw new Error(
          "Neo4j driver not loaded. Check CDN link in index.html.",
        );
      }
      state.driver = neo4j.driver(
        config.NEO4J_URI,
        neo4j.auth.basic(config.NEO4J_USER, config.NEO4J_PASSWORD),
      );
      await state.driver.verifyConnectivity();
      uiHelpers.updateNeo4jStatus("Connected", "var(--success-color)");
      console.log("Successfully connected to Neo4j.");
      return true;
    } catch (error) {
      console.error("Neo4j Connection Error:", error);
      uiHelpers.showError(
        `Neo4j Connection Error: ${error.message}. Check console and credentials.`,
        true,
      );
      if (dom.projectSelect) {
        dom.projectSelect.innerHTML =
          '<option value="">Neo4j Connection Error</option>';
      }
      return false;
    }
  },

  /**
   * Runs a Cypher query against the Neo4j database.
   * @param {string} query - The Cypher query to execute.
   * @param {object} [params={}] - Parameters for the query.
   * @returns {Promise<Array<object>>} A promise that resolves to an array of records.
   * @throws {Error} If not connected to Neo4j or if query fails.
   */
  runQuery: async (query, params = {}) => {
    if (!state.driver) {
      uiHelpers.showError("Not connected to Neo4j.", true);
      throw new Error("Not connected to Neo4j.");
    }
    const session = state.driver.session();
    try {
      const result = await session.run(query, params);
      return result.records.map((record) => {
        const obj = {};
        record.keys.forEach((key) => {
          const value = record.get(key);
          if (neo4j.isInt(value)) {
            obj[key] = value.toNumber();
          } else if (value && typeof value === "object" && value.properties) {
            // Node
            const nodeProps = {};
            Object.keys(value.properties).forEach((propKey) => {
              const propValue = value.properties[propKey];
              nodeProps[propKey] = neo4j.isInt(propValue)
                ? propValue.toNumber()
                : propValue;
            });
            obj[key] = nodeProps;
          } else if (
            Array.isArray(value) &&
            value.every(
              (item) => item && typeof item === "object" && item.properties,
            )
          ) {
            // Array of Nodes
            obj[key] = value.map((item) => {
              const nodeProps = {};
              Object.keys(item.properties).forEach((propKey) => {
                const propValue = item.properties[propKey];
                nodeProps[propKey] = neo4j.isInt(propValue)
                  ? propValue.toNumber()
                  : propValue;
              });
              return nodeProps;
            });
          } else {
            obj[key] = value;
          }
        });
        return obj;
      });
    } finally {
      await session.close();
    }
  },

  /**
   * Fetches all projects and populates the project selection dropdown.
   */
  fetchProjects: async () => {
    if (dom.projectSelect) uiHelpers.showLoading(dom.projectSelect, "Loading projects...");
    uiHelpers.setDisplay(dom.projectDetailsContainer, false);
    uiHelpers.setDisplay(dom.tasksContainer, false);
    uiHelpers.setDisplay(dom.knowledgeContainer, false);
    uiHelpers.clearError();

    if (!state.driver) {
      const connected = await api.connect();
      if (!connected) return;
    }

    try {
      const projectsData = await api.runQuery(
        "MATCH (p:Project) RETURN p.id as id, p.name as name ORDER BY p.name",
      );
      if (dom.projectSelect) {
        dom.projectSelect.innerHTML =
          '<option value="">-- Select a Project --</option>';
        let autoSelectedProjectId = null;
        if (projectsData && projectsData.length > 0) {
          projectsData.forEach((project) => {
            const option = document.createElement("option");
            option.value = project.id;
            option.textContent = utils.escapeHtml(project.name);
            dom.projectSelect.appendChild(option);
          });

          const lastSelectedProjectId = localStorage.getItem('lastSelectedProjectId');
          const projectIds = projectsData.map(p => p.id);

          if (lastSelectedProjectId && projectIds.includes(lastSelectedProjectId)) {
            dom.projectSelect.value = lastSelectedProjectId;
            autoSelectedProjectId = lastSelectedProjectId;
          } else if (projectIds.length > 0) {
            dom.projectSelect.value = projectIds[0];
            autoSelectedProjectId = projectIds[0];
          }
        } else {
          dom.projectSelect.innerHTML =
            '<option value="">No projects found</option>';
        }
        
        if (autoSelectedProjectId) {
          // Automatically fetch details for the selected project
          api.fetchProjectDetails(autoSelectedProjectId);
        }
      }
    } catch (error) {
      console.error("Failed to fetch projects:", error);
      if (dom.projectSelect) {
        dom.projectSelect.innerHTML =
          '<option value="">Error loading projects</option>';
      }
      uiHelpers.showError(`Error loading projects: ${error.message}`);
    }
  },

  /**
   * Fetches details for a specific project, including its tasks and knowledge items.
   * Updates the application state and renders the fetched data.
   * @param {string} projectId - The ID of the project to fetch.
   */
  fetchProjectDetails: async (projectId) => {
    state.currentProjectId = projectId;
    if (!projectId) {
      uiHelpers.setDisplay(dom.projectDetailsContainer, false);
      uiHelpers.setDisplay(dom.tasksContainer, false);
      uiHelpers.setDisplay(dom.knowledgeContainer, false);
      return;
    }

    if (dom.detailsContent) uiHelpers.showLoading(dom.detailsContent, "Loading project details...");
    if (dom.tasksContent) uiHelpers.showLoading(dom.tasksContent, "Loading tasks...");
    if (dom.knowledgeContent) uiHelpers.showLoading(dom.knowledgeContent, "Loading knowledge items...");
    uiHelpers.setDisplay(dom.projectDetailsContainer, true);
    uiHelpers.setDisplay(dom.tasksContainer, true);
    uiHelpers.setDisplay(dom.knowledgeContainer, true);

    state.showingTaskFlow = false;
    uiHelpers.setDisplay(dom.taskFlowContainer, false);
    uiHelpers.updateToggleButton(
      dom.taskFlowToggle,
      false,
      "View Task List",
      "View Task Flow",
    );
    uiHelpers.clearError();

    try {
      const projectResult = await api.runQuery(
        "MATCH (p:Project {id: $projectId}) RETURN p",
        { projectId },
      );
      state.currentProject =
        projectResult.length > 0 ? projectResult[0].p : null;
      if (dom.detailsContent) renderHelpers.projectDetails(state.currentProject, dom.detailsContent);

      const tasksQuery = `
                  MATCH (proj:Project {id: $projectId})-[:CONTAINS_TASK]->(task:Task)
                  OPTIONAL MATCH (task)-[:DEPENDS_ON]->(dependency:Task)
                  RETURN task, collect(dependency.id) as dependencyIds
                  ORDER BY task.title
              `;
      const tasksResult = await api.runQuery(tasksQuery, {
        projectId,
      });
      state.currentTasks = tasksResult.map((r) => ({
        ...r.task,
        dependencyIds: r.dependencyIds || [],
      }));
      if (dom.tasksContent) renderHelpers.tasks(
        state.currentTasks,
        dom.tasksContent,
        state.tasksViewMode,
      );

      const knowledgeResult = await api.runQuery(
        "MATCH (p:Project {id: $projectId})-[:CONTAINS_KNOWLEDGE]->(k:Knowledge) RETURN k ORDER BY k.createdAt DESC",
        { projectId },
      );
      state.currentKnowledgeItems = knowledgeResult.map((r) => r.k);
      if (dom.knowledgeContent) renderHelpers.knowledgeItems(
        state.currentKnowledgeItems,
        dom.knowledgeContent,
        state.knowledgeViewMode,
      );
    } catch (error) {
      console.error(
        `Failed to fetch details for project ${projectId}:`,
        error,
      );
      uiHelpers.showError(`Error loading project data: ${error.message}`);
      if (dom.detailsContent) dom.detailsContent.innerHTML = `<p class="error">Error loading project details.</p>`;
      if (dom.tasksContent) dom.tasksContent.innerHTML = `<p class="error">Error loading tasks.</p>`;
      if (dom.knowledgeContent) dom.knowledgeContent.innerHTML = `<p class="error">Error loading knowledge items.</p>`;
    }
  },
};
