/**
 * @fileoverview Handles UI logic, theme management, and dynamic content rendering.
 * @module src/webui/logic/ui-service
 */

import { config } from './config.js';
import { dom } from './dom-elements.js';
import { utils, state } from './app-state.js';

/**
 * Manages UI interactions and visual states.
 * @type {object}
 */
export const uiHelpers = {
  /**
   * Applies the specified theme to the document.
   * @param {string} theme - The theme to apply ('light' or 'dark').
   */
  applyTheme: (theme) => {
    document.documentElement.classList.toggle("dark-mode", theme === "dark");
    if (dom.themeCheckbox) { // Ensure element exists
        dom.themeCheckbox.checked = theme === "dark";
    }
    if (typeof mermaid !== "undefined") {
      try {
        mermaid.initialize({
          startOnLoad: false,
          theme:
            theme === "dark"
              ? config.MERMAID_THEME_DARK
              : config.MERMAID_THEME_LIGHT,
          gantt: { axisFormatter: [["%Y-%m-%d", (d) => d.getDay() === 1]] }, // Original gantt config
          flowchart: { htmlLabels: true }, // Original flowchart config
        });
      } catch (e) {
        console.error("Mermaid initialization error during theme apply:", e);
        // Potentially show a non-critical error to the user if Mermaid fails to init
      }
    }
  },

  /**
   * Toggles the current theme between light and dark.
   * Saves the new theme to localStorage.
   * Re-renders task flow if it's visible.
   */
  toggleTheme: () => {
    const currentThemeIsDark =
      document.documentElement.classList.contains("dark-mode");
    const newTheme = currentThemeIsDark ? "light" : "dark";
    uiHelpers.applyTheme(newTheme);
    localStorage.setItem("atlasTheme", newTheme);
    if (state.showingTaskFlow && dom.taskFlowContainer) { // Check if taskFlowContainer exists
      renderHelpers.taskFlow(state.currentTasks, dom.taskFlowContainer);
    }
  },

  /**
   * Loads the theme from localStorage or defaults.
   */
  loadTheme: () => {
    const savedTheme =
      localStorage.getItem("atlasTheme") || config.DEFAULT_THEME;
    uiHelpers.applyTheme(savedTheme);
  },

  /**
   * Sets the display style of an element (show/hide).
   * @param {HTMLElement} element - The DOM element.
   * @param {boolean} show - True to show, false to hide.
   */
  setDisplay: (element, show) => {
    if (!element) return;
    element.classList.toggle("hidden", !show);
  },

  /**
   * Shows a loading message in the specified element.
   * @param {HTMLElement} element - The DOM element to display loading message in.
   * @param {string} [message="Loading..."] - The loading message.
   */
  showLoading: (element, message = "Loading...") => {
    if (!element) return;
    element.innerHTML = `<p class="loading">${utils.escapeHtml(message)}</p>`;
  },

  /**
   * Displays an error message.
   * @param {string} message - The error message to display.
   * @param {boolean} [isCritical=false] - If true, updates Neo4j status to error.
   */
  showError: (message, isCritical = false) => {
    if (dom.errorMessageDiv) { // Ensure element exists
        dom.errorMessageDiv.textContent = message;
        uiHelpers.setDisplay(dom.errorMessageDiv, true);
    }
    if (isCritical) {
      uiHelpers.updateNeo4jStatus("Error", "var(--error-color)");
    }
  },

  /**
   * Clears any displayed error message.
   */
  clearError: () => {
    if (dom.errorMessageDiv) { // Ensure element exists
        dom.errorMessageDiv.textContent = "";
        uiHelpers.setDisplay(dom.errorMessageDiv, false);
    }
  },

  /**
   * Updates the Neo4j connection status display.
   * @param {string} text - The status text.
   * @param {string} color - The CSS color for the status text.
   */
  updateNeo4jStatus: (text, color) => {
    if (dom.neo4jStatusSpan) { // Ensure element exists
        dom.neo4jStatusSpan.textContent = text;
        dom.neo4jStatusSpan.style.color = color;
    }
  },

  /**
   * Updates the text and ARIA state of a toggle button.
   * @param {HTMLButtonElement} button - The button element.
   * @param {boolean} isActive - Whether the button's active state is true.
   * @param {string} activeText - Text to display when active.
   * @param {string} inactiveText - Text to display when inactive.
   */
  updateToggleButton: (button, isActive, activeText, inactiveText) => {
    if (!button) return;
    button.textContent = isActive ? activeText : inactiveText;
    button.setAttribute("aria-pressed", String(isActive));
  },
};

/**
 * Handles rendering of dynamic content.
 * @type {object}
 */
