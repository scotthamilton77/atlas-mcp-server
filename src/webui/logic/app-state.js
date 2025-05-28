/**
 * @fileoverview Manages global application state and provides utility functions.
 * @module src/webui/logic/app-state
 */

/**
 * Global application state.
 * @type {object}
 * @property {object|null} driver - Neo4j driver instance. Initialized by api-service.
 * @property {string|null} currentProjectId - ID of the currently selected project.
 * @property {object|null} currentProject - Details of the currently selected project.
 * @property {Array<object>} currentTasks - List of tasks for the current project.
 * @property {Array<object>} currentKnowledgeItems - List of knowledge items for the current project.
 * @property {string} tasksViewMode - Current view mode for tasks ('detailed' or 'compact').
 * @property {string} knowledgeViewMode - Current view mode for knowledge items ('detailed' or 'compact').
 * @property {boolean} showingTaskFlow - Flag indicating if the task flow diagram is visible.
 */
export const state = {
  driver: null,
  currentProjectId: null,
  currentProject: null,
  currentTasks: [],
  currentKnowledgeItems: [],
  tasksViewMode: "detailed", // 'detailed' or 'compact'
  knowledgeViewMode: "detailed", // 'detailed' or 'compact'
  showingTaskFlow: false,
};

/**
 * Utility functions for common tasks.
 * @type {object}
 */
export const utils = {
  /**
   * Escapes HTML special characters in a string.
   * @param {string|null|undefined} unsafe - The string to escape.
   * @returns {string} The escaped string, or "N/A" if input is null/undefined.
   */
  escapeHtml: (unsafe) => {
    if (unsafe === null || typeof unsafe === "undefined") return "N/A";
    return String(unsafe).replace(/[&<>"']/g, (match) => {
      switch (match) {
        case "&":
          return "&";
        case "<":
          return "<";
        case ">":
          return ">";
        case '"':
          return "&quot;";
        case "'":
          return "&#039;";
        default:
          return match;
      }
    });
  },

  /**
   * Safely parses a JSON string.
   * @param {string|Array<any>} jsonString - The JSON string or an already parsed array.
   * @param {Array<any>} [defaultValue=[]] - The default value to return on parsing failure.
   * @returns {Array<any>} The parsed array or the default value.
   */
  parseJsonSafe: (jsonString, defaultValue = []) => {
    if (typeof jsonString !== "string") {
      return Array.isArray(jsonString) ? jsonString : defaultValue;
    }
    try {
      const parsed = JSON.parse(jsonString);
      return Array.isArray(parsed) ? parsed : defaultValue;
    } catch (e) {
      console.warn("Failed to parse JSON string:", jsonString, e);
      return defaultValue;
    }
  },

  /**
   * Formats a date string into a locale-specific string.
   * @param {string|null|undefined} dateString - The date string to format.
   * @returns {string} The formatted date string, "N/A", or "Invalid Date".
   */
  formatDate: (dateString) => {
    if (!dateString) return "N/A";
    try {
      return new Date(dateString).toLocaleString();
    } catch (e) {
      return "Invalid Date";
    }
  },
};
