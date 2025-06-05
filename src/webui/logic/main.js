/**
 * @fileoverview Main application entry point. Initializes the app and sets up event handlers.
 * @module src/webui/logic/main
 */

import { dom } from "./dom-elements.js";
import { state } from "./app-state.js"; // utils is also exported from app-state but not directly used here
import { uiHelpers, renderHelpers } from "./ui-service.js";
import { api } from "./api-service.js";

/**
 * Manages application event handling.
 * @type {object}
 */
const eventHandlers = {
  /**
   * Handles changes to the project selection dropdown.
   * @param {Event} event - The change event.
   */
  handleProjectSelectChange: (event) => {
    if (event.target && event.target.value) {
      const projectId = event.target.value;
      api.fetchProjectDetails(projectId);
      localStorage.setItem("lastSelectedProjectId", projectId);
    }
  },

  /**
   * Handles clicks on the refresh button.
   */
  handleRefreshClick: () => {
    api.fetchProjects();
  },

  /**
   * Handles changes to the theme toggle checkbox.
   */
  handleThemeToggleChange: () => {
    uiHelpers.toggleTheme();
  },

  /**
   * Handles clicks on the task view mode toggle button.
   */
  handleTaskViewModeToggle: () => {
    state.tasksViewMode =
      state.tasksViewMode === "detailed" ? "compact" : "detailed";
    uiHelpers.updateToggleButton(
      dom.taskViewModeToggle,
      state.tasksViewMode === "compact",
      "Detailed View",
      "Compact View",
    );
    if (dom.tasksContent) {
      // Ensure element exists
      renderHelpers.tasks(
        state.currentTasks,
        dom.tasksContent,
        state.tasksViewMode,
      );
    }
  },

  /**
   * Handles clicks on the knowledge view mode toggle button.
   */
  handleKnowledgeViewModeToggle: () => {
    state.knowledgeViewMode =
      state.knowledgeViewMode === "detailed" ? "compact" : "detailed";
    uiHelpers.updateToggleButton(
      dom.knowledgeViewModeToggle,
      state.knowledgeViewMode === "compact",
      "Detailed View",
      "Compact View",
    );
    if (dom.knowledgeContent) {
      // Ensure element exists
      renderHelpers.knowledgeItems(
        state.currentKnowledgeItems,
        dom.knowledgeContent,
        state.knowledgeViewMode,
      );
    }
  },

  /**
   * Handles clicks on the task flow toggle button.
   */
  handleTaskFlowToggle: () => {
    state.showingTaskFlow = !state.showingTaskFlow;
    uiHelpers.setDisplay(dom.tasksContent, !state.showingTaskFlow);
    uiHelpers.setDisplay(dom.taskFlowContainer, state.showingTaskFlow);
    uiHelpers.updateToggleButton(
      dom.taskFlowToggle,
      state.showingTaskFlow,
      "View Task List",
      "View Task Flow",
    );
    if (state.showingTaskFlow && dom.taskFlowContainer) {
      // Ensure element exists
      renderHelpers.taskFlow(state.currentTasks, dom.taskFlowContainer);
    }
  },

  /**
   * Sets up all event listeners for the application.
   */
  setup: () => {
    // Ensure DOM elements exist before adding listeners
    if (dom.projectSelect) {
      dom.projectSelect.addEventListener(
        "change",
        eventHandlers.handleProjectSelectChange,
      );
    }
    if (dom.refreshButton) {
      dom.refreshButton.addEventListener(
        "click",
        eventHandlers.handleRefreshClick,
      );
    }
    if (dom.themeCheckbox) {
      dom.themeCheckbox.addEventListener(
        "change",
        eventHandlers.handleThemeToggleChange,
      );
    }
    if (dom.themeLabel) {
      // Allow clicking label to toggle checkbox
      dom.themeLabel.addEventListener("click", () => {
        if (dom.themeCheckbox) dom.themeCheckbox.click();
      });
    }
    if (dom.taskViewModeToggle) {
      dom.taskViewModeToggle.addEventListener(
        "click",
        eventHandlers.handleTaskViewModeToggle,
      );
    }
    if (dom.knowledgeViewModeToggle) {
      dom.knowledgeViewModeToggle.addEventListener(
        "click",
        eventHandlers.handleKnowledgeViewModeToggle,
      );
    }
    if (dom.taskFlowToggle) {
      dom.taskFlowToggle.addEventListener(
        "click",
        eventHandlers.handleTaskFlowToggle,
      );
    }
  },
};

/**
 * Waits for the Neo4j global driver to be available.
 * @param {number} [timeout=5000] - Maximum time to wait in milliseconds.
 * @returns {Promise<void>} Resolves when neo4j is available, or rejects on timeout.
 * @private
 */
async function waitForNeo4j(timeout = 5000) {
  const startTime = Date.now();
  while (typeof neo4j === "undefined") {
    if (Date.now() - startTime > timeout) {
      console.error("Neo4j driver failed to load within timeout.");
      throw new Error("Neo4j driver failed to load within timeout.");
    }
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait 100ms
  }
  console.log("Neo4j driver detected.");
}

/**
 * Initializes the application.
 * Loads theme, sets up event handlers, connects to Neo4j, and fetches initial data.
 * @async
 */
async function initApp() {
  uiHelpers.loadTheme(); // Apply saved theme and initialize Mermaid
  eventHandlers.setup(); // Setup event listeners

  // Initialize toggle button texts, ensuring buttons exist
  uiHelpers.updateToggleButton(
    dom.taskViewModeToggle,
    state.tasksViewMode === "compact",
    "Detailed View",
    "Compact View",
  );
  uiHelpers.updateToggleButton(
    dom.knowledgeViewModeToggle,
    state.knowledgeViewMode === "compact",
    "Detailed View",
    "Compact View",
  );
  uiHelpers.updateToggleButton(
    dom.taskFlowToggle,
    state.showingTaskFlow,
    "View Task List",
    "View Task Flow",
  );

  try {
    await waitForNeo4j(); // Wait for the driver to be loaded
    const connected = await api.connect();
    if (connected) {
      api.fetchProjects();
    }
  } catch (error) {
    console.error("Initialization error:", error);
    // Ensure uiHelpers is available and dom.errorMessageDiv is checked within showError
    uiHelpers.showError(
      `App Initialization Error: ${error.message}. Check console.`,
      true,
    );
  }
}

// Start the application once the DOM is fully loaded
document.addEventListener("DOMContentLoaded", initApp);
