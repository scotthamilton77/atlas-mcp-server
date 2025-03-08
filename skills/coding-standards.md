# Software Engineering Coding Standards: Coding Practices & Architecture Requirements

This document defines the software engineering standards that you as an expert developer should follow. These guidelines ensure consistent, high-quality code across our engineering organization through standardized patterns and practices. From feature-based modular architecture to TypeScript implementation details, these standards ensure our codebase remains maintainable, testable, and scalable as it grows.

All code contributions must adhere to these standards, which cover architecture, dependency management, error handling, security, quality assurance, and documentation. Each section provides clear requirements alongside practical implementation examples, with particular emphasis on our core pattern of atomically modular code organization. Following these standards is not optional—they represent our engineering team's collective commitment to technical excellence.

## Table of Contents

1. [Design & Architecture](https://claude.ai/chat/0db8e8a5-dfd9-4880-aad1-42783981a034#1-design--architecture)
2. [Dependency Management & IoC](https://claude.ai/chat/0db8e8a5-dfd9-4880-aad1-42783981a034#2-dependency-management--ioc)
3. [TypeScript Coding Best Practices](https://claude.ai/chat/0db8e8a5-dfd9-4880-aad1-42783981a034#3-typescript-coding-best-practices)
4. [Error Handling Strategy](https://claude.ai/chat/0db8e8a5-dfd9-4880-aad1-42783981a034#4-error-handling-strategy)
5. [Testing, Linting, and Quality Assurance](https://claude.ai/chat/0db8e8a5-dfd9-4880-aad1-42783981a034#5-testing-linting-and-quality-assurance)
6. [DevOps & Monitoring](https://claude.ai/chat/0db8e8a5-dfd9-4880-aad1-42783981a034#6-devops--monitoring)
7. [Security Best Practices](https://claude.ai/chat/0db8e8a5-dfd9-4880-aad1-42783981a034#7-security-best-practices)
8. [Version Control & Collaboration](https://claude.ai/chat/0db8e8a5-dfd9-4880-aad1-42783981a034#8-version-control--collaboration)
9. [Documentation](https://claude.ai/chat/0db8e8a5-dfd9-4880-aad1-42783981a034#9-documentation)
10. [Conclusion](https://claude.ai/chat/0db8e8a5-dfd9-4880-aad1-42783981a034#10-conclusion)

## 1. Design & Architecture

### Feature-Based Module Pattern

**Principle:** Organize your codebase by domain features rather than technical roles. Each feature should be self-contained with its own implementation, types, and exports.

**Guidelines:**

- **Atomic Modularity**: Each feature module should contain everything needed for that feature
- **Consistent Structure**: Follow a consistent pattern within each module
- **Clear Boundaries**: Minimize dependencies between feature modules
- **Local Types**: Keep type definitions close to where they're used

**Example Repository Layout:**

```
/src
  /config               // Environment & application configuration
    /index.ts           // Main export
    /types.ts           // Configuration types
  
  /features            
    /userManagement     // A complete feature domain
      /resources        // Data retrieval operations
        /getUserProfile
          /getUserProfile.ts
          /types.ts
          /index.ts
        /listUsers
          /listUsers.ts
          /types.ts
          /index.ts
      /tools            // Data manipulation operations
        /createUser
          /createUser.ts
          /types.ts
          /index.ts
        /updateUser
          /updateUser.ts
          /types.ts
          /index.ts
      /index.ts         // Feature exports
  
    /projectManagement  // Another feature domain
      // Similar structure
      
  /services             // External integrations
    /database
      /driver.ts
      /userService.ts
      /projectService.ts
      /types.ts
    /externalApi
      /client.ts
      /types.ts
      
  /types                // Global shared types
    /errors.ts
    /common.ts
    
  /utils                // Helper functions and utilities
    /errorHandler.ts
    /logger.ts
    /idGenerator.ts
    
  /di                   // Dependency Injection container
    /container.ts
    /types.ts
    
  /index.ts             // Application entry point
```

### Preventing Circular Dependencies

**Best Practice:** Design your module structure to prevent circular dependencies, which can cause runtime issues and complicate build processes.

**Detection:**

- Use tools like `madge` or `dpdm` to identify and visualize circular dependencies
- Integrate circular dependency checks into your CI pipeline

```bash
# Install detection tools
npm install --save-dev madge

# Check for circular dependencies
npx madge --circular src/
```

**Prevention Strategies:**

1. **Interface Segregation**: Break large interfaces into smaller, more focused ones
    
2. **Mediator Pattern**: Use a mediator service to coordinate between modules that would otherwise depend on each other
    

```typescript
// Mediator approach
// /src/mediators/userProjectMediator.ts
import { UserService } from '../services/database/userService';
import { ProjectService } from '../services/database/projectService';

export class UserProjectMediator {
  constructor(
    private userService: UserService,
    private projectService: ProjectService
  ) {}
  
  async assignUserToProject(userId: string, projectId: string): Promise<void> {
    const user = await this.userService.findUserById(userId);
    const project = await this.projectService.findProjectById(projectId);
    
    // Mediation logic
    if (user && project) {
      await this.userService.addProjectToUser(userId, projectId);
      await this.projectService.addUserToProject(projectId, userId);
    }
  }
}
```

1. **Extract Shared Types**: Move shared types to a neutral location

```typescript
// /src/types/common.ts
export interface Entity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

// Then import from this common location in feature modules
import { Entity } from '../../../types/common';
```

1. **Events and Pub/Sub**: Decouple modules by using event-based communication

```typescript
// Using an event emitter to decouple modules
import { EventEmitter } from 'events';

export const appEvents = new EventEmitter();

// In one module:
appEvents.emit('userCreated', { id: '123', name: 'John' });

// In another module:
appEvents.on('userCreated', (user) => {
  // React to user creation without direct dependency
});
```

## 2. Dependency Management & IoC

### Dependency Inversion Principle

**Principle:** High-level modules should not depend on low-level modules. Both should depend on abstractions.

**Implementation:**

1. **Define interfaces** for services and repositories
2. **Implement the interfaces** in concrete classes
3. **Consume the interfaces** in your feature modules

```typescript
// /src/services/database/interfaces.ts
export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  create(userData: NewUser): Promise<User>;
  update(id: string, data: Partial<User>): Promise<User>;
}

// /src/services/database/userRepository.ts
import { IUserRepository } from './interfaces';

export class UserRepository implements IUserRepository {
  constructor(private dbClient: DbClient) {}
  
  async findById(id: string): Promise<User | null> {
    // Implementation
  }
  
  // Other methods
}
```

### Dependency Injection

**Best Practice:** Use dependency injection to make your modules testable and maintainable.

**Approaches:**

1. **Constructor Injection**: Pass dependencies through constructors

```typescript
// features/userManagement/tools/createUser/createUser.ts
export class CreateUserService {
  constructor(
    private userRepository: IUserRepository,
    private logger: ILogger,
    private emailService: IEmailService
  ) {}
  
  async execute(userData: NewUser): Promise<User> {
    this.logger.info('Creating new user');
    const user = await this.userRepository.create(userData);
    await this.emailService.sendWelcomeEmail(user.email);
    return user;
  }
}
```

1. **DI Container**: Use a container to manage dependencies

```typescript
// /src/di/container.ts
import { Container } from 'inversify';
import { IUserRepository, IProjectRepository } from '../services/database/interfaces';
import { UserRepository } from '../services/database/userRepository';
import { ProjectRepository } from '../services/database/projectRepository';

const container = new Container();

// Bind interfaces to implementations
container.bind<IUserRepository>('UserRepository').to(UserRepository);
container.bind<IProjectRepository>('ProjectRepository').to(ProjectRepository);

export { container };
```

1. **Managing Cross-Feature Dependencies**:

```typescript
// /src/features/userManagement/index.ts
import { container } from '../../di/container';
import { CreateUserService } from './tools/createUser/createUser';
import { IUserRepository } from '../../services/database/interfaces';

// Factory function to create services with injected dependencies
export function createUserServiceFactory(): CreateUserService {
  const userRepository = container.get<IUserRepository>('UserRepository');
  const logger = container.get<ILogger>('Logger');
  const emailService = container.get<IEmailService>('EmailService');
  
  return new CreateUserService(userRepository, logger, emailService);
}
```

## 3. TypeScript Coding Best Practices

### Type vs Interface: When to Use Each

**Interface**:

- **Use for**:
    - Describing object shapes that will be implemented by classes
    - Public API contracts
    - When you need declaration merging
    - When extending other interfaces or classes

```typescript
// Good use of interface - representing an object with a specific structure
interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

// Good for implementation by a class
interface Repository<T> {
  findById(id: string): Promise<T | null>;
  findAll(): Promise<T[]>;
  create(data: Omit<T, 'id'>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
}

// Declaration merging - a useful interface feature
interface User {
  id: string;
  name: string;
}

// Later in code or in another file...
interface User {
  email: string; // Merges with the previous definition
}
```

**Type**:

- **Use for**:
    - Union types
    - Mapped types
    - Conditional types
    - Complex type manipulations
    - Type aliases for primitives
    - When you need to create a type based on other types

```typescript
// Union types
type Status = 'pending' | 'approved' | 'rejected';

// Mapped types
type Nullable<T> = { [P in keyof T]: T[P] | null };

// Conditional types
type ExtractId<T> = T extends { id: infer U } ? U : never;

// Complex manipulations
type UserWithoutSensitiveInfo = Omit<User, 'password' | 'securityQuestions'>;
```

**Guidelines**:

1. **Start with interfaces** for object shapes unless you need type-specific features
2. **Use types for unions**, intersections, and complex manipulations
3. **Be consistent** within your codebase
4. **Prefer interfaces for public APIs** as they provide better error messages

### Local Type Definitions

**Best Practice:** Keep type definitions close to their usage to maintain modularity and self-containment.

**Example:**

```typescript
// features/projectManagement/tools/createProject/types.ts
export interface CreateProjectRequest {
  name: string;
  description: string;
  ownerId: string;
  visibility: ProjectVisibility;
}

export enum ProjectVisibility {
  Public = 'public',
  Private = 'private',
  Team = 'team'
}

export interface CreateProjectResponse {
  id: string;
  name: string;
  created: boolean;
  timestamp: Date;
}
```

### Enable Strict Compiler Options

**Why:** Using "strict": true forces you to write safer code by catching potential issues at compile time.

**Snippet:**

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "esModuleInterop": true
  }
}
```

### Leverage Generics for Reusable, Type-Safe Code

**Why:** Generics allow you to write flexible functions and classes while preserving type safety.

**Snippet:**

```typescript
// utils/resultHandler.ts
export interface Result<T, E = Error> {
  success: boolean;
  data?: T;
  error?: E;
}

export function success<T>(data: T): Result<T> {
  return { success: true, data };
}

export function failure<E extends Error>(error: E): Result<never, E> {
  return { success: false, error };
}
```

## 4. Error Handling Strategy

### Domain Error Hierarchy

**Best Practice:** Create a structured error hierarchy that distinguishes between different types of errors.

```typescript
// /src/types/errors.ts
// Base application error
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus?: number
  ) {
    super(message);
    this.name = this.constructor.name;
    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// Domain errors - business rule violations
export class DomainError extends AppError {
  constructor(message: string, code: string) {
    super(message, code, 400); // Usually client errors
  }
}

// Validation errors
export class ValidationError extends DomainError {
  constructor(
    message: string,
    public readonly validationErrors: Record<string, string[]> = {}
  ) {
    super(message, 'VALIDATION_ERROR');
  }
}

// Not found errors
export class NotFoundError extends DomainError {
  constructor(entity: string, id: string) {
    super(`${entity} with ID ${id} not found`, 'NOT_FOUND');
    this.httpStatus = 404;
  }
}

// Infrastructure errors
export class InfrastructureError extends AppError {
  constructor(message: string, code: string) {
    super(message, code, 500); // Usually server errors
  }
}

// Database errors
export class DatabaseError extends InfrastructureError {
  constructor(message: string, public readonly originalError?: Error) {
    super(message, 'DATABASE_ERROR');
  }
}
```

### Result Pattern for Predictable Error Handling

**Best Practice:** Use a Result pattern to make error handling explicit and avoid throwing exceptions except for truly exceptional circumstances.

```typescript
// /src/utils/result.ts
export type Result<T, E extends Error = Error> = Success<T> | Failure<E>;

export class Success<T> {
  readonly isSuccess = true;
  readonly isFailure = false;
  
  constructor(readonly value: T) {}
  
  static create<T>(value: T): Success<T> {
    return new Success(value);
  }
}

export class Failure<E extends Error> {
  readonly isSuccess = false;
  readonly isFailure = true;
  
  constructor(readonly error: E) {}
  
  static create<E extends Error>(error: E): Failure<E> {
    return new Failure(error);
  }
}

// Helper functions
export const success = <T>(value: T): Success<T> => Success.create(value);
export const failure = <E extends Error>(error: E): Failure<E> => Failure.create(error);
```

### Using the Result Pattern

```typescript
// features/userManagement/tools/createUser/createUser.ts
import { Result, success, failure } from '../../../../utils/result';
import { ValidationError, DatabaseError } from '../../../../types/errors';
import { validateUserData } from './validation';
import { User, NewUser } from './types';

export async function createUser(userData: NewUser): Promise<Result<User, Error>> {
  // Validate input
  const validationResult = validateUserData(userData);
  if (!validationResult.valid) {
    return failure(new ValidationError('Invalid user data', validationResult.errors));
  }
  
  try {
    const user = await userRepository.create(userData);
    return success(user);
  } catch (error) {
    return failure(new DatabaseError('Failed to create user', error as Error));
  }
}
```

### API Error Handling Middleware

For API applications, centralize error handling with middleware:

```typescript
// /src/middleware/errorHandler.ts
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../types/errors';
import logger from '../utils/logger';

export function errorHandler(
  error: Error, 
  req: Request, 
  res: Response, 
  next: NextFunction
): void {
  // Determine status code
  const statusCode = error instanceof AppError 
    ? error.httpStatus || 500 
    : 500;
  
  // Determine error code
  const errorCode = error instanceof AppError 
    ? error.code 
    : 'INTERNAL_ERROR';
  
  // Log error details (sensitive info only in logs)
  logger.error('Request error', {
    path: req.path,
    method: req.method,
    errorName: error.name,
    errorMessage: error.message,
    errorCode,
    stack: error.stack
  });
  
  // Send response to client (no sensitive info)
  res.status(statusCode).json({
    error: {
      message: error.message,
      code: errorCode,
      // Include validation errors if available
      ...(error instanceof ValidationError && { 
        validationErrors: error.validationErrors 
      })
    }
  });
}
```

### Error Handling Best Practices

1. **Layer-Appropriate Handling**:
    
    - Domain layer: Use Result pattern for business logic errors
    - API layer: Use middleware for HTTP-specific handling
    - Infrastructure layer: Wrap external errors in domain-specific ones
2. **Error Boundaries**:
    
    - Create error boundaries at module edges
    - Convert external/infrastructure errors to application errors
3. **Logging**:
    
    - Log all errors with appropriate context
    - Include stack traces for unexpected errors
    - Use structured logging (JSON format)

## 5. Testing, Linting, and Quality Assurance

### Module-Based Testing

**Best Practice:** Structure your tests to match your module organization. Each feature module should have corresponding test files.

**Example Directory Structure:**

```
/src
  /features
    /userManagement
      /resources
        /getUserProfile
          /getUserProfile.ts
          /types.ts
          /index.ts
          /getUserProfile.test.ts  // Test alongside implementation
```

**Example Test:**

```typescript
// features/userManagement/resources/getUserProfile/getUserProfile.test.ts
import { getUserProfile } from './getUserProfile';
import { UserProfileRequest } from './types';
import { container } from '../../../../di/container';

// Get dependencies from DI container for testing
const userRepository = container.get('UserRepository');

// Mock dependencies
jest.mock('../../../../services/database/userRepository');

describe('getUserProfile', () => {
  it('should return the user profile when a valid ID is provided', async () => {
    // Arrange
    const mockUser = { id: '123', name: 'Test User', email: 'test@example.com' };
    (userRepository.findById as jest.Mock).mockResolvedValue(mockUser);
    
    // Act
    const request: UserProfileRequest = { userId: '123' };
    const result = await getUserProfile(request);
    
    // Assert
    expect(result.isSuccess).toBe(true);
    if (result.isSuccess) {
      expect(result.value).toEqual(mockUser);
    }
    expect(userRepository.findById).toHaveBeenCalledWith('123');
  });
});
```

### Linting and Formatting

**Best Practice:** Use ESLint (with the @typescript-eslint plugin) and Prettier to enforce consistent coding standards and style.

**Example (.eslintrc.json):**

```json
{
  "extends": ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "rules": {
    "@typescript-eslint/explicit-module-boundary-types": "error",
    "@typescript-eslint/no-explicit-any": "error",
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": ["error"],
    "import/no-cycle": "error" // Detect circular dependencies
  }
}
```

## 6. DevOps & Monitoring

### Continuous Integration / Continuous Deployment (CI/CD)

**Best Practice:** Automate building, testing, and deployment processes with CI/CD pipelines. Configure them to respect your modular architecture.

**Example GitHub Actions Workflow:**

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    - name: Use Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18.x'
    - name: Install dependencies
      run: npm ci
    - name: Lint
      run: npm run lint
    - name: Check for circular dependencies
      run: npx madge --circular src/
    - name: Build
      run: npm run build
    - name: Test
      run: npm test
```

### Structured Logging & Monitoring

**Best Practice:** Implement context-aware logging that respects your module boundaries.

**Snippet:**

```typescript
// utils/logger.ts
import winston from "winston";

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: "my-service" },
  transports: [new winston.transports.Console()]
});

export default logger;

// Usage in a feature module
// features/userManagement/tools/createUser/createUser.ts
import logger from '../../../../utils/logger';

export async function createUser(userData: NewUser): Promise<Result<User, Error>> {
  logger.info('Creating new user', { 
    module: 'userManagement',
    operation: 'createUser',
    userEmail: userData.email 
  });
  
  // Implementation...
}
```

## 7. Security Best Practices

### Modular Security Approach

**Best Practice:** Apply security practices at the module level for better encapsulation and protection.

- **Input Validation per Module:** Each module should validate its own inputs.

```typescript
// features/userManagement/tools/createUser/createUser.ts
import { validateUserData } from './validation';
import { NewUser, User } from './types';
import { Result, success, failure } from '../../../../utils/result';
import { ValidationError } from '../../../../types/errors';

export async function createUser(userData: NewUser): Promise<Result<User, Error>> {
  // Validate at module boundaries
  const validationResult = validateUserData(userData);
  if (!validationResult.valid) {
    return failure(new ValidationError('Invalid user data', validationResult.errors));
  }
  
  // Proceed with validated data
  // ...
}
```

### Handling Sensitive Data:

- **Externalize secrets:** Store API keys, passwords, and other sensitive data in environment variables or secure vaults.
    
- **Encryption:** Use encryption for sensitive data at rest and in transit.
    
- **Input Validation & Sanitization:** Validate and sanitize all user inputs to prevent injection attacks.
    

### Managing Dependencies Securely:

- **Use lock files:** Ensure you have lock files (package-lock.json or yarn.lock) to maintain consistent dependency versions.
    
- **Regular audits:** Use tools like npm audit, yarn audit, or Snyk to identify and remediate vulnerabilities.
    
- **Module-level dependencies:** Consider using local package.json files for feature-specific dependencies when possible.
    

## 8. Version Control & Collaboration

### Feature Branch Strategy

**Best Practice:** Align your branching strategy with your modular architecture.

- **Feature branches:** Create branches for specific feature modules being worked on.

```
feature/user-management-updates
feature/project-search-improvement
fix/dependency-module-bug
```

### Commit Message Conventions:

**Best Practice:** Use prefixes that reflect your module structure.

```
feat(user-management): add user activation feature
fix(project-tools): resolve issue with project deletion
docs(resources): update documentation for resource modules
```

### Code Reviews:

- **Module-Focused Reviews:** Organize code reviews around specific feature modules for more focused feedback.
    
- **Automated checks:** Integrate linting and testing in pull requests to enforce coding standards before merging.
    

## 9. Documentation

### Module Documentation

**Best Practice:** Document each module comprehensively to explain its purpose, responsibilities, and usage.

**Example:**

```typescript
/**
 * User Management Module
 * 
 * This module handles all user-related operations including:
 * - User profile retrieval
 * - User listing and searching
 * - User creation and updates
 * 
 * @module features/userManagement
 */

// features/userManagement/index.ts
export * from './resources/getUserProfile';
export * from './resources/listUsers';
export * from './tools/createUser';
export * from './tools/updateUser';
```

### Resource and Tool Documentation

**Best Practice:** Document each specific resource and tool with JSDoc.

```typescript
/**
 * Creates a new project in the system.
 * 
 * @param {CreateProjectRequest} request - The project creation request
 * @returns {Promise<Result<CreateProjectResponse, Error>>} Result containing the newly created project or an error
 * @throws {ValidationError} When project data fails validation
 * @throws {AuthorizationError} When user lacks permissions to create projects
 */
export async function createProject(request: CreateProjectRequest): Promise<Result<CreateProjectResponse, Error>> {
  // Implementation
}
```

### Automated Documentation Generation:

- **Tools:** Use tools like [TypeDoc](https://typedoc.org/) to generate and maintain up‑to‑date documentation from your TypeScript codebase.
    
- **Integration:** Incorporate documentation generation into your CI/CD pipeline to ensure that docs remain current with code changes.
    

## 10. Conclusion

By embracing the Feature-Based Module Pattern alongside TypeScript best practices, you can build applications that are:

- **Modular**: Each feature is self-contained and complete
- **Maintainable**: Clear boundaries and consistent structure
- **Scalable**: Easy to add new features without disrupting existing code
- **Testable**: Modules can be tested in isolation
- **Understandable**: New team members can quickly comprehend the structure

This approach, combined with proper dependency management, error handling, security practices, version control standards, and comprehensive documentation, creates a foundation for successful and sustainable project development.

Remember these key takeaways:

- **Organize by feature** rather than technical role
- **Use dependency injection** to manage cross-module dependencies
- **Apply the Result pattern** for predictable error handling
- **Choose types vs interfaces** appropriately for each use case
- **Prevent circular dependencies** through careful design
- **Keep type definitions local** to their usage
- **Maintain consistency** in module structure
- **Enforce clear boundaries** between modules
- **Document thoroughly** at module and function levels

Happy Coding!