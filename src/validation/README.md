# Validation System

The Atlas validation system provides comprehensive validation capabilities for tasks, paths, and
metadata. It uses Zod for schema validation and provides a unified set of validation constants and
utilities.

## Structure

```
validation/
├── core/                     # Core validation system
│   ├── constants.ts         # Unified validation constants
│   ├── index.ts            # Core exports
│   └── path/               # Path validation
│       └── schema.ts       # Path validation schema
├── index.ts                 # Main exports (re-exports core)
└── README.md               # This file
```

## Key Components

### Constants

Unified validation constants are defined in `core/constants.ts`:

- Path validation rules
- Metadata constraints
- Task limits
- Security rules

### Path Validation

The path validation system (`core/path/schema.ts`) provides:

- Path format validation
- Parent-child relationship validation
- Path normalization
- Project name validation

### Validation Results

All validation functions return a standardized `ValidationResult<T>` type:

```typescript
interface ValidationResult<T = unknown> {
  success: boolean;
  data?: T;
  errors?: string[];
  warnings?: string[];
  metadata?: {
    validationTime?: number;
    mode?: ValidationMode;
    securityIssues?: string[];
  };
}
```

## Usage Examples

### Path Validation

```typescript
import { pathSchema, validateTaskPath } from './validation/core';

// Using the schema directly
const result = pathSchema.safeParse('project/task-1');
if (result.success) {
  const validPath = result.data;
}

// Using the helper function
const result = validateTaskPath('project/task-1', 'project');
if (result.success) {
  const validPath = result.data;
}
```

### Task Validation

```typescript
import { createTaskSchema } from './task/validation/schemas';

const result = createTaskSchema.safeParse({
  path: 'project/task-1',
  name: 'My Task',
  // ... other fields
});
```

## Migration Guide

The validation system has been consolidated to provide:

- Single source of truth for validation rules
- Consistent validation behavior
- Type-safe validation using Zod
- Unified error handling

### Migrating from Old System

1. Replace PathValidator imports:

   ```typescript
   // Old
   import { PathValidator } from '../validation';

   // New
   import { pathSchema, validateTaskPath } from '../validation/core';
   ```

2. Use ValidationConstants:

   ```typescript
   // Old
   const MAX_LENGTH = 1000;

   // New
   import { ValidationConstants } from '../validation/core';
   const maxLength = ValidationConstants.path.maxLength;
   ```

3. Use standardized ValidationResult:

   ```typescript
   // Old
   interface Result {
     isValid: boolean;
     error?: string;
   }

   // New
   import { ValidationResult } from '../validation/core';
   ```

## Best Practices

1. Always use ValidationConstants for constraints
2. Prefer Zod schemas over manual validation
3. Use type inference from schemas
4. Handle validation errors consistently
5. Include validation metadata when relevant

## Error Handling

The system provides consistent error handling:

- Detailed error messages
- Type-safe error objects
- Validation metadata
- Performance tracking

## Security

The validation system includes security features:

- Input sanitization
- Size limits
- Pattern validation
- Dangerous pattern detection

## Performance

Validation is optimized for:

- Quick validation of common cases
- Efficient path normalization
- Cached schema compilation
- Minimal allocations

## Contributing

When extending the validation system:

1. Add new constants to ValidationConstants
2. Create Zod schemas for new types
3. Follow the ValidationResult pattern
4. Add tests for new validation rules
5. Document changes in this README
