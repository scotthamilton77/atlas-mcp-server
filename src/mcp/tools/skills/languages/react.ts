import { Skill } from "../../atlas-skill/types.js";
import { config } from "../../../../config/index.js";
import { logger } from "../../../../utils/logger.js";

/**
 * React best practices and patterns aligned with organizational standards
 */
export const reactSkill: Skill = {
  name: 'react',
  description: 'React best practices, patterns, and component architecture',
  dependencies: ['typescript'],
  parameters: [
    {
      name: 'state_management',
      description: 'State management preference (redux, context, zustand, jotai)',
      required: false
    },
    {
      name: 'styling',
      description: 'Styling approach (css-modules, styled-components, tailwind, emotion)',
      required: false
    }
  ],
  content: (context) => {
    try {
      // Get parameters with fallbacks
      const stateManagement = (context.parameters.state_management || 'context').toLowerCase();
      const styling = (context.parameters.styling || 'css-modules').toLowerCase();
      const indentSize = config.skills.codeStyle?.indentSize || 2;

      // Log skill execution
      logger.info("Executing react skill", {
        parameters: context.parameters,
        resolved: {
          stateManagement,
          styling,
          indentSize
        },
        dependentSkills: context.resolvedSkills
          .filter(s => s.name !== 'react')
          .map(s => s.name)
      });
      
      return `# React Best Practices

## Key Guidelines

1. **Use functional components with hooks** instead of class components
2. **Organize by features** not by technical role (follow feature-based module pattern)
3. **Keep components small and focused** on a single responsibility
4. **Lift state up** only as high as needed in the component tree

## State Management (${stateManagement})

${stateManagement === 'redux' ? `
Use Redux Toolkit for type-safe redux implementation with createSlice and createAsyncThunk.
- Create slices per feature domain
- Use RTK Query for data fetching
- Keep selectors colocated with slices` : 
stateManagement === 'context' ? `
Use Context API with useReducer for complex state:
- Create separate contexts by domain
- Use the reducer pattern for complex updates
- Provide custom hooks for consumers` : 
`
Use ${stateManagement} for state management:
- Leverage atomic updates
- Separate UI state from server state
- Keep state close to where it's used`}

## Styling (${styling})

${styling === 'css-modules' ? `
Use CSS Modules for scoped styling
- Name files ComponentName.module.css
- Import with \`import styles from './Component.module.css'\`
- Apply with \`className={styles.element}\`` : 
styling === 'styled-components' ? `
Use styled-components for CSS-in-JS
- Create styled components at the top of your file
- Use props for dynamic styling
- Create themes for consistent values` : 
`
Use ${styling} for styling
- Follow the ${styling} pattern for component styling
- Keep styles colocated with components
- Extract common themes and variables`}

## Performance Optimization
1. **React.memo** for expensive components that render often
2. **useMemo** for expensive calculations
3. **useCallback** for functions passed as props
4. **Virtualize long lists** to render only visible items
5. **Code-splitting** with React.lazy and Suspense`;
    } catch (error) {
      // Log the error
      logger.error("Error executing react skill", {
        error,
        parameters: context.parameters
      });
      
      // Return a user-friendly error message
      return `# Error in React Skill

An error occurred while processing the React skill. Please check the logs for more details.`;
    }
  }
};