import { Skill } from "../../atlas-skill/types.js";
import { config } from "../../../../config/index.js";
import { logger } from "../../../../utils/logger.js";

/**
 * Docker containerization best practices and guidelines
 */
export const dockerSkill: Skill = {
  name: 'docker',
  description: 'Docker containerization best practices for development and deployment',
  dependencies: [],
  parameters: [
    {
      name: 'app_type',
      description: 'Application type (node, python, react, etc.)',
      required: false
    },
    {
      name: 'env',
      description: 'Environment (dev, prod)',
      required: false
    }
  ],
  content: (context) => {
    try {
      // Get parameters with fallbacks
      const appType = (context.parameters.app_type || 
                       config.skills.project?.defaultFramework ||
                       'node').toLowerCase();
      
      const env = (context.parameters.env || 'dev').toLowerCase();
      const isProd = env === 'prod' || env === 'production';
      
      // Log skill execution
      logger.info("Executing docker skill", {
        parameters: context.parameters,
        resolved: {
          appType,
          env,
          isProd
        }
      });
      
      return `# Docker Best Practices
## For ${appType.toUpperCase()} Applications

• Use **multi-stage builds** for ${isProd ? 'production' : 'development'}
• Base image: \`${appType === 'node' ? 'node:18-alpine' : 
             appType === 'python' ? 'python:3.10-slim' : 
             appType === 'react' ? 'node:18-alpine' : 
             'alpine:latest'}\`
• Mount at: \`/app\`
• ${appType === 'node' || appType === 'react' ? 'Copy package.json first, then npm install, then copy source' : 
  appType === 'python' ? 'Copy requirements.txt first, then pip install, then copy source' :
  'Copy dependency files first, install dependencies, then copy source'}
• ${isProd ? 'Keep production images lean by removing build tools' : 'Use volumes for development to enable hot reloading'}

## Best Practices
1. **Pin specific versions** - Use \`node:18-alpine\` not \`node:latest\`
2. **Layer caching** - Order instructions from least to most frequently changed
3. **Minimal images** - Include only what's necessary for running the application
4. **Non-root users** - Add \`USER\` instruction for security
5. **Use .dockerignore** - Exclude node_modules, logs, .git, etc.

## Quick Reference
• Build: \`docker build -t app:v1 .\`
• Run: \`docker run -p ${appType === 'react' ? '3000:3000' : 
                    appType === 'node' ? '3000:3000' : 
                    appType === 'python' ? '5000:5000' : 
                    '8080:8080'} app:v1\`
• Compose: \`docker-compose up -d\``;
    } catch (error) {
      // Log the error
      logger.error("Error executing docker skill", {
        error,
        parameters: context.parameters
      });
      
      // Return a user-friendly error message
      return `# Error in Docker Skill

An error occurred while processing the Docker skill. Please check the logs for more details.`;
    }
  }
};