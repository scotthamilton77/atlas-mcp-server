/**
 * @fileoverview Application configuration constants.
 * @module src/webui/logic/config
 */

/**
 * Application configuration settings.
 * @type {object}
 * @property {string} NEO4J_URI - The URI for the Neo4j database.
 * @property {string} NEO4J_USER - The username for Neo4j authentication.
 * @property {string} NEO4J_PASSWORD - The password for Neo4j authentication.
 * @property {string} DEFAULT_THEME - The default theme ('light' or 'dark').
 * @property {string} MERMAID_THEME_LIGHT - Mermaid theme for light mode.
 * @property {string} MERMAID_THEME_DARK - Mermaid theme for dark mode.
 */
export const config = {
  NEO4J_URI: window.NEO4J_URI || "bolt://localhost:7687",
  NEO4J_USER: window.NEO4J_USER || "neo4j",
  NEO4J_PASSWORD: window.NEO4J_PASSWORD || "password2",
  DEFAULT_THEME: "light",
  MERMAID_THEME_LIGHT: "default",
  MERMAID_THEME_DARK: "dark",
};
