# Atlas MCP Server Architecture

## Overview
Atlas MCP Server is a task management system that provides robust functionality for handling tasks, sessions, and storage operations. The system is built with TypeScript and follows a modular architecture pattern.

## Directory Structure

### Core Components

#### `/config`
Configuration management system.

#### `/docs`
API documentation and specifications.

#### `/errors`
Error handling and custom error definitions.

#### `/logging`
Logging system implementation.

#### `/server`
Server-side functionality including:
- Health monitoring
- Metrics collection
- Rate limiting
- Request tracing

#### `/session`
Session management and handling.

#### `/storage`
Data persistence layer with:
- SQLite integration
- Migration management
- Connection handling
- Storage factory pattern

#### `/task`
Core task management functionality including:
- Batch processing
- Caching
- Indexing
- Session management
- Transaction handling
- Task storage
- Status management
- Dependency validation

#### `/tools`
Utility tools and handlers for:
- Session operations
- Schema validation
- General utilities

#### `/types`
TypeScript type definitions for:
- Configuration
- Error handling
- Logging
- Sessions
- Storage
- Tasks

#### `/utils`
General utility functions.

#### `/validation`
Input validation logic for:
- Configuration
- IDs
- Logging
- Tasks

## Detailed Component Analysis

### Entry Point (`src/index.ts`)

The main entry point of the Atlas MCP Server implements a robust task management server with the following key features:

#### Core Components
- **AtlasMcpServer Class**: Main server implementation that orchestrates all components
- **Configuration Management**: Environment-based configuration with storage directory settings
- **Component Initialization**: Systematic initialization of all subsystems
- **Error Handling**: Comprehensive error handling with logging and metrics

#### Key Features
1. **Server Management**
   - Graceful startup and shutdown procedures
   - Health monitoring with 30-second interval checks
   - Request timeout handling (30-second default)
   - Signal handling (SIGINT, SIGTERM)

2. **Request Processing**
   - Request tracing for debugging
   - Rate limiting (600 requests per minute)
   - Active request tracking
   - Tool handling middleware

3. **Monitoring & Metrics**
   - Health monitoring
   - Request metrics collection
   - Response time tracking
   - Error rate monitoring

4. **Integration Points**
   - Model Context Protocol SDK integration
   - Storage system initialization
   - Session management
   - Task management
   - Tool handling

#### Dependencies
The server integrates with multiple internal systems:
- Storage Management (`./storage/index.js`)
- Task Management (`./task-manager.js`)
- Tool Handling (`./tools/handler.js`)
- Session Management (`./session/index.js`)
- Logging (`./logging/index.js`)
- Configuration (`./config/index.js`)
- Rate Limiting (`./server/rate-limiter.js`)
- Health Monitoring (`./server/health-monitor.js`)
- Metrics Collection (`./server/metrics-collector.js`)
- Request Tracing (`./server/request-tracer.js`)

### Task Manager (`src/task-manager.ts`)

The TaskManager is a central component that coordinates all task-related operations with sophisticated features for task management, validation, and error handling.

#### Core Features

1. **Task Management**
   - Task creation (single and bulk)
   - Task updates and deletion
   - Subtask handling
   - Task tree management
   - Session tracking
   - Status management
   - Dependency validation

2. **Data Validation**
   - Input validation for task creation/updates
   - Hierarchy depth validation (max 5 levels)
   - Parent-child relationship validation
   - Dependency validation
   - Status transition validation

3. **Transaction Support**
   - Atomic bulk operations
   - Transaction management for task creation
   - Rollback capabilities
   - Concurrent operation handling

4. **Error Handling**
   - Comprehensive error tracking
   - Detailed error messages
   - Validation error handling
   - Transaction rollback on errors
   - Error logging with context

#### Key Components

1. **TaskStore**
   - Persistent storage interface
   - CRUD operations for tasks
   - Query capabilities (by status, ID)
   - Transaction support

2. **DependencyValidator**
   - Validates task dependencies
   - Prevents circular dependencies
   - Ensures dependency integrity

3. **StatusManager**
   - Manages task status transitions
   - Validates status changes
   - Handles cascading status updates

4. **Session Management**
   - Unique session tracking
   - Session-based task grouping
   - Session persistence

#### Integration Points
- Storage system for persistence
- Logging system for operation tracking
- Validation system for input verification
- Error handling system for consistent error management

### Storage System (`src/storage/`)

The storage system implements a unified approach to data persistence, handling both task and session data through a common interface.

