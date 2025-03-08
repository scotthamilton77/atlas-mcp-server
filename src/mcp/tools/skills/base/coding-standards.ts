import { Skill } from "../../atlas-skill/types.js";
import fs from "fs/promises";
import path from "path";
import { logger } from "../../../../utils/logger.js";
import { config } from "../../../../config/index.js"; 
import { fileURLToPath } from "url";
import { dirname } from "path";

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Coding standards skill that reads from the configured standards file
 */
export const codingStandardsSkill: Skill = {
  name: 'coding-standards',
  description: 'Organization coding standards and best practices',
  dependencies: [],
  parameters: [],
  // Use async so we can read the file when requested
  content: async (context) => {
    // Log that skill execution started
    logger.info("Executing coding-standards skill", {
      hasConfig: !!config.skills.codingStandardsPath,
      configPath: config.skills.codingStandardsPath,
      processEnvPath: process.env.ATLAS_CODING_STANDARDS_PATH,
      moduleDir: __dirname,
      workingDir: process.cwd()
    });
    
    try {
      // Get the coding standards path from environment variables
      logger.debug("Available environment variables in skill context:", {
        envVarKeys: Object.keys(context.environmentVariables),
        processEnvKeys: Object.keys(process.env).filter(key => 
          key.startsWith('SKILL_') || 
          key.startsWith('GIT_') || 
          key.startsWith('CODING_') ||
          key.startsWith('ATLAS_')
        )
      });

      // Primary way: Get path from central config
      const standardsPath = config.skills.codingStandardsPath;
        
      // Fallback: Try env variable from skill context
      const envVarPath = context.environmentVariables.ATLAS_CODING_STANDARDS_PATH;
      
      // Combined path (prefer config, fall back to context env var)
      const filePath = standardsPath || envVarPath;
      
      // Try several approaches to find the file
      const possiblePaths = [];
      
      // 1. If we have a path from config or env var, try that first
      if (filePath) {
        // If absolute, use as is
        if (path.isAbsolute(filePath)) {
          possiblePaths.push({
            path: filePath,
            source: "absolute path from config/env"
          });
        } else {
          // Try relative to current working dir
          possiblePaths.push({
            path: path.resolve(process.cwd(), filePath),
            source: "relative to CWD"
          });
          
          // Try relative to module dir
          possiblePaths.push({
            path: path.resolve(__dirname, "../../../../..", filePath),
            source: "relative to module root"
          });
        }
      }
      
      // 2. Try standard locations regardless of configuration
      possiblePaths.push({
        path: path.resolve(process.cwd(), "skills/coding-standards.md"),
        source: "default location in CWD"
      });
      
      possiblePaths.push({
        path: path.resolve(__dirname, "../../../../..", "skills/coding-standards.md"),
        source: "default location from module root"
      });
      
      // Log all paths we're going to try
      logger.info("Attempting to find coding standards file at these locations:", {
        paths: possiblePaths.map(p => `${p.path} (${p.source})`)
      });
      
      // Try each path in order
      for (const pathInfo of possiblePaths) {
        try {
          logger.info(`Trying: ${pathInfo.path} (${pathInfo.source})`);
          const content = await fs.readFile(pathInfo.path, 'utf-8');
          logger.info(`Successfully read coding standards file from ${pathInfo.source} (${content.length} bytes)`);
          return content;
        } catch (err) {
          // Just log and continue to next path
          logger.debug(`Path not found: ${pathInfo.path} (${pathInfo.source})`);
        }
      }
      
      // If we get here, we couldn't find the file at any location
      logger.warn("Could not find coding standards file at any location", {
        triedPaths: possiblePaths.map(p => p.path)
      });

      // Return informative error message
      return `# Coding Standards

No coding standards file path configured. 
Please set the ATLAS_CODING_STANDARDS_PATH environment variable to point to your standards file.

## Configuration Debug:

- Module directory: ${__dirname}
- Current working directory: ${process.cwd()} 
- .env ATLAS_CODING_STANDARDS_PATH value: ${process.env.ATLAS_CODING_STANDARDS_PATH || 'Not set'}
- Config skills.codingStandardsPath: ${config.skills.codingStandardsPath || 'Not set'}

## Paths Tried:
${possiblePaths.map(p => `- ${p.path} (${p.source})`).join('\n')}

## How to Fix:

1. Add the path to your .env file:
   \`\`\`env
   ATLAS_CODING_STANDARDS_PATH=skills/coding-standards.md
   \`\`\`

2. Make sure the file exists at the specified path.

3. Restart the server after making changes.

4. Make sure the file is at one of these locations:
   - /skills/coding-standards.md
   - ${path.resolve(__dirname, "../../../../..", "skills/coding-standards.md")}`;
    } catch (error) {
      logger.error("Error reading coding standards file", { error });
      
      if (error instanceof Error) {
        return `# Error Loading Coding Standards

Could not read the coding standards file. Error details:

\`\`\`
${error.message}
${error.stack}
\`\`\`

Please ensure the ATLAS_CODING_STANDARDS_PATH environment variable points to a valid file.`;
      }
      
      return "# Error Loading Coding Standards\n\nAn unknown error occurred while trying to load the coding standards file.";
    }
  }
};