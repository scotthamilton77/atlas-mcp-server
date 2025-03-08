import { Skill } from "../../atlas-skill/types.js";
import { config } from "../../../../config/index.js";
import { logger } from "../../../../utils/logger.js";

/**
 * CI/CD best practices and workflow configurations
 */
export const cicdSkill: Skill = {
  name: 'ci-cd',
  description: 'Continuous Integration and Deployment best practices',
  dependencies: [],
  parameters: [
    {
      name: 'provider',
      description: 'CI/CD provider (github-actions, jenkins, gitlab-ci, circle-ci)',
      required: false
    },
    {
      name: 'language',
      description: 'Primary language (typescript, python, java, etc.)',
      required: false
    }
  ],
  content: (context) => {
    try {
      // Get parameters with fallbacks
      const provider = (context.parameters.provider || 
                       config.skills.project?.cicdProvider ||
                       'github-actions').toLowerCase().replace(/\s/g, '-');
      
      const language = (context.parameters.language || 
                       config.skills.project?.defaultFramework ||
                       'typescript').toLowerCase();
      
      // Log skill execution
      logger.info("Executing ci-cd skill", {
        parameters: context.parameters,
        resolved: {
          provider,
          language
        },
        configValues: {
          cicdProvider: config.skills.project?.cicdProvider,
          defaultFramework: config.skills.project?.defaultFramework
        }
      });
      
      return `# CI/CD Best Practices

## For ${provider === 'github-actions' ? 'GitHub Actions' : 
         provider === 'gitlab-ci' ? 'GitLab CI' : 
         provider === 'circle-ci' ? 'CircleCI' : 
         'Jenkins'} with ${language.charAt(0).toUpperCase() + language.slice(1)}

• **File Path**: \`${provider === 'github-actions' ? '.github/workflows/main.yml' : 
                  provider === 'gitlab-ci' ? '.gitlab-ci.yml' : 
                  provider === 'circle-ci' ? '.circleci/config.yml' : 
                  'Jenkinsfile'}\`
• **Base Image**: ${language === 'typescript' || language === 'javascript' ? 'Node 18' : 
                  language === 'python' ? 'Python 3.10' : 
                  language === 'java' ? 'JDK 17' : 
                  'Language-specific image'}
• **Key Steps**: lint → test → build → deploy
• **Cache**: ${language === 'typescript' || language === 'javascript' ? 'node_modules' : 
             language === 'python' ? '.venv or pip cache' : 
             language === 'java' ? '.gradle or .m2' : 
             'dependency cache'}

## Core Principles

1. **Pipeline as Code** - Version control for CI/CD configurations
2. **Fast Feedback** - Fail fast, succeed fast with parallel jobs
3. **Consistent Environments** - Use containerization for reproducibility
4. **Automated Testing** - Run comprehensive test suites on every change
5. **Separate Stages** - Isolate build, test, and deployment phases

## Best Practices

• **Branch Protection** - Require passing CI checks before merging
• **Cacheable Steps** - Cache dependencies between runs for faster builds
• **Secrets Management** - Store sensitive data in environment variables
• **Artifact Persistence** - Save build outputs between stages
• **Deployment Gates** - Implement approvals for production deployments`;
    } catch (error) {
      // Log the error
      logger.error("Error executing ci-cd skill", {
        error,
        parameters: context.parameters
      });
      
      // Return a user-friendly error message
      return `# Error in CI/CD Skill

An error occurred while processing the CI/CD skill. Please check the logs for more details.`;
    }
  }
};