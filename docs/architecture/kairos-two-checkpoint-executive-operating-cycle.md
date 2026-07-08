# Kairos Two-Checkpoint Executive Operating Cycle

## Status

Approved MMG/Kairos operating architecture for the dashboard, command center, customer portal, backend runtime, and future iOS interface.

## Core Principle

Kairos should minimize executive friction. The system should not require the executive user to constantly manage every task, asset, workflow, or decision manually.

The operating model is built around two primary executive inputs per day:

1. Morning Check-In
2. Evening Wrap-Up / Overnight Approval

Most executive decisions should be reduced to clear approval choices, primarily yes/no or approve/reject/hold, with enough context for the executive to make the decision quickly.

## Morning Check-In

The morning check-in is the start-of-day control point.

Kairos should compile the morning briefing from:

- The previous evening wrap-up
- Overnight work completed by Kairos
- Approved pending work from prior days
- Tasks that matured into the active queue
- Historical project context
- Business trajectory and current metrics
- Active production, publishing, growth, customer, and system workflows
- Blockers, alerts, approvals, or risks that require attention

The morning check-in should give the executive user a complete but compressed view of what matters today.

## Morning Output

The morning check-in should present:

- Daily executive summary
- Current business/system health snapshot
- Priority to-dos
- Recommended starting point
- Pending approvals
- Work prepared overnight
- Content/assets/projects ready for review
- Items that moved forward from previous approvals
- Risks, blockers, or stalled workflows
- Recommended operating path for the day

The user should be able to approve the day’s operating queue and enter the dashboard from the briefing.

## Evening Wrap-Up

The evening wrap-up is the end-of-day operating summary and next-cycle approval point.

Kairos should summarize:

- What was completed
- What was started but not completed
- What changed during the day
- Business metrics and trajectory
- Production movement
- Publishing movement
- Growth/marketing movement
- Customer/project status changes
- Exports, deliverables, assets, or release packages generated
- Decisions made
- Items requiring next-day attention
- Errors, blockers, risks, and quality issues

The evening wrap-up should feel like a professional runtime summary from a serious operating system.

## Overnight Approval Cycle

At the end of the evening wrap-up, Kairos should present the proposed overnight work cycle.

The executive user should be able to approve, reject, revise, or hold the overnight cycle.

Overnight work may include:

- Preparing next-day task queues
- Drafting content
- Organizing assets
- Preparing production packages
- Summarizing customer/project work
- Compiling reports
- Generating review queues
- Creating proposed campaigns
- Preparing publishing assets
- Updating internal records
- Flagging risks and approvals for the morning

Kairos may prepare work and recommendations, but execution that requires executive approval should remain gated until approved.

## Multi-Day Approval Flow

Not every approved item enters the active queue immediately.

Kairos should allow approvals from prior days to mature into the active pipeline when timing, dependencies, sequencing, or project status make them ready.

This means the daily queue can be composed from:

- Work completed the previous day
- Overnight preparation
- Earlier approvals
- Pending assets now ready for production
- Scheduled content
- Deferred projects
- Customer/project milestones
- Business priority changes

The system should preserve approval history and explain why an item entered the current day’s queue.

## Six-Button Entry Model

The morning check-in and intro layer should route the user through six primary entry choices:

1. Overall Health Check
2. Parent Card 1
3. Parent Card 2
4. Parent Card 3
5. Parent Card 4
6. Parent Card 5

The first button provides a full-system snapshot across the business, dashboard, metrics, workflows, risks, and current operating condition.

The other five buttons route directly into the five parent-card sections of the command center.

This preserves both executive overview and direct operational entry.

## Overall Health Check

The Overall Health Check should provide a quick cross-system snapshot without requiring the user to open each individual parent card.

It should summarize:

- Business health
- Workflow health
- Production health
- Publishing health
- Growth/marketing health
- Customer/project health
- Financial or metrics indicators where available
- System risks
- Blockers
- Approval load
- Recommended next action

The health check should be scannable, actionable, and suitable for fast executive decision-making.

## Parent Card Routing

The five parent cards remain the primary command-center architecture.

The exact naming may evolve, but each parent card should represent a major operating lane. Kairos should be able to summarize each lane at the daily check-in level and route the user directly into the lane when selected.

Each parent card should support:

- Current status
- Active queue
- Pending approvals
- Completed work
- Blockers
- Recommended next action
- Related assets/projects
- Relevant metrics

## Decision Compression Doctrine

Kairos should convert complex operational context into concise executive decisions.

Preferred decision forms:

- Approve
- Reject
- Hold
- Revise
- Escalate
- Open details

The executive should not be forced into unnecessary micro-management unless a workflow is high-risk, legally sensitive, financially material, customer-facing, brand-critical, or explicitly configured for manual control.

## Data and Audit Requirements

The operating cycle should preserve:

- Morning briefing records
- Evening wrap-up records
- Approval history
- Overnight-cycle instructions
- Queue changes
- Export logs
- Asset movement
- Decision provenance
- Metrics snapshots
- Blocker/risk history
- System health history

This allows Kairos to explain what happened, why it happened, when it entered the queue, and what approval authorized it.

## Product Doctrine

Kairos should operate like an executive command system with disciplined daily cadence.

The user should be able to check in twice per day, approve the right work, understand the state of the business, and let Kairos prepare the next cycle.

The goal is not constant manual supervision. The goal is controlled autonomy: Kairos does the organization, preparation, summarization, routing, and queue-building, while the executive user supplies the key approvals that keep the system aligned.

## Implementation Notes

This architecture may ship progressively:

1. Static morning/evening check-in screens.
2. Manual daily summary and wrap-up records.
3. Six-button entry model.
4. Approval queue and overnight-cycle proposal.
5. Persistent check-in history.
6. Metrics and export summaries.
7. Context-aware queue building.
8. Automated Kairos overnight preparation.
9. Role-specific and workspace-specific check-ins.

The first production version can be deterministic and data-backed without requiring full autonomous runtime. Later versions should connect to Kairos task data, project records, asset registries, production history, publishing workflows, business metrics, and user preferences.