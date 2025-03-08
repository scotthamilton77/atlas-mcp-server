# ATLAS Skills Tools

A modular system for accessing and combining knowledge, best practices, and coding standards through the MCP protocol.

## Overview

The ATLAS Skills Tools provide a way to access and combine various "skills" - modular pieces of knowledge, best practices, and instructions that can be dynamically combined based on need.

## Core Components

1. **Tool Registration (`index.ts`)**: 
   - Registers the `atlas_skill_list` and `atlas_skill_invoke` tools with the MCP server
   - Defines the tool schemas and metadata

2. **Type Definitions (`types.ts`)**: 
   - Defines interfaces for skills, parameters, contexts, etc.
   - Provides schemas for tool input validation

3. **Skill Manager (`skill-manager.ts`)**: 
   - Manages skill registration and retrieval
   - Provides fuzzy matching for skill search
   - Handles loading skills from directories

4. **Skill Resolver (`skill-resolver.ts`)**: 
   - Resolves skills and their dependencies
   - Detects and prevents circular dependencies
   - Combines skills to produce the final output

## MCP Tools

1. **`atlas_skill_list`**
   - **Description**: Lists available skills with optional fuzzy name matching
   - **Parameters**:
     - `filter` (optional): Search term to filter skills by name or description
   - **Returns**: JSON list of skills with name, description, and parameters

2. **`atlas_skill_invoke`**
   - **Description**: Executes specific skills (individually or combined)
   - **Parameters**:
     - `skills`: Array of skill names to invoke. Supports dot notation (e.g., "software-engineer.typescript.git")
     - `parameters` (optional): Parameters to pass to the skills
   - **Returns**: Combined content from all resolved skills

## Skills Structure

Skills are organized hierarchically:
- **Base Skills**: Foundation practices (e.g., "software-engineer")
- **Domain Skills**: Language/framework specific (e.g., "typescript", "react") 
- **Tool Skills**: Specific tooling instructions (e.g., "git", "docker")

Skills can depend on other skills, and the system will automatically resolve dependencies.

## Example Usage

### List all available skills
```javascript
const response = await callTool({
  name: 'atlas_skill_list',
  arguments: {}
});
```

### Find skills related to TypeScript
```javascript
const response = await callTool({
  name: 'atlas_skill_list',
  arguments: {
    filter: 'typescript'
  }
});
```

### Get Git configuration instructions with custom parameters
```javascript
const response = await callTool({
  name: 'atlas_skill_invoke',
  arguments: {
    skills: ['git'],
    parameters: {
      username: 'johndoe',
      email: 'john@example.com'
    }
  }
});
```

### Combine software engineering, TypeScript, and Git skills
```javascript
const response = await callTool({
  name: 'atlas_skill_invoke',
  arguments: {
    skills: ['software-engineer.typescript.git']
  }
});
```

## Adding New Skills

To add a new skill, create a new .ts file in the appropriate skills directory:
- Base skills: `src/mcp/tools/skills/base/`
- Language skills: `src/mcp/tools/skills/languages/`
- Tool skills: `src/mcp/tools/skills/tools/`

Follow the skill interface defined in `types.ts`.