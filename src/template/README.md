# Template System

The template system provides reusable task templates with variable interpolation and metadata
transformation capabilities for the Atlas Task Manager.

## Overview

The template system provides:

- Template management
- Variable interpolation
- Metadata transformation
- Template validation
- Template loading

## Architecture

### Core Components

#### TemplateManager

- Template lifecycle management
- Template instantiation
- Variable resolution
- Resource handling

#### Core Subsystems

##### Template Loader

- Template file loading
- Directory monitoring
- Format validation
- Error handling

##### Variable Interpolator

- Variable resolution
- Pattern matching
- Default handling
- Validation

##### Metadata Transformer

- Metadata processing
- Schema validation
- Value transformation
- Context handling

## Template Structure

```typescript
interface Template {
  id: string;
  name: string;
  description?: string;
  variables: {
    [key: string]: {
      type: 'string' | 'number' | 'boolean';
      description?: string;
      default?: unknown;
      required?: boolean;
    };
  };
  tasks: {
    path: string;
    name: string;
    type: 'TASK' | 'MILESTONE';
    description?: string;
    metadata?: Record<string, unknown>;
    dependencies?: string[];
  }[];
  metadata?: {
    tags?: string[];
    category?: string;
    version?: string;
    author?: string;
  };
}
```

## Usage Examples

```typescript
// Initialize template manager
const templateManager = new TemplateManager(storage, taskManager);
await templateManager.initialize([builtInTemplateDir, workspaceTemplateDir]);

// List available templates
const templates = await templateManager.listTemplates();

// Get template details
const template = await templateManager.getTemplate('web-project');

// Use template
await templateManager.useTemplate('web-project', {
  projectName: 'my-website',
  framework: 'react',
  features: ['auth', 'api'],
});

// Create custom template
const template = {
  id: 'custom-project',
  name: 'Custom Project Template',
  variables: {
    projectName: {
      type: 'string',
      description: 'Project name',
      required: true,
    },
  },
  tasks: [
    {
      path: '${projectName}/setup',
      name: 'Project Setup',
      type: 'MILESTONE',
    },
  ],
};

await templateManager.saveTemplate(template);
```

## Best Practices

1. **Template Design**

   - Use clear variable names
   - Provide descriptions
   - Set sensible defaults
   - Validate inputs

2. **Variable Usage**

   - Use consistent patterns
   - Handle missing values
   - Validate transformations
   - Document requirements

3. **Task Structure**

   - Maintain hierarchy
   - Set dependencies
   - Include metadata
   - Use clear naming

4. **Maintenance**

   - Version templates
   - Document changes
   - Test variations
   - Update examples

5. **Organization**
   - Group related templates
   - Use categories
   - Track authorship
   - Maintain documentation
