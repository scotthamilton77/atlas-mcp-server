import { Skill } from "../../atlas-skill/types.js";

/**
 * Base software engineering best practices skill
 */
export const softwareEngineerSkill: Skill = {
  name: 'software-engineer',
  description: 'Base software engineering best practices',
  dependencies: [],
  parameters: [],
  content: () => `# Software Engineering Fundamentals

## Principles
- Write clean, maintainable code
- Follow the DRY principle (Don't Repeat Yourself)
- Use meaningful variable and function names
- Write tests for your code
- Document your code and APIs

## Process
- Understand requirements before coding
- Plan your approach before implementation
- Break complex problems into smaller parts
- Test your solution with edge cases
- Refactor for clarity and performance

## Code Quality
- Maintain consistent code style
- Use linters and formatters
- Apply static analysis tools
- Review code regularly
- Refactor technical debt

## Security
- Validate all inputs
- Escape output to prevent injection attacks
- Use parameterized queries for databases
- Follow the principle of least privilege
- Keep dependencies updated

## Communication
- Document design decisions
- Explain your approach in comments
- Use pull requests effectively
- Give constructive code review feedback
- Share knowledge with your team`
};