export const renderHelpers = {
  /**
   * Renders project details into the specified element.
   * @param {object|null} project - The project object.
   * @param {HTMLElement} element - The DOM element to render into.
   */
  projectDetails: (project, element) => {
    if (!element) return;
    if (!project) {
      element.innerHTML = "<p>Project not found or no data.</p>";
      return;
    }
    const urlsToRender = utils.parseJsonSafe(project.urls);
    const urlsHtml =
      urlsToRender.length > 0
        ? `<ul>${urlsToRender.map((url) => (url && url.url && url.title ? `<li><a href="${utils.escapeHtml(url.url)}" target="_blank" rel="noopener noreferrer">${utils.escapeHtml(url.title)}</a></li>` : "<li>Invalid URL entry</li>")).join("")}</ul>`
        : "N/A";

    let dependenciesText = "N/A";
    if (
      project.dependencies &&
      Array.isArray(project.dependencies) &&
      project.dependencies.length > 0
    ) {
      dependenciesText = project.dependencies
        .map((dep) => utils.escapeHtml(dep))
        .join(", ");
    } else if (
      typeof project.dependencies === "string" &&
      project.dependencies.trim() !== ""
    ) {
      dependenciesText = utils.escapeHtml(project.dependencies);
    }

    element.innerHTML = `
              <div class="data-item"><strong>ID:</strong> <div>${utils.escapeHtml(project.id)}</div></div>
              <div class="data-item"><strong>Name:</strong> <div>${utils.escapeHtml(project.name)}</div></div>
              <div class="data-item"><strong>Description:</strong> <pre>${utils.escapeHtml(project.description)}</pre></div>
              <div class="data-item"><strong>Status:</strong> <div>${utils.escapeHtml(project.status)}</div></div>
              <div class="data-item"><strong>Task Type:</strong> <div>${utils.escapeHtml(project.taskType)}</div></div>
              <div class="data-item"><strong>Completion Requirements:</strong> <pre>${utils.escapeHtml(project.completionRequirements)}</pre></div>
              <div class="data-item"><strong>Output Format:</strong> <pre>${utils.escapeHtml(project.outputFormat)}</pre></div>
              <div class="data-item"><strong>URLs:</strong> ${urlsHtml}</div>
              <div class="data-item"><strong>Dependencies:</strong> <div>${dependenciesText}</div></div>
              <div class="data-item"><strong>Created At:</strong> <div>${utils.formatDate(project.createdAt)}</div></div>
              <div class="data-item"><strong>Updated At:</strong> <div>${utils.formatDate(project.updatedAt)}</div></div>
          `;
  },

  /**
   * Renders tasks into the specified element.
   * @param {Array<object>} tasks - Array of task objects.
   * @param {HTMLElement} element - The DOM element to render into.
   * @param {string} viewMode - 'detailed' or 'compact'.
   */
  tasks: (tasks, element, viewMode) => {
    if (!element) return;
    if (!tasks || tasks.length === 0) {
      element.innerHTML = "<p>No tasks for this project.</p>";
      return;
    }
    element.innerHTML = tasks
      .map((task) => {
        if (!task || typeof task !== "object") {
          console.error("Invalid task object encountered:", task);
          return `<div class="data-item error">Error rendering an invalid task object.</div>`;
        }
        if (viewMode === "compact") {
          return `
                      <div class="data-item compact">
                          <strong>${utils.escapeHtml(task.title)} (ID: ${utils.escapeHtml(task.id)})</strong>
                          <span class="item-status">${utils.escapeHtml(task.status)}</span>
                      </div>`;
        }
        // Detailed view
        try {
          const taskUrlsToRender = utils.parseJsonSafe(task.urls);
          const urlsHtml =
            taskUrlsToRender.length > 0
              ? `URLs: ${taskUrlsToRender.map((u) => (u && u.url && u.title ? `<a href="${utils.escapeHtml(u.url)}" target="_blank" rel="noopener noreferrer">${utils.escapeHtml(u.title)}</a>` : "Invalid URL entry")).join(", ")}<br>`
              : "";

          const tagsHtml =
            task.tags && Array.isArray(task.tags) && task.tags.length > 0
              ? `Tags: ${task.tags.map((t) => utils.escapeHtml(t)).join(", ")}<br>`
              : "";

          return `
                      <div class="data-item">
                          <strong>${utils.escapeHtml(task.title)} (ID: ${utils.escapeHtml(task.id)})</strong>
                          <div>Status: ${utils.escapeHtml(task.status)} - Priority: ${utils.escapeHtml(task.priority)}</div>
                          <div>Description: <pre>${utils.escapeHtml(task.description)}</pre></div>
                          <div>Type: ${utils.escapeHtml(task.taskType)}</div>
                          <div>Completion: <pre>${utils.escapeHtml(task.completionRequirements)}</pre></div>
                          <div>Output: <pre>${utils.escapeHtml(task.outputFormat)}</pre></div>
                          ${task.assignedTo ? `<div>Assigned To: ${utils.escapeHtml(task.assignedTo)}</div>` : ""}
                          ${tagsHtml ? `<div>${tagsHtml}</div>` : ""}
                          ${urlsHtml ? `<div>${urlsHtml}</div>` : ""}
                          <div>Created: ${utils.formatDate(task.createdAt)} | Updated: ${utils.formatDate(task.updatedAt)}</div>
                      </div>`;
        } catch (renderError) {
          console.error(
            `Error rendering task ${task.id || "unknown"}:`,
            renderError,
            task,
          );
          return `<div class="data-item error">Error rendering task ID ${utils.escapeHtml(task.id || "unknown")}.</div>`;
        }
      })
      .join("");
  },

  /**
   * Renders knowledge items into the specified element.
   * @param {Array<object>} items - Array of knowledge item objects.
   * @param {HTMLElement} element - The DOM element to render into.
   * @param {string} viewMode - 'detailed' or 'compact'.
   */
  knowledgeItems: (items, element, viewMode) => {
    if (!element) return;
    if (!items || items.length === 0) {
      element.innerHTML = "<p>No knowledge items for this project.</p>";
      return;
    }
    element.innerHTML = items
      .map((item) => {
        if (!item || typeof item !== "object") {
          console.error("Invalid knowledge object encountered:", item);
          return `<div class="data-item error">Error rendering an invalid knowledge object.</div>`;
        }
        if (viewMode === "compact") {
          return `
                      <div class="data-item compact">
                          <strong>Knowledge ID: ${utils.escapeHtml(item.id)}</strong>
                          <span class="item-status">${utils.escapeHtml(item.domain || "N/A")}</span>
                      </div>`;
        }
        // Detailed view
        try {
          const tagsHtml =
            item.tags && Array.isArray(item.tags) && item.tags.length > 0
              ? `Tags: ${item.tags.map((t) => utils.escapeHtml(t)).join(", ")}<br>`
              : "";
          const citationsHtml =
            item.citations &&
            Array.isArray(item.citations) &&
            item.citations.length > 0
              ? `Citations: <ul>${item.citations.map((c) => `<li>${utils.escapeHtml(c)}</li>`).join("")}</ul>`
              : "";

          return `
                      <div class="data-item">
                          <strong>ID: ${utils.escapeHtml(item.id)}</strong>
                          <div>Domain: ${utils.escapeHtml(item.domain)}</div>
                          <div>Text: <pre>${utils.escapeHtml(item.text)}</pre></div>
                          ${tagsHtml ? `<div>${tagsHtml}</div>` : ""}
                          ${citationsHtml ? `<div>${citationsHtml}</div>` : ""}
                          <div>Created: ${utils.formatDate(item.createdAt)} | Updated: ${utils.formatDate(item.updatedAt)}</div>
                      </div>`;
        } catch (renderError) {
          console.error(
            `Error rendering knowledge item ${item.id || "unknown"}:`,
            renderError,
            item,
          );
          return `<div class="data-item error">Error rendering knowledge item ID ${utils.escapeHtml(item.id || "unknown")}.</div>`;
        }
      })
      .join("");
  },

  /**
   * Renders a task flow diagram using Mermaid.
   * @param {Array<object>} tasks - Array of task objects.
   * @param {HTMLElement} element - The DOM element to render the diagram into.
   */
  taskFlow: async (tasks, element) => {
    if (!element) return;
    if (!tasks || tasks.length === 0) {
      element.innerHTML = "<p>No tasks to display in flow chart.</p>";
      return;
    }
    if (typeof mermaid === "undefined") {
      element.innerHTML =
        '<p class="error">Mermaid JS library not loaded.</p>';
      return;
    }
    uiHelpers.showLoading(element, "Generating task flow...");

    let flowDefinition = "graph TD;\n";
    tasks.forEach((task) => {
      const taskId = (task.id || "unknown_task").replace(/"/g, "#quot;");
      const taskTitle = utils
        .escapeHtml(task.title || "Untitled Task")
        .replace(/"/g, "#quot;");
      flowDefinition += `    ${taskId}["${taskTitle} (ID: ${taskId})"];\n`;
      if (task.dependencyIds && task.dependencyIds.length > 0) {
        task.dependencyIds.forEach((depId) => {
          const dependencyId = (depId || "unknown_dependency").replace(
            /"/g,
            "#quot;",
          );
          flowDefinition += `    ${dependencyId} --> ${taskId};\n`;
        });
      }
    });

    try {
      const currentThemeSetting = document.documentElement.classList.contains(
        "dark-mode",
      )
        ? config.MERMAID_THEME_DARK
        : config.MERMAID_THEME_LIGHT;
      // Re-initialize mermaid with current theme for this rendering
      mermaid.initialize({
        startOnLoad: false,
        theme: currentThemeSetting,
        flowchart: { htmlLabels: true },
      });
      const { svg } = await mermaid.render("taskFlowSvg", flowDefinition);
      element.innerHTML = svg;
    } catch (e) {
      console.error("Mermaid rendering error:", e);
      element.innerHTML = `<p class="error">Error rendering task flow: ${e.message}</p>`;
      uiHelpers.showError(`Mermaid rendering error: ${e.message}`);
    }
  },
};