#### Architecture Overview

1. **Unified Storage Interface**
   - Combined task and session storage
   - Abstract base class for implementations
   - Consistent error handling
   - Metrics and maintenance support

2. **Core Components**
   - **UnifiedStorageManager**: Primary interface combining task and session storage
   - **BaseUnifiedStorage**: Abstract base class for storage implementations
   - **UnifiedSqliteStorage**: SQLite-based implementation
   - **ConnectionManager**: Database connection handling
   - **Factory**: Storage manager creation and configuration

3. **Storage Features**
   - Task persistence (save, load, query)
   - Session management
   - Task list handling
   - Active state tracking
   - Backup management
   - Maintenance operations
   - Storage metrics

4. **Data Operations**
   - Atomic transactions
   - Bulk operations
   - Status-based queries
   - Hierarchical data handling (subtasks)
   - Session state persistence

5. **Reliability Features**
   - Error handling with custom error types
   - Retry mechanisms
   - Backup management
   - Connection pooling
   - Transaction support

#### Configuration Options
- Base directory specification
- Session management
- Retry policies
- Backup settings
- Storage backend selection (SQLite/custom)

#### Integration Points
- Task management system
- Session management
- Configuration system
- Error handling
- Metrics collection

### Session Management System (`src/session/`)

The session management system provides a robust framework for handling user sessions and task lists, integrating closely with the unified storage system.

#### Architecture Overview

1. **Core Components**
   - **SessionSystem**: Main orchestrator for session management
   - **DefaultSessionManager**: Handles session operations and state
   - **SessionToolHandler**: Provides MCP tool interface for session operations
   - **UnifiedSqliteStorage**: Persistent storage for session data

2. **Key Features**
   - Session initialization and cleanup
   - Tool handling for session operations
   - Integration with unified storage
   - Logging and error handling
   - Session state management

3. **Component Lifecycle**
   - Systematic initialization sequence
   - Resource cleanup on shutdown
   - State validation
   - Error recovery

4. **Integration Points**
   - Unified storage system
   - Task management
   - Logging system
   - Tool handling system
   - Configuration management

#### Session Management Features
- Session creation and deletion
- Task list management within sessions
- Session state persistence
- Tool-based session operations
- Session configuration handling

#### Error Handling
- Initialization error management
- Resource cleanup
- State validation
- Logging and monitoring
- Error recovery procedures

### Server Health Monitoring (`src/server/health-monitor.ts`)

The health monitoring system provides comprehensive monitoring of server health metrics and status through various indicators.

#### Core Features

1. **Health Metrics Tracking**
   - Memory usage monitoring with heap analysis
   - CPU utilization tracking (user/system time)
   - Active request counting and tracking
   - Error rate calculation with thresholds
   - Response time monitoring with latency analysis
   - Rate limiter status and effectiveness

2. **Threshold Management**
   - Memory threshold (90% of heap total)
   - Error rate threshold (10% of total requests)
   - Response time threshold (5 seconds max)
   - Rate limiter thresholds (600 req/min)
   - Component health thresholds

3. **Health Status Components**
   - Server health status
     * Memory metrics (used, total, percentage)
     * CPU metrics (user time, system time)
     * Active requests count
     * Overall server health indicator
   - Rate limiter status
     * Current request rate
     * Rate limit compliance
     * Window-based monitoring
     * Throttling effectiveness
   - Performance metrics
     * Request counts (total/active)
     * Error rates with thresholds
     * Average response times
     * Resource utilization stats

4. **Monitoring Capabilities**
   - Real-time health checks (continuous monitoring)
   - Component-level health status tracking
   - Threshold-based alerts and warnings
   - Resource usage tracking and analysis
   - Performance monitoring with statistics
   - Early warning system for degradation

#### Health Check Features
- Comprehensive system status
- Component-level health indicators
- Resource utilization metrics
- Performance statistics
- Timestamp tracking

#### Integration Points
- Memory management system
- CPU monitoring
- Request tracking
- Rate limiting system
- Metrics collection
- Error tracking

### Metrics Collection System (`src/server/metrics-collector.ts`)

The metrics collection system provides comprehensive tracking and analysis of server performance metrics with sophisticated statistical capabilities.

#### Core Features

1. **Metric Types**
   - Request counts
   - Error tracking
   - Response time measurements
   - Error rate calculations
   - Time-windowed metrics

2. **Statistical Analysis**
   - Average response times
   - Percentile calculations (p95, p99)
   - Min/max values
   - Metric summaries
   - Time-range analysis

