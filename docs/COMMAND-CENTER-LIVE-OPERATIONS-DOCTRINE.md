# Command Center Live Operations Doctrine

## Status

Executive-approved blueprint amendment. The Kairos/MMG blueprint is temporarily unfrozen for this amendment only and refrozen after incorporation.

## Priority

P0. This is the next Command Center implementation priority and must be addressed before broad Command Center expansion continues.

## Purpose

The Command Center is the live operational center of the MMG ecosystem. It must oversee MMG and Kairos through real system state, real analytics, real workflow status, and real runtime signals.

## Governing Rule

Every dynamic visual element must correspond to actual operational telemetry, workflow state, analytics, or runtime intelligence. Decorative animation must never substitute for genuine system activity.

If something moves, pulses, counts, fills, rotates, streams, or changes state on the Command Center screen, it must be backed by real system data or an explicitly declared development stub that is replaced before operational status.

## Main Control Panel

The default Command Center view is the Main Control Panel.

It should present five primary parent cards representing the major operating domains of the MMG/Kairos ecosystem. Each parent card must show live operational indicators such as:

- Department health.
- Active jobs.
- Queue depth.
- Last activity.
- Pending approvals.
- Throughput.
- Alerts.
- System status.
- Journey or workflow progress.

The home view answers: what is happening across MMG right now?

## Parent Focus Mode

When a user selects one of the five parent cards, the content area below the parent-card row must switch into a focused collection view for that selected parent only.

Focused views must show only the selected parent/category's relevant modules, cards, analytics, jobs, documents, workflow queues, alerts, and operational content.

Unrelated modules should not remain visible in the focused view.

Every focused view must end with a clear return action, such as `Return to Main Control Panel` or `Return to Command Center Home`.

The navigation model is: Main Control Panel to Parent Focus View to Main Control Panel.

## Customer Release Gate Signals

The Command Center must surface customer-facing release gate signals wherever they affect executive action, publishing operations, customer access, or operational readiness.

Release gate signals exist to enforce the MMG/Kairos production-only asset doctrine:

- Intermediate assets, drafts, reusable components, AI generations, editable source files, and internal production materials remain inside the MMG/Kairos workspace by default.
- Only explicitly approved final deliverables may leave the production workspace.
- Release readiness must be represented as operational state, not as a visual decoration.

A release gate signal should include:

- Release or deliverable title.
- Current release state: ready, blocked, or reviewing.
- Number of blocked checks.
- Required action to unblock the release.
- Owning parent collection where the signal is operationally relevant.

The same release signal may appear in multiple parent collections when it affects multiple operating domains. For example, a blocked customer deliverable may be relevant to Executive, Publishing, Customers, and Operations simultaneously.

## Real Telemetry Requirement

The Command Center must be driven by telemetry from actual MMG/Kairos systems, including as the platform matures:

- API gateway activity.
- Kairos runtime requests.
- Department routing.
- Workflow execution.
- Background jobs.
- Publishing operations.
- Customer activity.
- Knowledge indexing.
- Search activity.
- Store and subscription events.
- Authentication events.
- AI inference requests.
- Approval gates.
- Customer release gates.
- Document processing.
- Production deployment and health events.

Development placeholders are permitted only when clearly isolated and architected behind interfaces that will be replaced with production telemetry before operational status.

## Event-Oriented Architecture

The Command Center should be event-oriented rather than page-only.

Canonical flow:

- MMG/Kairos services emit operational events.
- The telemetry layer aggregates them.
- The Command Center consumes a clean data contract.
- Live UI components render the resulting state.

Every subsystem should be able to publish structured operational events such as workflow queued, workflow started, workflow completed, workflow failed, approval requested, document uploaded, document parsed, knowledge indexed, customer created, search executed, payment received, subscription updated, runtime health changed, department heartbeat, release blocked, release approved, release published, and release gate failed.

## Processing Lifecycle Semantics

All long-running operations should expose standardized lifecycle states:

- queued
- initializing
- running
- processing
- waiting
- reviewing
- finalizing
- completed
- failed
- paused
- cancelled

Visual indicators must map consistently to those states across the Command Center.

## Runtime Status Components

The implementation should define reusable live-status components for:

- Live status pills.
- Progress rings.
- Queue indicators.
- Processing timelines.
- Activity streams.
- Department heartbeat indicators.
- System health panels.
- Event counters.
- Runtime timers.
- Throughput meters.
- Approval-gate cards.
- Customer release-gate cards.
- Error or attention cards.

These components should be reused across Command Center parent views and department-specific workspaces.

## Digital Twin Principle

The Command Center should function as a real-time operational representation of the MMG ecosystem.

It should reflect:

- Business health.
- Customer health.
- AI runtime health.
- Publishing health.
- Knowledge activity.
- Workflow progress.
- Infrastructure health.
- Financial and subscription activity where authorized.
- Operational risk and attention states.
- Customer release readiness.
- Production-only asset boundary health.

The Command Center should allow the executive user to understand, in seconds:

- What is happening now.
- What recently completed.
- What is queued.
- What is running.
- What is blocked.
- What needs approval.
- What failed.
- Which departments are healthy.
- Which departments require attention.
- Which customer deliverables are blocked from release.

## Visual Language Boundary

The Command Center may include motion-like visual language, but the motion must communicate state.

Approved examples:

- Pulse means active or live.
- Progress fill means measurable completion.
- Flowing line means data or workflow movement.
- Timer means elapsed or remaining runtime.
- Counter means live metric updates.
- Amber signal means waiting or attention.
- Red signal means failure or action required.
- Green completion effect means completed state.

Disallowed pattern:

- Cosmetic animation that implies activity when the underlying system has no activity.

## Operational Status Gate

Kairos should not be considered operational if the Command Center depends on fake activity indicators. Before operational status, live Command Center indicators must either be connected to real telemetry or explicitly marked as non-production placeholders behind replaceable interfaces.

Customer release indicators must never imply customer access is approved unless the underlying release gate has passed the production-only asset check, approval metadata check, final deliverable scope check, and customer publication check.

## Refreeze Statement

After this amendment is incorporated, the Kairos/MMG blueprint is refrozen with the Command Center Live Operations Doctrine as a governing baseline for Command Center architecture, backlog sequencing, and implementation acceptance.
