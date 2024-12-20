# Atlas MCP Server Architecture

Atlas MCP Server is a Model Context Protocol server implementation focused on hierarchical task management. This document outlines the codebase structure and component relationships.

## Project Overview

The server provides task management capabilities through the Model Context Protocol, featuring:
- Hierarchical task management
- MCP server integration
- Tool handling
- Health monitoring
- Request tracing
- Rate limiting
- Metrics collection

## Directory Structure

### Core Components

#### `/config`
The configuration management system provides centralized configuration handling with validation:

**Core Features**
- **Environment Management**
  - Development/Production/Test environments
  - Environment variable integration
  - Default configuration values
  - Configuration overrides

- **Configuration Schema**
  - Zod-based schema validation
  - Type-safe configuration
  - Required field validation
  - Default value handling

- **Configuration Categories**
  - Logging configuration
    - Log levels
    - Transport options
    - File rotation settings
  - Storage configuration
    - Directory management
    - Session handling
    - Persistence settings

- **Advanced Features**
  - Configuration updates
  - Validation on changes
  - Environment variable loading
  - Singleton pattern
  - Error handling

**Implementation Details**
- Type-safe configuration access
- Hierarchical configuration merging
- Environment-specific defaults
- Runtime configuration updates
- Configuration validation

#### `/docs`
- `api.ts`: API documentation and specifications

#### `/errors`
The error handling system provides comprehensive error management with categorized error codes and detailed guidance:

**Error Categories**
- **Task Errors (1000-1999)**
  - Task not found
  - Validation failures
  - Dependency issues
  - Status transitions
  - Type validation
  - Parent-child relationships

- **Storage Errors (2000-2999)**
  - Read/write operations
  - Initialization issues
  - Data persistence
  - Recovery operations

- **Configuration Errors (3000-3999)**
  - Invalid configurations
  - Missing parameters
  - Type mismatches

- **Validation Errors (4000-4999)**
  - Schema validation
  - Input validation
  - State validation

- **Operation Errors (5000-5999)**
  - Failed operations
  - Timeouts
  - Concurrent modifications
  - Internal errors

**Error Handling Features**
- Detailed error messages with recovery suggestions
- Error code categorization
- Stack trace preservation
- Contextual error wrapping
- Type-safe error creation
- Zod validation integration
- User-friendly messages

#### `/logging`
The logging system provides comprehensive logging capabilities using Winston:

**Core Features**
- **Log Levels**
  - DEBUG: Detailed debugging information
  - INFO: General operational information
  - WARN: Warning messages
  - ERROR: Error conditions
  - FATAL: Critical failures

- **Structured Logging**
  - Timestamp tracking
  - Context enrichment
  - Error formatting
  - JSON output
  - Colorized console output

- **Transport Options**
  - Console logging
  - File-based logging
  - Error-specific logging
  - Log rotation support

- **Advanced Features**
  - Child loggers with context
  - Error stack traces
  - Custom formatting
  - Size-based rotation
  - File count management

**Implementation Details**
- Singleton pattern for global access
- Winston integration
- Configurable log levels
- Multiple transport support
- Error handling integration

#### `/server`
The server system provides core functionality for server operations and monitoring:

**Health Monitoring (`health-monitor.ts`)**
- **System Health Checks**
  - Memory usage monitoring
  - CPU usage tracking
  - Error rate analysis
  - Response time monitoring
  - Active request tracking

- **Threshold Management**
  - Memory thresholds (90%)
  - Error rate limits (10%)
  - Response time limits (5s)
  - Rate limiting checks
  - Resource utilization

- **Health Status Reporting**
  - Component-level health
  - System-wide metrics
  - Resource utilization
  - Performance indicators
  - Timestamp tracking

**Server Components**
- **Main Server (`index.ts`)**
  - Server initialization
  - Request handling
  - Component coordination
  - Lifecycle management
  - Error handling

- **Metrics Collection (`metrics-collector.ts`)**
  - **Request Metrics**
    - Total request counting
    - Error tracking and rates
    - Response time recording
    - Window-based aggregation
    - Real-time monitoring

  - **Performance Analysis**
    - Response time statistics
    - Percentile calculations (p95, p99)
    - Min/max/average metrics
    - Time-based windowing
    - Metric summarization

  - **Time Series Management**
    - Rolling window metrics (1 hour)
    - Automatic cleanup
    - Range-based queries
    - Timestamp tracking
    - Data retention

  - **Statistical Features**
    - Error rate calculation
    - Metric aggregation
    - Summary statistics
    - Custom time ranges
    - Performance trends