3. **Time Window Management**
   - Rolling 1-hour window
   - Automatic cleanup
   - Time-range filtering
   - Metric window maintenance
   - Historical data management

4. **Data Collection**
   - Response time recording
   - Error tracking
   - Request counting
   - Metric windowing
   - Data cleanup

#### Key Capabilities

1. **Performance Metrics**
   - Request throughput
   - Error rates
   - Response time statistics
   - Performance trends
   - Load analysis

2. **Statistical Features**
   - Percentile calculations
   - Average computations
   - Min/max tracking
   - Count aggregation
   - Time-based filtering

3. **Management Features**
   - Metric reset capability
   - Window size configuration
   - Automatic cleanup
   - Range-based queries
   - Summary generation

#### Integration Points
- Health monitoring system
- Request processing
- Error handling
- Performance tracking
- System diagnostics

### Rate Limiting System (`src/server/rate-limiter.ts`)

The rate limiting system provides request throttling capabilities to prevent server overload and ensure fair resource usage.

#### Core Features

1. **Request Throttling**
   - Time-window based limiting
   - Request counting
   - Automatic cleanup
   - Configurable limits
   - Window management

2. **Time Window Management**
   - 1-minute sliding window
   - Request timestamp tracking
   - Automatic window cleanup
   - Window size configuration
   - Request filtering

3. **Status Monitoring**
   - Current request count
   - Limit configuration
   - Window size tracking
   - Usage statistics
   - Reset capabilities

#### Implementation Details

1. **Rate Limiting Logic**
   - Request timestamp tracking
   - Window-based filtering
   - Limit enforcement
   - Error handling
   - Status reporting

2. **Configuration Options**
   - Maximum requests per window
   - Window duration (60 seconds)
   - Reset functionality
   - Status monitoring
   - Error messaging

#### Integration Points
- Request processing pipeline
- Error handling system
- Health monitoring
- Metrics collection
- System diagnostics

### Request Tracing System (`src/server/request-tracer.ts`)

The request tracing system provides comprehensive request lifecycle tracking and debugging capabilities with sophisticated trace management.

#### Core Features

1. **Request Lifecycle Tracking**
   - Request start/end timestamps with microsecond precision
   - Duration measurement and analysis
   - Event sequence recording with ordering
   - Rich metadata enrichment capabilities
   - Real-time trace updates and monitoring
   - Cross-component correlation

2. **Trace Management**
   - Maximum trace limit enforcement (1000 traces)
   - Time-based cleanup with 1-hour TTL
   - Automatic trace pruning for memory efficiency
   - Memory-optimized trace storage
   - Trace persistence and recovery
   - Trace integrity verification

3. **Event Recording**
   - Start/end event correlation
   - Error event capture with context
   - Custom event type support
   - Metadata enrichment per event
   - Timestamp synchronization
   - Event ordering guarantees

4. **Analysis Capabilities**
   - Comprehensive trace summaries
   - Error pattern analysis
   - Duration statistics and trends
   - Active request monitoring
   - Historical data analysis
   - Performance bottleneck detection

#### Key Components

1. **Trace Data Structures**
   - Request trace objects with full context
   - Hierarchical event storage
   - Extensible metadata system
   - Error correlation tracking
   - High-precision timing data
   - Resource usage metrics

2. **Management Features**
   - Automatic trace lifecycle management
   - Configurable trace limits
   - TTL-based cleanup scheduling
   - Memory usage optimization
   - Efficient data pruning
   - Trace data compression

3. **Analysis Tools**
   - Time-range based filtering
   - Error trace pattern detection
   - Statistical summary generation
   - Real-time trace monitoring
   - Completion rate tracking
   - Performance trend analysis

#### Integration Points
- Request processing pipeline
- Error handling system
- Performance monitoring
- Debugging tools
- System diagnostics

### Validation System (`src/validation/`)

The validation system provides comprehensive input validation and type checking across the application.

#### Core Features

1. **Validation Framework**
   - Zod schema integration
   - Type-safe validation
   - Custom validator creation
   - Safe parsing utilities
   - Error formatting

2. **Validation Utilities**
   - Type checking
   - Format validation
   - Pattern matching
   - Range validation
   - Constraint checking

3. **Common Validators**
   - String validation
   - Number validation
   - Date validation
   - UUID validation
   - Email validation
   - URL validation
   - Array uniqueness
   - Required properties

#### Implementation Details

