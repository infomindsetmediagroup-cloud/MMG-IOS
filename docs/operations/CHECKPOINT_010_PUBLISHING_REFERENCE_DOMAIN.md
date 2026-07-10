# MMG/Kairos Checkpoint 010 — Publishing Reference Domain

**Status:** Active implementation; validation pending  
**Branch:** `checkpoint-010-publishing-reference`  
**Baseline:** Checkpoint 009 Platform Services foundation merged into `main` under Constitution v1.0

## Objective

Establish Publishing as the first canonical reference domain built on the shared Platform Services contracts. This checkpoint must demonstrate composition of workflow, asset, knowledge, audit, notification, and event capabilities without introducing a parallel domain-specific platform.

## First implementation slice

- tenant-scoped publishing project and manuscript contracts
- canonical publishing lifecycle
- workflow factory that produces a governed `WorkflowDefinition`
- explicit editorial, design, production, approval, and release gates
- production-only asset handling consistent with the Design Studio doctrine
- release authorization separated from production completion
- domain fact events suitable for future event-bus publication
- no external publishing, retailer submission, billing, or file delivery side effects

## Canonical lifecycle

1. intake
2. manuscript_development
3. editorial_review
4. design_and_formatting
5. production_review
6. executive_approval
7. release_ready
8. released

A project may not enter `released` without an explicit approval record. Intermediate and editable assets remain `internal` unless approved as deliverables or released through a governed action.

## Constitutional boundaries

- Publishing consumes Platform Services; it does not duplicate them.
- Kairos coordinates objectives and plans but does not bypass approval gates.
- All records are tenant-scoped.
- Event envelopes report facts and do not authorize commands.
- External publication remains prohibited in this checkpoint.
- Checkpoint 006 remains the certified rollback baseline until later checkpoints are validated and frozen.

## Validation required before merge

1. TypeScript build.
2. Publishing lifecycle transition tests.
3. Workflow factory step and dependency tests.
4. Tenant-isolation tests.
5. Release-without-approval rejection test.
6. Intermediate-asset release-policy test.
7. Constitutional architecture review.

## Deliberate exclusions

- production database persistence
- retailer or marketplace APIs
- customer-facing file downloads
- autonomous publication
- financial transactions
- print ordering
- email delivery
- durable audit storage

All active-development commits should use `[skip ci]` until one deliberate validation run is approved.