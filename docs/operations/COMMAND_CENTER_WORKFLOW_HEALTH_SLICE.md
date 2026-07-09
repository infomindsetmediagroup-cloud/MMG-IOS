# Command Center Workflow Health Slice

## Purpose

Surface workflow health at the executive Command Center level instead of requiring operators to inspect each workflow individually.

## Runtime changes

- Adds `CommandCenterWorkflowHealthSummary`.
- Adds `CommandCenterWorkflowHealthSummaryBuilder`.
- Adds a Workflow Health section to `CommandCenterRuntimeSummaryView`.
- Includes average workflow health, healthy count, blocked count, approval count, near-handoff count, and closed count.
- Includes an executive summary that prioritizes blocked workflows, approval queues, and late-stage handoffs.

## Operational value

The Command Center can now identify runtime attention areas across the whole workflow system.

## CI policy

Still held inside PR #16. Do not run GitHub Actions until the batch is promoted for one validation gate.
