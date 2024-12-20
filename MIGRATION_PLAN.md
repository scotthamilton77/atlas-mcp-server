# Migration Plan: UUID to Short IDs

## Overview
Replace UUID-based identifiers with shorter 8-character identifiers throughout the Atlas MCP server.

## Required Changes

### 1. Schema Validation (Medium Effort)
- **Files to Modify**:
  - `src/config/index.ts`
  - `src/validation/task.ts`
  - `src/validation/index.ts`

Changes needed:
- Replace UUID validation with new short ID format
- Update validation error messages
- Modify Zod schemas to use new ID format

### 2. ID Generation (Low Effort)
- **Files to Modify**:
  - `src/task-manager.ts`
  - `src/task/core/session/session-manager.ts`
  - `src/task/core/status-manager.ts`
  - `src/task/core/transactions/transaction-manager.ts`
  - `src/server/request-tracer.ts`

Changes needed:
- Create new ID generation utility (e.g., nanoid or custom implementation)
- Replace all crypto.randomUUID() and uuidv4() calls
- Update type definitions

### 3. Database/Storage (Low Effort)
- **Files to Modify**:
  - `src/storage/unified-sqlite-storage.ts`

Changes needed:
- No schema changes required (using TEXT columns already)
- No migration needed for existing data
- No changes needed for indexes or constraints
- SQL queries are ID-format agnostic

## Implementation Strategy

### Phase 1: ID Generation
1. Create new ID generation utility:
```typescript
// src/utils/id-generator.ts
import { customAlphabet } from 'nanoid';

const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const generateId = customAlphabet(alphabet, 8);

export function generateShortId(): string {
    return generateId();
}
```

### Phase 2: Schema Updates
1. Update validation schemas to accept new format
2. Create new validation utility:
```typescript
// src/validation/id-validator.ts
export function isValidShortId(value: string): boolean {
    return /^[0-9A-Za-z]{8}$/.test(value);
}
```

### Phase 3: Database Compatibility
1. Verify existing queries work with new ID format
2. Add logging for ID format changes
3. Update database documentation

### Phase 4: Code Updates
1. Replace UUID generation with new utility
2. Update type definitions
3. Modify error messages and documentation

## Testing Strategy
1. Unit tests for new ID generation and validation
2. Integration tests for database operations
3. Migration tests with sample data
4. Performance comparison tests

## Risks and Mitigation
1. **Data Integrity**: Ensure migration handles all existing data
2. **ID Collisions**: Use sufficient entropy in ID generation
3. **Performance**: Benchmark new ID generation vs UUID
4. **Backwards Compatibility**: Consider transition period support

## Dependencies
- nanoid (or similar) for ID generation
- Database migration tools
- Testing frameworks

## Estimated Timeline
- Phase 1: 1 day
- Phase 2: 1-2 days
- Phase 3: 1 day
- Phase 4: 2-3 days
- Testing: 1-2 days

Total: 6-9 days for complete implementation

## Rollback Plan
1. Keep UUID validation alongside new ID validation temporarily
2. Maintain database column size compatibility
3. Create reverse migration scripts