- **Rate Limiting (`rate-limiter.ts`)**
  - **Request Control**
    - Maximum request limits
    - Sliding window tracking (1 minute)
    - Request counting
    - Automatic cleanup
    - Threshold monitoring

  - **Window Management**
    - Time-based windows
    - Request filtering
    - Window sliding
    - Timestamp tracking
    - Expiration handling

  - **Limit Enforcement**
    - Request validation
    - Limit checking
    - Error throwing
    - Status reporting
    - Rate monitoring

  - **System Features**
    - Status reporting
    - Reset capability
    - Current usage tracking
    - Window configuration
    - Limit configuration

- **Request Tracing (`request-tracer.ts`)**
  - **Lifecycle Management**
    - Request start/end tracking
    - Duration calculation
    - Event recording
    - Error capturing
    - Metadata enrichment

  - **Trace Storage**
    - In-memory trace storage
    - Maximum trace limit (1000)
    - Time-based expiration (1 hour)
    - Automatic cleanup
    - Memory management

  - **Event Tracking**
    - Start events
    - End events
    - Error events
    - Timestamp tracking
    - Duration calculation

  - **Analysis Features**
    - Active request tracking
    - Error trace filtering
    - Time range queries
    - Statistical summaries
    - Performance metrics

  - **System Features**
    - Unique request IDs
    - Metadata support
    - Cleanup routines
    - Memory optimization
    - Trace management

#### `/storage`
The storage system provides robust data persistence with integrity checks and recovery mechanisms:

**Core Features**
- **File-based Storage**
  - Session-based storage
  - Atomic write operations
  - Data integrity validation
  - Backup management
  - Recovery mechanisms

- **Concurrency Management**
  - Lock-based synchronization
  - Transaction support
  - Timeout handling
  - Deadlock prevention
  - Automatic lock release

- **Data Integrity**
  - Checksum validation
  - Data versioning
  - Schema validation
  - Corruption detection
  - Automatic recovery

- **Backup System**
  - Automatic backups
  - Rotation management
  - Version tracking
  - Integrity verification
  - Recovery prioritization

**Advanced Features**
- **Error Handling**
  - Retry mechanisms
  - Exponential backoff
  - Transaction rollback
  - Error categorization
  - Recovery strategies

- **Data Migration**
  - Version detection
  - Schema updates
  - Backward compatibility
  - Migration tracking
  - Validation checks

**Implementation Details**
- Atomic file operations
- Directory structure management
- Permission handling
- Session isolation
- Cleanup routines

### Task Management

#### `/task/core`
Task management core functionality:

**Batch Processing**
- `batch/batch-processor.ts`: Handles batch operations on tasks
- `batch/batch-types.ts`: Type definitions for batch operations

**Caching**
- `cache/cache-manager.ts`: Task caching implementation
- `cache/cache-types.ts`: Cache-related type definitions

**Indexing**
- `indexing/index-manager.ts`: Task indexing and search
- `indexing/index-types.ts`: Index structure definitions

**Transactions**
- `transactions/transaction-manager.ts`: Transaction handling
- `transactions/transaction-types.ts`: Transaction type definitions

**Core Task Components**
- `dependency-validator.ts`: Task dependency validation
- `index.ts`: Core task functionality exports
- `status-manager.ts`: Task status management
- `task-store.ts`: Task persistence layer

### Tools and Types

#### `/tools`
Tool handling and integration:
- `handler.ts`: MCP tool request handling
- `index.ts`: Tool exports
- `schemas.ts`: Tool schema definitions
- `utils.ts`: Utility functions for tools

#### `/types`
Type definitions:
- `config.ts`: Configuration types
- `error.ts`: Error types
- `index.ts`: Type exports
- `logging.ts`: Logging types
- `task.ts`: Task-related types

#### `/validation`
The validation system provides comprehensive input validation and sanitization:

**Task Validation (`task.ts`)**
- Schema-based validation using Zod
- Strict type checking and runtime validation
- Input sanitization and security checks
- Hierarchical validation for nested structures

Key Features:
- **Schema Validation**
  - Task creation/update validation
  - Note content validation
  - Metadata validation
  - Dependency validation
  - Bulk operation validation

- **Input Sanitization**
  - HTML/script tag removal
  - Path traversal prevention
  - Length constraints
  - Character validation

- **Hierarchy Management**
  - Depth limit enforcement (max 5 levels)
  - Parent-child relationship validation
  - Circular dependency prevention
  - Subtask validation

- **Type Safety**
  - Strict type checking
  - Enum validation
  - UUID validation
  - Required field validation

**Other Validation Components**
- `config.ts`: Configuration schema validation
- `index.ts`: Validation utility exports
- `logging.ts`: Log format validation

### Root Files
- `index.ts`: Main entry point and server initialization
- `task-manager.ts`: Task management orchestration
- `types.ts`: Global type definitions

## Key Dependencies

- `@modelcontextprotocol/sdk`: MCP protocol implementation
- `winston`: Logging framework
- `zod`: Schema validation
- `uuid`: Unique identifier generation

