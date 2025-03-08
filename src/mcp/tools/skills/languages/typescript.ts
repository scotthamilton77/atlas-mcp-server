import { Skill } from "../../atlas-skill/types.js";
import { logger } from "../../../../utils/logger.js";

/**
 * TypeScript coding standards and practices skill
 */
export const typescriptSkill: Skill = {
  name: 'typescript',
  description: 'TypeScript coding standards and practices',
  dependencies: ['software-engineer'],  // Depends on base skill
  parameters: [],
  content: (context) => {
    try {
      // Log skill execution with context
      logger.info("Executing typescript skill", {
        parameters: context.parameters,
        dependentSkills: context.resolvedSkills
          .filter(s => s.name !== 'typescript')
          .map(s => s.name)
      });
      
      return `# TypeScript Best Practices

## Type Safety
- Use explicit typing whenever possible
- Avoid 'any' type unless absolutely necessary
- Use interfaces for object shapes
- Utilize generics for reusable code
- Leverage union types for variables that can be multiple types

## Configuration
- Use strict mode in tsconfig.json
- Enable all strict type checking options
- Configure proper module resolution
- Set up source maps for debugging
- Include appropriate lib dependencies

## Coding Standards
- Use interfaces for public APIs
- Prefer readonly properties for immutable values
- Use type aliases to simplify complex types
- Leverage discriminated unions for type narrowing
- Use const assertions for literal values

## Advanced Types
- Understand mapped types (Pick, Omit, Partial, etc.)
- Use conditional types for complex scenarios
- Leverage template literal types
- Understand index signatures
- Use function overloads for complex functions

## Error Handling
- Use type predicates for type narrowing
- Properly type error objects
- Use Result pattern for error handling
- Leverage never type for exhaustive checking
- Use instanceof and type guards

## Code Organization
- Use namespaces judiciously
- Prefer ES modules over namespaces
- Use barrel exports (index.ts files)
- Organize imports with meaningful grouping
- Use declaration merging appropriately`
    } catch (error) {
      // Log the error
      logger.error("Error executing typescript skill", {
        error,
        parameters: context.parameters
      });
      
      // Return a user-friendly error message
      return `# Error in TypeScript Skill\n\nAn error occurred while processing the TypeScript skill. Please check the logs for more details.`;
    }
  }
};