1. **Validation Types**
   - Safe validators (with result objects)
   - Throwing validators
   - Custom validation rules
   - Validation result formatting

2. **Error Handling**
   - Detailed error messages
   - Path tracking
   - Error aggregation
   - User-friendly formatting
   - Recovery suggestions

#### Integration Points
- Task validation
- Configuration validation
- Input sanitization
- Error handling
- Type safety enforcement

### Error Handling System (`src/errors/`)

The error handling system provides a sophisticated error management framework with categorized errors and detailed guidance.

#### Core Features

1. **Error Categorization**
   - Task errors (1000-1999)
   - Storage errors (2000-2999)
   - Configuration errors (3000-3999)
   - Validation errors (4000-4999)
   - Operation errors (5000-5999)

2. **Error Types**
   - BaseError
   - TaskError
   - ConfigError
   - StorageError
   - ValidationError

3. **Error Information**
   - Error codes
   - Detailed messages
   - Recovery suggestions
   - Error context
   - Stack traces

#### Implementation Details

1. **Error Creation**
   - Factory functions
   - Context wrapping
   - Type guards
   - Error handlers
   - Message formatting

2. **Error Handling Features**
   - User-friendly messages
   - Detailed suggestions
   - Error categorization
   - Context preservation
   - Error wrapping

3. **Integration Support**
   - Custom error handlers
   - Error logging
   - Error transformation
   - Recovery guidance
   - Debug information

#### Integration Points
- Validation system
- Task management
- Storage operations
- Configuration handling
- Request processing

### API Documentation System (`src/docs/api.ts`)

The API documentation system provides comprehensive documentation for the server's public API, including interfaces, tools, error codes, and configuration options.

#### Core Features

1. **API Documentation**
   - Task Management API
   - Session Management API
   - Tool Schemas
   - Error Codes
   - Configuration Options

2. **Documentation Components**
   - Interface definitions
   - Best practices
   - Usage examples
   - Error handling guidance
   - Configuration schemas

3. **Configuration Documentation**
   - Server configuration
   - Storage configuration
   - Logging configuration
   - Security configuration

#### Implementation Details

1. **Task API Documentation**
   - Task creation
   - Task updates
   - Status management
   - Dependency handling
   - Error scenarios

2. **Session API Documentation**
   - Session creation
   - Task list management
   - Best practices
   - Configuration options
   - Error handling

3. **Configuration Documentation**
   - Schema definitions
   - Default values
   - Best practices
   - Environment-specific settings
   - Security considerations

### Task Core Subsystems (`src/task/core/`)

The task core subsystems provide specialized functionality for task management and processing.

#### Batch Processing (`batch/`)
- Batch operation handling
- Task grouping
- Bulk processing
- Error aggregation
- Transaction support

#### Cache Management (`cache/`)
- Task caching
- Performance optimization
- Cache invalidation
- Memory management
- Cache statistics

#### Indexing System (`indexing/`)
- Task indexing
- Search optimization
- Index maintenance
- Query performance
- Index statistics

#### Transaction Management (`transactions/`)
- ACID compliance
- Atomic operations
- Rollback support
- Concurrent access
- Transaction isolation

### Integration Considerations

During the architecture analysis, several integration points require attention:

#### Session Management Integration
1. **File Organization**
   - Duplicate session index files need consolidation
   - Session logic is split between `/session` and `/task/core/session`
   - Consider unifying session management in one location

2. **State Management**
   - Session state synchronization between components
   - Potential race conditions in session operations
   - Need for distributed session locking mechanism

#### Storage Layer Integration
1. **Abstraction Complexity**
   - Multiple storage abstraction layers increase complexity
   - Consider simplifying the storage hierarchy
   - Need clearer boundaries between storage implementations

2. **Migration Management**
   - Migration system is decoupled from main storage
   - Version synchronization needs improvement
   - Consider tighter integration with storage managers

#### Task Core Integration
1. **Subsystem Coordination**
   - Batch, cache, and indexing systems need better coordination
   - Transaction boundaries across subsystems
   - Consider adding a task core coordinator

2. **Cache Consistency**
   - Cache invalidation in distributed operations
   - Cache synchronization across components
   - Need for cache coherency protocol

#### Recommended Improvements
1. **Session Management**
   - Consolidate session files
   - Implement distributed locking
   - Improve state synchronization

2. **Storage Layer**
   - Simplify storage abstractions
   - Integrate migration management
   - Improve version control

3. **Task Core**
   - Add coordination layer
   - Implement cache coherency
   - Strengthen transaction boundaries
