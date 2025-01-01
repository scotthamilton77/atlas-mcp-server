# Validation System

The validation system provides comprehensive input validation, schema enforcement, and data
integrity checks throughout the Atlas Task Manager.

## Overview

The validation system provides:

- Schema validation
- Input sanitization
- Path validation
- ID validation
- Configuration validation

## Architecture

### Core Components

#### Schema Validation

- Type checking
- Constraint validation
- Custom validators
- Error reporting

#### Path Validator

- Path format checking
- Hierarchy validation
- Component validation
- Length constraints

#### ID Validator

- Format validation
- Uniqueness checking
- Prefix validation
- Pattern matching

#### Config Validator

- Configuration checking
- Default handling
- Relationship validation
- Environment validation

## Validation Schemas

### Task Validation

```typescript
const taskSchema = {
  path: {
    type: 'string',
    maxLength: 1000,
    pattern: '^[a-zA-Z0-9-_/]+$',
    required: true,
  },
  name: {
    type: 'string',
    maxLength: 200,
    required: true,
  },
  type: {
    type: 'string',
    enum: ['TASK', 'MILESTONE'],
    default: 'TASK',
  },
  status: {
    type: 'string',
    enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'CANCELLED'],
    default: 'PENDING',
  },
};
```

### Configuration Validation

```typescript
const configSchema = {
  logging: {
    type: 'object',
    properties: {
      console: { type: 'boolean' },
      file: { type: 'boolean' },
      level: {
        type: 'string',
        enum: ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'],
      },
    },
  },
  storage: {
    type: 'object',
    properties: {
      baseDir: { type: 'string' },
      name: { type: 'string' },
      connection: {
        type: 'object',
        properties: {
          maxRetries: { type: 'number' },
          retryDelay: { type: 'number' },
        },
      },
    },
  },
};
```

## Usage Examples

```typescript
// Validate task input
function validateTask(input: unknown): asserts input is Task {
  const validator = new TaskValidator();
  validator.validate(input);
}

// Validate configuration
function validateConfig(config: unknown): asserts config is Config {
  const validator = new ConfigValidator();
  validator.validate(config);
}

// Validate path
function validatePath(path: string): boolean {
  return PathValidator.isValid(path);
}

// Custom validation
class CustomValidator extends BaseValidator {
  protected validateCustomField(value: unknown): void {
    if (!this.isValidCustomFormat(value)) {
      throw new ValidationError('Invalid custom format');
    }
  }
}
```

## Best Practices

1. **Schema Design**

   - Clear constraints
   - Sensible defaults
   - Proper types
   - Document requirements

2. **Validation Logic**

   - Thorough checks
   - Clear error messages
   - Performance aware
   - Handle edge cases

3. **Error Handling**

   - Specific errors
   - Helpful messages
   - Error context
   - Recovery hints

4. **Performance**

   - Optimize common cases
   - Cache schemas
   - Efficient checks
   - Early returns

5. **Extensibility**
   - Custom validators
   - Reusable logic
   - Clear interfaces
   - Plugin system
