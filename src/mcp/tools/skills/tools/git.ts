import { Skill } from "../../atlas-skill/types.js";

/**
 * Git version control best practices and guidance skill
 */
export const gitSkill: Skill = {
  name: 'git',
  description: 'Git version control instructions and best practices',
  dependencies: [],
  parameters: [
    {
      name: 'username',
      description: 'Git username for configuration examples',
      required: false
    },
    {
      name: 'email',
      description: 'Git email for configuration examples',
      required: false
    },
    {
      name: 'branch_prefix',
      description: 'Prefix used for feature branches (e.g., "feature", "user")',
      required: false
    }
  ],
  content: (context) => {
    // Extract parameters or use defaults
    const username = context.parameters.username || 
                     context.environmentVariables.GIT_USERNAME || 
                     'your-username';
    
    const email = context.parameters.email || 
                  context.environmentVariables.GIT_EMAIL || 
                  `${username}@example.com`;
    
    const branchPrefix = context.parameters.branch_prefix || 'feature';
    
    return `# Git Best Practices

## Configuration
- Set your username: \`git config --global user.name "${username}"\`
- Set your email: \`git config --global user.email "${email}"\`
- Enable color output: \`git config --global color.ui auto\`
- Configure VSCode as editor: \`git config --global core.editor "code --wait"\`
- Setup useful aliases: \`git config --global alias.lg "log --graph --pretty=format:'%Cred%h%Creset -%C(yellow)%d%Creset %s %Cgreen(%cr) %C(bold blue)<%an>%Creset' --abbrev-commit"\`

## Common Commands
- Clone: \`git clone <repo-url>\`
- Status: \`git status\`
- Add: \`git add <files>\` or \`git add .\` for all changes
- Commit: \`git commit -m "descriptive message"\`
- Push: \`git push origin <branch>\`
- Pull: \`git pull origin <branch>\`
- View history: \`git log\` or \`git lg\` with the above alias

## Branching Strategy
- Create branch: \`git checkout -b ${branchPrefix}/<name>\`
- Switch branches: \`git checkout <branch>\`
- List branches: \`git branch\`
- Delete local branch: \`git branch -d <branch>\`
- Delete remote branch: \`git push origin --delete <branch>\`

## Best Practices
- Make atomic commits (single-purpose, small changes)
- Write meaningful commit messages that describe "why" not just "what"
- Pull before pushing to avoid conflicts
- Regularly rebase feature branches on main branch
- Use \`.gitignore\` to exclude build artifacts, dependencies, and sensitive files
- Consider using git hooks for pre-commit checks

## Advanced Usage
- Interactive staging: \`git add -i\`
- Rebase instead of merge: \`git rebase main\`
- Squash commits: \`git rebase -i HEAD~<n>\`
- Cherry-pick changes: \`git cherry-pick <commit-hash>\`
- Stash changes: \`git stash\` and \`git stash pop\`
- Fix last commit: \`git commit --amend\`
- Revert commits: \`git revert <commit-hash>\`
- Reset to commit: \`git reset --hard <commit-hash>\` (use with caution)

## Resolving Conflicts
1. After seeing a conflict, run \`git status\` to see affected files
2. Edit each file to resolve conflicts (look for \`<<<<<<<\`, \`=======\`, \`>>>>>>>\`)
3. After editing, mark as resolved with \`git add <file>\`
4. Complete the merge or rebase process (\`git rebase --continue\` or \`git merge --continue\`)`
  }
};