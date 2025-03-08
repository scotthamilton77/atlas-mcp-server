import { Skill } from "../../atlas-skill/types.js";
import { logger } from "../../../../utils/logger.js";

/**
 * Base software engineering best practices skill
 */
export const softwareEngineerSkill: Skill = {
  name: 'software-engineer',
  description: 'Base software engineering best practices',
  dependencies: [],
  parameters: [],
  content: (context) => {
    try {
      // Log skill execution
      logger.info("Executing software-engineer skill", { 
        parameters: context.parameters
      });
      
      return `# Software Engineering Fundamentals

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
    } catch (error) {
      // Handle any errors with standardized error handler
      logger.error("Error executing software-engineer skill", {
        error,
        parameters: context.parameters
      });
      
      // Return an error message that will be displayed to the user
      return `# Error in Software Engineering Skill

An error occurred while processing the software engineering skill. Please check the logs for more details.`;
    }
  }
};