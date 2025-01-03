# Task Creation

Tasks are created with a unique path and flexible metadata structure. Dependencies and parent-child
relationships are validated during creation, with automatic project path extraction from the task
path. Metadata is JSON-compliant with no schema restrictions beyond size limits, allowing for custom
fields and data structures.

## Best Practices

Use hierarchical paths to organize related tasks (e.g., project/backend/auth). Keep metadata size
reasonable (under 100KB) despite flexible schema. Document dependencies explicitly to maintain clear
task relationships.
