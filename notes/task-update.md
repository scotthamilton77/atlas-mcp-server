# Task Updates

Updates are validated against the state machine rules while preserving existing task data and
relationships. The system tracks all changes through versioning and timestamps, with automatic
status propagation for dependent tasks. Metadata updates are unrestricted as long as they maintain
valid JSON structure and size limits.

## Best Practices

Use appropriate note categories (planning, progress, completion, troubleshooting) to maintain clear
history. Update dependencies before changing task status to prevent blocking states. Consider impact
on dependent tasks before making status changes.
