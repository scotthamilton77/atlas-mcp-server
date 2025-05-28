/**
 * @fileoverview Centralized DOM element selections.
 * @module src/webui/logic/dom-elements
 */

/**
 * Object containing references to frequently used DOM elements.
 * @type {object}
 * @property {HTMLElement} app - The main application container.
 * @property {HTMLSelectElement} projectSelect - The project selection dropdown.
 * @property {HTMLButtonElement} refreshButton - The button to refresh project list.
 * @property {HTMLElement} projectDetailsContainer - Container for project details.
 * @property {HTMLElement} detailsContent - Content area for project details.
 * @property {HTMLElement} tasksContainer - Container for tasks.
 * @property {HTMLElement} tasksContent - Content area for tasks.
 * @property {HTMLElement} knowledgeContainer - Container for knowledge items.
 * @property {HTMLElement} knowledgeContent - Content area for knowledge items.
 * @property {HTMLElement} errorMessageDiv - Div to display error messages.
 * @property {HTMLElement} neo4jStatusSpan - Span to display Neo4j connection status.
 * @property {HTMLInputElement} themeCheckbox - Checkbox for theme toggling.
 * @property {HTMLElement} themeLabel - Label for the theme toggle.
 * @property {HTMLButtonElement} taskViewModeToggle - Button to toggle task view mode.
 * @property {HTMLButtonElement} taskFlowToggle - Button to toggle task flow view.
 * @property {HTMLElement} taskFlowContainer - Container for the task flow diagram.
 * @property {HTMLButtonElement} knowledgeViewModeToggle - Button to toggle knowledge view mode.
 */
export const dom = {
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
