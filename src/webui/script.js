document.addEventListener("DOMContentLoaded", () => {
  // --- Configuration ---
  const config = {
    NEO4J_URI: window.NEO4J_URI || "bolt://localhost:7687",
    NEO4J_USER: window.NEO4J_USER || "neo4j",
    NEO4J_PASSWORD: window.NEO4J_PASSWORD || "password2",
    DEFAULT_THEME: "light",
    MERMAID_THEME_LIGHT: "default",
    MERMAID_THEME_DARK: "dark",
  };

  // --- DOM Elements ---
  const dom = {
    app: document.getElementById("app"),
    projectSelect: document.getElementById("project-select"),
    refreshButton: document.getElementById("refresh-button"),
    projectDetailsContainer: document.getElementById(
      "project-details-container",
    ),
    detailsContent: document.getElementById("details-content"),
    tasksContainer: document.getElementById("tasks-container"),
    tasksContent: document.getElementById("tasks-content"),
    knowledgeContainer: document.getElementById("knowledge-container"),
    knowledgeContent: document.getElementById("knowledge-content"),
    errorMessageDiv: document.getElementById("error-message"),
    neo4jStatusSpan: document.getElementById("neo4j-status"),
    themeCheckbox: document.getElementById("theme-checkbox"),
    themeLabel: document.querySelector(".theme-label"),
    taskViewModeToggle: document.getElementById("task-view-mode-toggle"),
    taskFlowToggle: document.getElementById("task-flow-toggle"),
    taskFlowContainer: document.getElementById("task-flow-container"),
    knowledgeViewModeToggle: document.getElementById(
      "knowledge-view-mode-toggle",
    ),
  };

  // --- Application State ---
  const state = {
    driver: null,
    currentProjectId: null,
    currentProject: null,
    currentTasks: [],
    currentKnowledgeItems: [],
    tasksViewMode: "detailed", // 'detailed' or 'compact'
    knowledgeViewMode: "detailed", // 'detailed' or 'compact'
    showingTaskFlow: false,
  };

  // --- Utilities ---
  const utils = {
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
            return '"';
          case "'":
            return "&#039;";
          default:
            return match;
        }
      });
    },
    parseJsonSafe: (jsonString, defaultValue = []) => {
      if (typeof jsonString !== "string")
        return Array.isArray(jsonString) ? jsonString : defaultValue;
      try {
        const parsed = JSON.parse(jsonString);
        return Array.isArray(parsed) ? parsed : defaultValue;
      } catch (e) {
        console.warn("Failed to parse JSON string:", jsonString, e);
        return defaultValue;
      }
    },
    formatDate: (dateString) => {
      if (!dateString) return "N/A";
      try {
        return new Date(dateString).toLocaleString();
      } catch (e) {
        return "Invalid Date";
      }
    },
  };

  // --- UI Management ---
  const ui = {
    applyTheme: (theme) => {
      document.documentElement.classList.toggle("dark-mode", theme === "dark");
      dom.themeCheckbox.checked = theme === "dark";
      if (typeof mermaid !== "undefined") {
        mermaid.initialize({
          startOnLoad: false,
          theme:
            theme === "dark"
              ? config.MERMAID_THEME_DARK
              : config.MERMAID_THEME_LIGHT,
          gantt: { axisFormatter: [["%Y-%m-%d", (d) => d.getDay() === 1]] },
          flowchart: { htmlLabels: true },
        });
      }
    },
    toggleTheme: () => {
      const currentThemeIsDark =
        document.documentElement.classList.contains("dark-mode");
      const newTheme = currentThemeIsDark ? "light" : "dark";
      ui.applyTheme(newTheme);
      localStorage.setItem("atlasTheme", newTheme);
      if (state.showingTaskFlow) {
        // Re-render task flow if visible
        renderService.taskFlow(state.currentTasks, dom.taskFlowContainer);
      }
    },
    loadTheme: () => {
      const savedTheme =
        localStorage.getItem("atlasTheme") || config.DEFAULT_THEME;
      ui.applyTheme(savedTheme);
    },
    setDisplay: (element, show) => {
      if (!element) return;
      element.classList.toggle("hidden", !show);
    },
    showLoading: (element, message = "Loading...") => {
      if (!element) return;
      element.innerHTML = `<p class="loading">${utils.escapeHtml(message)}</p>`;
    },
    showError: (message, isCritical = false) => {
      dom.errorMessageDiv.textContent = message;
      ui.setDisplay(dom.errorMessageDiv, true);
      if (isCritical) {
        ui.updateNeo4jStatus("Error", "var(--error-color)");
      }
    },
    clearError: () => {
      dom.errorMessageDiv.textContent = "";
      ui.setDisplay(dom.errorMessageDiv, false);
    },
    updateNeo4jStatus: (text, color) => {
      dom.neo4jStatusSpan.textContent = text;
      dom.neo4jStatusSpan.style.color = color;
    },
    updateToggleButton: (button, isActive, activeText, inactiveText) => {
      if (!button) return;
      button.textContent = isActive ? activeText : inactiveText;
      button.setAttribute("aria-pressed", isActive.toString());
    },
  };

  // --- Neo4j Service ---
  const apiService = {
    connect: async () => {
      ui.clearError();
      ui.updateNeo4jStatus("Connecting...", "var(--warning-color)");
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
        ui.updateNeo4jStatus("Connected", "var(--success-color)");
        console.log("Successfully connected to Neo4j.");
        return true;
      } catch (error) {
        console.error("Neo4j Connection Error:", error);
        ui.showError(
          `Neo4j Connection Error: ${error.message}. Check console and credentials.`,
          true,
        );
        dom.projectSelect.innerHTML =
          '<option value="">Neo4j Connection Error</option>';
        return false;
      }
    },
    runQuery: async (query, params = {}) => {
      if (!state.driver) {
        ui.showError("Not connected to Neo4j.", true);
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
    fetchProjects: async () => {
      ui.showLoading(dom.projectSelect, "Loading projects...");
      ui.setDisplay(dom.projectDetailsContainer, false);
      ui.setDisplay(dom.tasksContainer, false);
      ui.setDisplay(dom.knowledgeContainer, false);
      ui.clearError();

      if (!state.driver) {
        const connected = await apiService.connect();
        if (!connected) return;
      }

      try {
        const projectsData = await apiService.runQuery(
          "MATCH (p:Project) RETURN p.id as id, p.name as name ORDER BY p.name",
        );
        dom.projectSelect.innerHTML =
          '<option value="">-- Select a Project --</option>';
        if (projectsData && projectsData.length > 0) {
          projectsData.forEach((project) => {
            const option = document.createElement("option");
            option.value = project.id;
            option.textContent = utils.escapeHtml(project.name);
            dom.projectSelect.appendChild(option);
          });
        } else {
          dom.projectSelect.innerHTML =
            '<option value="">No projects found</option>';
        }
      } catch (error) {
        console.error("Failed to fetch projects:", error);
        dom.projectSelect.innerHTML =
          '<option value="">Error loading projects</option>';
        ui.showError(`Error loading projects: ${error.message}`);
      }
    },
    fetchProjectDetails: async (projectId) => {
      state.currentProjectId = projectId;
      if (!projectId) {
        ui.setDisplay(dom.projectDetailsContainer, false);
        ui.setDisplay(dom.tasksContainer, false);
        ui.setDisplay(dom.knowledgeContainer, false);
        return;
      }

      ui.showLoading(dom.detailsContent, "Loading project details...");
      ui.showLoading(dom.tasksContent, "Loading tasks...");
      ui.showLoading(dom.knowledgeContent, "Loading knowledge items...");
      ui.setDisplay(dom.projectDetailsContainer, true);
      ui.setDisplay(dom.tasksContainer, true);
      ui.setDisplay(dom.knowledgeContainer, true);

      state.showingTaskFlow = false;
      ui.setDisplay(dom.taskFlowContainer, false);
      ui.updateToggleButton(
        dom.taskFlowToggle,
        false,
        "View Task List",
        "View Task Flow",
      );
      ui.clearError();

      try {
        const projectResult = await apiService.runQuery(
          "MATCH (p:Project {id: $projectId}) RETURN p",
          { projectId },
        );
        state.currentProject =
          projectResult.length > 0 ? projectResult[0].p : null;
        renderService.projectDetails(state.currentProject, dom.detailsContent);

        const tasksQuery = `
                    MATCH (proj:Project {id: $projectId})-[:CONTAINS_TASK]->(task:Task)
                    OPTIONAL MATCH (task)-[:DEPENDS_ON]->(dependency:Task)
                    RETURN task, collect(dependency.id) as dependencyIds
                    ORDER BY task.title
                `;
        const tasksResult = await apiService.runQuery(tasksQuery, {
          projectId,
        });
        state.currentTasks = tasksResult.map((r) => ({
          ...r.task,
          dependencyIds: r.dependencyIds || [],
        }));
        renderService.tasks(
          state.currentTasks,
          dom.tasksContent,
          state.tasksViewMode,
        );

        const knowledgeResult = await apiService.runQuery(
          "MATCH (p:Project {id: $projectId})-[:CONTAINS_KNOWLEDGE]->(k:Knowledge) RETURN k ORDER BY k.createdAt DESC",
          { projectId },
        );
        state.currentKnowledgeItems = knowledgeResult.map((r) => r.k);
        renderService.knowledgeItems(
          state.currentKnowledgeItems,
          dom.knowledgeContent,
          state.knowledgeViewMode,
        );
      } catch (error) {
        console.error(
          `Failed to fetch details for project ${projectId}:`,
          error,
        );
        ui.showError(`Error loading project data: ${error.message}`);
        dom.detailsContent.innerHTML = `<p class="error">Error loading project details.</p>`;
        dom.tasksContent.innerHTML = `<p class="error">Error loading tasks.</p>`;
        dom.knowledgeContent.innerHTML = `<p class="error">Error loading knowledge items.</p>`;
      }
    },
  };

  // --- Rendering Service ---
  const renderService = {
    projectDetails: (project, element) => {
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
    tasks: (tasks, element, viewMode) => {
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
    knowledgeItems: (items, element, viewMode) => {
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
    taskFlow: async (tasks, element) => {
      if (!tasks || tasks.length === 0) {
        element.innerHTML = "<p>No tasks to display in flow chart.</p>";
        return;
      }
      if (typeof mermaid === "undefined") {
        element.innerHTML =
          '<p class="error">Mermaid JS library not loaded.</p>';
        return;
      }
      ui.showLoading(element, "Generating task flow...");

      let flowDefinition = "graph TD;\n";
      tasks.forEach((task) => {
        const taskId = (task.id || "unknown_task").replace(/"/g, "#quot;"); // Mermaid IDs cannot contain quotes
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
        // Ensure Mermaid is initialized with the current theme
        const currentThemeSetting = document.documentElement.classList.contains(
          "dark-mode",
        )
          ? config.MERMAID_THEME_DARK
          : config.MERMAID_THEME_LIGHT;
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
      }
    },
  };

  // --- Event Handlers ---
  const eventHandlers = {
    handleProjectSelectChange: (event) => {
      apiService.fetchProjectDetails(event.target.value);
    },
    handleRefreshClick: () => {
      apiService.fetchProjects();
    },
    handleThemeToggleChange: () => {
      ui.toggleTheme();
    },
    handleTaskViewModeToggle: () => {
      state.tasksViewMode =
        state.tasksViewMode === "detailed" ? "compact" : "detailed";
      ui.updateToggleButton(
        dom.taskViewModeToggle,
        state.tasksViewMode === "compact",
        "Detailed View",
        "Compact View",
      );
      renderService.tasks(
        state.currentTasks,
        dom.tasksContent,
        state.tasksViewMode,
      );
    },
    handleKnowledgeViewModeToggle: () => {
      state.knowledgeViewMode =
        state.knowledgeViewMode === "detailed" ? "compact" : "detailed";
      ui.updateToggleButton(
        dom.knowledgeViewModeToggle,
        state.knowledgeViewMode === "compact",
        "Detailed View",
        "Compact View",
      );
      renderService.knowledgeItems(
        state.currentKnowledgeItems,
        dom.knowledgeContent,
        state.knowledgeViewMode,
      );
    },
    handleTaskFlowToggle: () => {
      state.showingTaskFlow = !state.showingTaskFlow;
      ui.setDisplay(dom.tasksContent, !state.showingTaskFlow);
      ui.setDisplay(dom.taskFlowContainer, state.showingTaskFlow);
      ui.updateToggleButton(
        dom.taskFlowToggle,
        state.showingTaskFlow,
        "View Task List",
        "View Task Flow",
      );
      if (state.showingTaskFlow) {
        renderService.taskFlow(state.currentTasks, dom.taskFlowContainer);
      }
    },
    setup: () => {
      dom.projectSelect.addEventListener(
        "change",
        eventHandlers.handleProjectSelectChange,
      );
      dom.refreshButton.addEventListener(
        "click",
        eventHandlers.handleRefreshClick,
      );
      dom.themeCheckbox.addEventListener(
        "change",
        eventHandlers.handleThemeToggleChange,
      );
      dom.themeLabel.addEventListener("click", () => dom.themeCheckbox.click()); // Allow clicking label
      dom.taskViewModeToggle.addEventListener(
        "click",
        eventHandlers.handleTaskViewModeToggle,
      );
      dom.knowledgeViewModeToggle.addEventListener(
        "click",
        eventHandlers.handleKnowledgeViewModeToggle,
      );
      dom.taskFlowToggle.addEventListener(
        "click",
        eventHandlers.handleTaskFlowToggle,
      );
    },
  };

  // --- Initial Application Load ---
  async function initApp() {
    ui.loadTheme(); // Apply saved theme and initialize Mermaid
    eventHandlers.setup(); // Setup event listeners

    // Initialize toggle button texts
    ui.updateToggleButton(
      dom.taskViewModeToggle,
      state.tasksViewMode === "compact",
      "Detailed View",
      "Compact View",
    );
    ui.updateToggleButton(
      dom.knowledgeViewModeToggle,
      state.knowledgeViewMode === "compact",
      "Detailed View",
      "Compact View",
    );
    ui.updateToggleButton(
      dom.taskFlowToggle,
      state.showingTaskFlow,
      "View Task List",
      "View Task Flow",
    );

    const connected = await apiService.connect();
    if (connected) {
      apiService.fetchProjects();
    }
  }

  initApp();
});
