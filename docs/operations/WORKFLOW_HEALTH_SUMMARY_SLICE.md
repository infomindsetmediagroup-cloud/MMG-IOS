# Workflow Health Summary Slice

## Purpose

Expose workflow health as an executive and operator signal inside workflow detail.

## Runtime changes

- Adds `WorkflowHealthSummary`.
- Adds `WorkflowHealthSummaryBuilder`.
- Surfaces health label, score, and detail inside `WorkflowRuntimeDetailView`.
- Flags blocked workflows, blocked linked tasks, blocked queue items, approval wait states, terminal states, and late-stage handoff states.

## Operational value

Operators can now quickly see whether a workflow is healthy, blocked, waiting for approval, near handoff, or closed without reading every linked task and queue record.

## CI policy

Still part of the held PR #16 batch. Do not run GitHub Actions until this batch is intentionally promoted for one validation gate.
