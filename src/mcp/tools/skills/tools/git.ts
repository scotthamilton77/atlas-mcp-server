import { Skill } from "../../atlas-skill/types.js";
import { config } from "../../../../config/index.js";
import { logger } from "../../../../utils/logger.js";

/**
 * Git version control best practices and guidelines aligned with the
 * organization's coding standards.
 */
export const gitSkill: Skill = {
  name: 'git',
  description: 'Git version control workflow and best practices following organizational standards',
  dependencies: [],
  parameters: [
    {
      name: 'username',
      description: 'Git username for configuration (overrides environment variables)',
      required: false
    },
    {
      name: 'email',
      description: 'Git email for configuration (overrides environment variables)',
      required: false
    },
    {
      name: 'branch_prefix',
      description: 'Prefix used for feature branches (defaults to "feature")',
      required: false
    },
    {
      name: 'commit_style',
      description: 'Commit message style ("conventional" or "descriptive", defaults to "conventional")',
      required: false
    }
  ],
  content: (context) => {
    // Log skill execution
    try {
      logger.info("Executing Git skill", { 
        parameters: context.parameters,
        configGit: config.skills.git
      });

      // Extract parameters from multiple sources in order of priority:
      // 1. Direct parameters passed to the skill
      // 2. Centralized application config loaded from .env
      // 3. Environment variables in the skill context
      // 4. Default values

      const username = context.parameters.username || // Parameter has highest priority
                       config.skills.git.username ||  // Then central config
                       context.environmentVariables.GIT_USERNAME || // Then skill context env var
                       'your-username'; // Default value
      
      const email = context.parameters.email || 
                    config.skills.git.email ||
                    context.environmentVariables.GIT_EMAIL ||
                    `${username}@example.com`;
      
      const branchPrefix = context.parameters.branch_prefix || 
                           config.skills.git.defaultBranchPrefix ||
                           'feature';
                           
      const commitStyle = (context.parameters.commit_style || 'conventional').toLowerCase();
      
      // Log resolved parameters
      logger.debug("Git skill parameter resolution complete", {
        resolved: {
          username,
          email,
          branchPrefix,
          commitStyle
        },
        environmentVariables: {
          GIT_USERNAME: context.environmentVariables.GIT_USERNAME,
          GIT_EMAIL: context.environmentVariables.GIT_EMAIL
        }
      });
      
      return `# Git Best Practices

## Essential Setup
- **Identity**: \`git config --global user.name "${username}"\` and \`git config --global user.email "${email}"\`
- **Editor**: \`git config --global core.editor "code --wait"\`
- **Aliases**: \`git config --global alias.lg "log --graph --pretty=format:'%Cred%h%Creset -%C(yellow)%d%Creset %s %Cgreen(%cr) %C(bold blue)<%an>%Creset' --abbrev-commit"\`

## Workflow
1. **Branch**: \`git checkout -b ${branchPrefix}/<module-name>/<feature>\`
2. **Changes**: \`git add <files>\` then ${commitStyle === 'conventional' ? 
   '`git commit -m "feat(module): description"`' : 
   '`git commit -m "Add feature to module"`'}
3. **Sync**: \`git fetch origin\` and \`git rebase origin/main\`
4. **Push**: \`git push -u origin ${branchPrefix}/<module-name>/<feature>\`
5. **Cleanup**: After merge: \`git branch -d ${branchPrefix}/<module-name>/<feature>\`

## Best Practices
- Make **atomic commits** (single logical change per commit)
- Use ${commitStyle === 'conventional' ? 'conventional commit format' : 'descriptive messages'} that explain "why"
- Name branches \`${branchPrefix}/<module>/<feature>\` and keep short-lived
- Use \`git rebase\` over merge to maintain clean history
- Never commit secrets or credentials (use \`.env\` files)
- Use pre-commit hooks for linting and testing

## Quick References
- **Fix last commit**: \`git commit --amend\`
- **Discard changes**: \`git checkout -- <file>\` or \`git restore <file>\`
- **Stash work**: \`git stash\` and \`git stash pop\`
- **Clean history**: \`git rebase -i HEAD~<n>\`
- **Cherry-pick**: \`git cherry-pick <commit-hash>\`

## Resolving Conflicts
1. **Check**: \`git status\` to see conflicted files
2. **Edit**: Resolve conflicts in files (look for \`<<<<<<<\`, \`=======\`, \`>>>>>>>\`)
3. **Mark**: \`git add <file>\` to mark as resolved
4. **Continue**: \`git rebase --continue\`
5. **Abort**: \`git rebase --abort\` if needed`
    } catch (error) {
      // Log the error
      logger.error("Error executing git skill", {
        error,
        parameters: context.parameters
      });
      
      // Return a user-friendly error message
      return `# Error in Git Skill

An error occurred while processing the Git skill. Please check the logs for more details.`;
    }
  }
};