## System Components

### Server Core (AtlasMcpServer)
The main server class orchestrates all components:
- Initializes configuration and components
- Sets up request handlers
- Manages server lifecycle
- Handles error conditions
- Provides graceful shutdown

### Task Management System

The task management system is built around the TaskStore class, which provides a robust implementation for managing hierarchical tasks. Key features include:

#### Core Task Operations
- **Task Creation and Updates**
  - Atomic task operations with transaction support
  - Hierarchical task relationships
  - Rich metadata and status tracking
  - Dependency validation and management

#### Performance Optimizations
- **Adaptive Caching**
  - In-memory task caching
  - Hit rate monitoring
  - Automatic cache optimization
  - Memory-aware cache management

- **Indexing System**
  - Multi-dimensional task indexing
  - Fast lookup by ID, status, and parent
  - Dependency relationship tracking
  - Efficient query operations

#### Data Consistency
- **Transaction Management**
  - ACID-compliant operations
  - Automatic rollback on failures
  - Operation logging and replay
  - Concurrent operation handling

- **Batch Processing**
  - Efficient bulk operations
  - Optimized memory usage
  - Progress tracking
  - Error handling with partial success

#### Status and Dependencies
- **Status Management**
  - Hierarchical status propagation
  - Dependency-based blocking
  - Automatic status updates
  - State transition validation

- **Dependency Validation**
  - Circular dependency prevention
  - Missing dependency detection
  - Dependency graph maintenance
  - Impact analysis for changes

#### Storage and Recovery
- **Persistent Storage**
  - File-based task persistence
  - Automatic backups
  - Recovery mechanisms
  - Data integrity checks

- **Session Management**
  - Multi-session support
  - Session isolation
  - Cross-session task visibility
  - Session cleanup handling

### Monitoring and Performance
- Health monitoring
- Request tracing
- Rate limiting
- Metrics collection
- Performance monitoring

### Storage and Persistence
- File-based storage
- Transaction support
- Data integrity protection
- Session management

## Security and Reliability Features

1. Rate Limiting
- Prevents abuse
- Configurable limits
- Request tracking

2. Health Monitoring
- Regular health checks
- System metrics
- Resource monitoring

3. Error Handling
- Centralized error management
- Graceful degradation
- Detailed error logging

4. Request Management
- Request tracing
- Timeout handling
- Active request tracking

## Development Tools

- TypeScript for type safety
- Jest for testing
- ESLint for code quality
- Continuous Integration support

## Integration Considerations and Challenges

### Component Coupling
1. **Server-Storage Interaction**
   - Storage operations are synchronous, potentially blocking server operations
   - File-based storage could become a bottleneck under high load
   - Consider implementing asynchronous storage operations

2. **Metrics-Health Integration**
   - Health checks depend on metrics collection
   - Potential circular dependency between health monitoring and metrics collection
   - Consider implementing event-based communication

3. **Rate Limiting-Tracing Coordination**
   - Rate limiting decisions need request trace context
   - Tracing overhead during rate limiting
   - Consider implementing a shared context system

### Performance Considerations
1. **Memory Management**
   - In-memory trace storage limited to 1000 traces
   - Memory pressure from concurrent operations
   - Consider implementing trace persistence

2. **Cleanup Coordination**
   - Multiple components running cleanup routines
   - Potential resource contention
   - Consider implementing coordinated cleanup scheduling

3. **Transaction Overhead**
   - ACID compliance adds overhead
   - Multiple transaction managers (storage, task)
   - Consider implementing optimistic concurrency control

### Scalability Challenges
1. **File System Limitations**
   - Single directory for task storage
   - Potential file system bottlenecks
   - Consider implementing sharding or database storage

2. **Request Processing**
   - Sequential request processing
   - Limited concurrent operation support
   - Consider implementing worker pools

3. **Resource Management**
   - Fixed rate limits and thresholds
   - Static configuration values
   - Consider implementing dynamic resource allocation

### Critical Recommendations
1. **Asynchronous Storage Operations**
   - Implement non-blocking file operations
   - Add operation queuing
   - Prevent request bottlenecks

2. **Memory Optimization**
   - Implement trace cleanup based on memory pressure
   - Add configurable trace limits
   - Optimize in-memory caching

3. **Efficient Cleanup**
   - Coordinate component cleanup routines
   - Implement smart scheduling
   - Prevent resource contention

4. **Transaction Optimization**
   - Implement lightweight transaction handling
   - Add optimistic locking for common operations
   - Reduce lock contention

5. **Request Processing**
   - Add basic request pooling
   - Implement request prioritization
   - Optimize concurrent operations

This architecture provides a robust foundation for task management while ensuring reliability, performance, and maintainability, but careful consideration should be given to these integration challenges when scaling the system.
