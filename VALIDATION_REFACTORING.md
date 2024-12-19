# Atlas MCP Server Validation Refactoring

## Current Validation Analysis

The current validation system has several strong points but is implemented across multiple layers:

### 1. Schema-based Validation (validation/task.ts)
- Uses Zod for robust schema validation
- Well-defined schemas for all task-related types
- Strong type inference and runtime validation
- Comprehensive error messages

### 2. Runtime Validation
Currently scattered across:
- StorageManager (data integrity)
- TaskStore (relationship validation)
- TaskManager (input validation)
- DependencyValidator (dependency checks)

## Issues to Address

1. **Duplicate Validation**
   - Same validations performed in multiple places
   - Inconsistent error handling
   - Redundant type checking

2. **Mixed Concerns**
   - Business rules mixed with data validation
   - Schema validation mixed with relationship validation
   - Validation mixed with error handling

3. **Performance Impact**
   - Multiple validation passes
   - Redundant checks
   - Unnecessary type conversions

## Proposed Validation Architecture

### 1. Validation Layer Structure

```typescript
src/
└── core/
    └── validation/
        ├── schemas/           // Zod schemas
        │   ├── task.ts
        │   ├── note.ts
        │   └── metadata.ts
        ├── rules/            // Business rules
        │   ├── dependency.ts
        │   ├── status.ts
        │   └── relationship.ts
        ├── runtime/          // Runtime validators
        │   ├── integrity.ts
        │   └── consistency.ts
        └── coordinator.ts    // Validation coordination
```

### 2. Core Components

#### ValidationCoordinator
```typescript
class ValidationCoordinator {
    constructor(
        private schemaValidator: SchemaValidator,
        private ruleValidator: BusinessRuleValidator,
        private runtimeValidator: RuntimeValidator
    ) {}

    // Single entry point for all validation
    async validate(
        context: ValidationContext,
        data: unknown,
        options: ValidationOptions
    ): Promise<ValidationResult> {
        // 1. Schema validation
        const schemaResult = await this.schemaValidator.validate(data);
        if (!schemaResult.success) {
            return this.handleValidationFailure(schemaResult);
        }

        // 2. Business rules
        const ruleResult = await this.ruleValidator.validate(context, data);
        if (!ruleResult.success) {
            return this.handleValidationFailure(ruleResult);
        }

        // 3. Runtime checks
        const runtimeResult = await this.runtimeValidator.validate(context, data);
        if (!runtimeResult.success) {
            return this.handleValidationFailure(runtimeResult);
        }

        return {
            success: true,
            data: schemaResult.data
        };
    }

    private handleValidationFailure(result: ValidationError): ValidationResult {
        return {
            success: false,
            error: this.normalizeValidationError(result)
        };
    }
}
```

#### SchemaValidator
```typescript
class SchemaValidator {
    constructor(private schemas: Record<string, z.ZodSchema>) {}

    async validate(
        data: unknown,
        schemaKey: string
    ): Promise<SchemaValidationResult> {
        const schema = this.schemas[schemaKey];
        if (!schema) {
            throw new Error(`Schema not found: ${schemaKey}`);
        }

        const result = schema.safeParse(data);
        return {
            success: result.success,
            data: result.success ? result.data : undefined,
            errors: !result.success ? this.formatZodErrors(result.error) : undefined
        };
    }
}
```

#### BusinessRuleValidator
```typescript
class BusinessRuleValidator {
    constructor(private rules: BusinessRule[]) {}

    async validate(
        context: ValidationContext,
        data: unknown
    ): Promise<RuleValidationResult> {
        const results = await Promise.all(
            this.rules.map(rule => rule.validate(context, data))
        );

        const failures = results.filter(r => !r.success);
        return {
            success: failures.length === 0,
            errors: failures.map(f => f.error)
        };
    }
}
```

#### RuntimeValidator
```typescript
class RuntimeValidator {
    constructor(
        private integrityChecker: DataIntegrityChecker,
        private consistencyChecker: ConsistencyChecker
    ) {}

    async validate(
        context: ValidationContext,
        data: unknown
    ): Promise<RuntimeValidationResult> {
        // Check data integrity
        const integrityResult = await this.integrityChecker.check(data);
        if (!integrityResult.success) {
            return integrityResult;
        }

        // Check data consistency
        const consistencyResult = await this.consistencyChecker.check(context, data);
        if (!consistencyResult.success) {
            return consistencyResult;
        }

        return { success: true };
    }
}
```

