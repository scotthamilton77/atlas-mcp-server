# Task Maintenance

State transitions follow a strict state machine pattern (PENDING → IN_PROGRESS → COMPLETED) with
dependency validation but flexible metadata. Task updates maintain version history and timestamps
automatically. Only incomplete dependencies can block task completion, while metadata fields remain
unrestricted for maximum flexibility.

## Best Practices

Regularly check and update task status to reflect actual progress. Use blocking status for
dependency issues rather than cancellation. Keep completion notes focused on deliverables and
outcomes rather than progress details.
