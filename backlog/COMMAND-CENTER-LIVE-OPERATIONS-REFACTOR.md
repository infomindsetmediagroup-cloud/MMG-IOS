# Command Center Live Operations Refactor

## Status

P0 next immediate work item.

## Authority

This item implements `docs/COMMAND-CENTER-LIVE-OPERATIONS-DOCTRINE.md`.

## Objective

Build the Command Center around real platform state. The interface should show live operational information through clear data contracts, reusable status components, and focused parent views.

## Scope

### Main Control Panel

Create a default Command Center home state with five primary parent cards.

Each card should display available live indicators for:

- Health
- Active items
- Queue depth
- Last activity
- Pending approvals
- Throughput
- Alerts
- Progress

### Parent Focus Mode

Selecting a parent card switches the lower content area into that parent only.

Focused mode requirements:

- Show only content relevant to the selected parent.
- Hide unrelated groups while focused.
- Preserve a clear path back to the main screen.
- Include a return button at the bottom of every focused view.

Accepted labels:

- Return to Main Control Panel
- Return to Command Center Home

### Customer Release Gate Signal Surface

Expose customer release gate signals in Command Center telemetry and UI when a customer-facing deliverable is blocked, reviewing, or ready.

The release gate signal surface must support:

- Cross-parent visibility for Executive, Publishing, Customers, and Operations when the same blocked deliverable affects more than one domain.
- A clear status label: ready, blocked, or reviewing.
- Blocked check count.
- Required action text.
- A reusable release-gate card treatment that can be replaced with production telemetry without UI redesign.

This surface implements the production-only asset doctrine by preventing the Command Center from implying that draft assets, intermediate work, or internal production materials are ready for customer access.

### Live State Contracts

Define stable data contracts for:

- Department health
- Workflow status
- Job status
- Queue metrics
- Activity stream items
- Approval requests
- Customer release gate signals
- Runtime health
- Knowledge processing
- Publishing processing
- Customer activity

### Shared Processing States

Use this shared state model:

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

### Reusable Components

Create reusable components for:

- Status pill
- Progress ring
- Queue indicator
- Processing timeline
- Activity stream
- Department heartbeat
- System health panel
- Event counter
- Runtime timer
- Throughput meter
- Approval card
- Customer release-gate card
- Attention card

### Development Data Adapter

If final telemetry is not ready, use an isolated development data adapter behind the same interface.

Rules:

- Development data must be clearly isolated.
- Development data must not be represented as production truth.
- Production telemetry must be able to replace the development adapter without UI redesign.

## Acceptance Criteria

- Command Center has a Main Control Panel state.
- Parent cards switch lower content into focused parent views.
- Focused views include a return control.
- Dynamic visuals use a state contract or isolated development adapter.
- Shared states are represented consistently.
- Status components are reusable.
- Release-gate signals render where blocked customer deliverables affect executive, publishing, customer, or operations state.
- Release-gate telemetry exposes status, blocked check count, and required action.
- No visual activity is treated as production truth unless backed by real state.

## Implementation Order

1. Add live-state contracts.
2. Add shared state types.
3. Add development data adapter.
4. Add Main Control Panel state.
5. Add five parent cards.
6. Add selected-parent focus mode.
7. Add return control.
8. Add reusable status components.
9. Add customer release-gate telemetry signals.
10. Add reusable release-gate cards.
11. Replace static placeholders with state-backed views.