### 3. Validation Rules

#### 1. Schema Rules (Using existing Zod schemas)
```typescript
const taskSchemas = {
    create: createTaskSchema,
    update: updateTaskSchema,
    bulk: bulkCreateTaskSchema,
    // ... other schemas
};
```

#### 2. Business Rules
```typescript
interface BusinessRule {
    validate(context: ValidationContext, data: unknown): Promise<RuleValidationResult>;
}

class DependencyRule implements BusinessRule {
    async validate(
        context: ValidationContext,
        data: Task
    ): Promise<RuleValidationResult> {
        // Validate task dependencies
        return this.validateDependencies(data.dependencies);
    }
}

class StatusTransitionRule implements BusinessRule {
    async validate(
        context: ValidationContext,
        data: StatusUpdate
    ): Promise<RuleValidationResult> {
        // Validate status transitions
        return this.validateStatusTransition(data.from, data.to);
    }
}
```

#### 3. Runtime Rules
```typescript
class DataIntegrityChecker {
    async check(data: unknown): Promise<RuntimeValidationResult> {
        // Check data integrity (checksums, required fields, etc.)
        return this.verifyDataIntegrity(data);
    }
}

class ConsistencyChecker {
    async check(
        context: ValidationContext,
        data: unknown
    ): Promise<RuntimeValidationResult> {
        // Check data consistency (relationships, references, etc.)
        return this.verifyDataConsistency(context, data);
    }
}
```

### 4. Integration

#### In UnifiedStorageEngine
```typescript
class UnifiedStorageEngine {
    constructor(
        private validator: ValidationCoordinator,
        // ... other dependencies
    ) {}

    async save(data: unknown): Promise<void> {
        // Validate before saving
        const validationResult = await this.validator.validate({
            operation: 'save',
            context: this.getContext()
        }, data);

        if (!validationResult.success) {
            throw new ValidationError(validationResult.error);
        }

        // Proceed with save
        await this.performSave(validationResult.data);
    }
}
```

#### In TaskManager
```typescript
class TaskManager {
    constructor(
        private validator: ValidationCoordinator,
        // ... other dependencies
    ) {}

    async createTask(input: unknown): Promise<Task> {
        // Validate task creation
        const validationResult = await this.validator.validate({
            operation: 'createTask',
            context: this.getContext()
        }, input);

        if (!validationResult.success) {
            throw new ValidationError(validationResult.error);
        }

        // Proceed with task creation
        return this.performTaskCreation(validationResult.data);
    }
}
```

## Migration Strategy

1. **Phase 1: Validation Infrastructure**
   - Create new validation directory structure
   - Implement core validation components
   - Write tests for validation logic

2. **Phase 2: Schema Migration**
   - Move existing Zod schemas to new location
   - Update schema imports
   - Add new schemas as needed

3. **Phase 3: Rule Implementation**
   - Implement business rules
   - Create runtime validators
   - Add rule tests

4. **Phase 4: Integration**
   - Update storage engine
   - Update task manager
   - Add integration tests

## Testing Strategy

1. **Schema Tests**
```typescript
describe('TaskSchemaValidator', () => {
    it('validates create task input', async () => {
        const validator = new SchemaValidator(taskSchemas);
        const result = await validator.validate(validInput, 'create');
        expect(result.success).toBe(true);
    });
});
```

2. **Rule Tests**
```typescript
describe('DependencyRule', () => {
    it('validates task dependencies', async () => {
        const rule = new DependencyRule();
        const result = await rule.validate(context, taskWithDeps);
        expect(result.success).toBe(true);
    });
});
```

3. **Integration Tests**
```typescript
describe('ValidationCoordinator', () => {
    it('performs complete validation', async () => {
        const coordinator = new ValidationCoordinator(
            new SchemaValidator(schemas),
            new BusinessRuleValidator(rules),
            new RuntimeValidator(checkers)
        );

        const result = await coordinator.validate(context, data);
        expect(result.success).toBe(true);
    });
});
```

This validation refactoring will:
1. Centralize all validation logic
2. Eliminate duplicate validation
3. Improve performance
4. Provide better error handling
5. Make validation rules more maintainable
