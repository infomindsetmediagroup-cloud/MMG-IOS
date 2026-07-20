# Documentation

This folder stores governing doctrine, standards, architecture notes, technical decisions, and operating documentation.

## Subfolders

```text
doctrine/       Constitutional amendments and operating doctrine.
architecture/   Platform architecture and system design records.
standards/      Code, content, design, QA, naming, and release standards.
decisions/      Architecture decision records and rationale.
workflows/      Repeatable production workflows and execution procedures.
```

## Active Doctrine Records

- `doctrine/customer-portal-design-studio-production-only-asset-doctrine.md` — Locks the Customer Portal Design Studio as an MMG/Kairos production workspace where generated, editable, intermediate, reusable, and source assets stay in-house by default and flow through the MMG production pipeline unless explicitly released as approved final deliverables.
- `doctrine/continuous-production-learning-doctrine.md` — Establishes that MMG/Kairos production work should learn from each implementation cycle and become more effective, efficient, accurate, reusable, and traceable until the finished product is complete.

## Active Architecture Records

- `architecture/kairos-command-center-intro-orchestration-layer.md` — Defines the Kairos login/command-center intro layer: dimmed dashboard overlay, pulsing Kairos emblem, typing/thinking indicator, narrated time-based greeting, daily rundown, two-checkpoint check-in/wrap-up modes, six-button routing, and fade transition into the main control panel.
- `architecture/kairos-two-checkpoint-executive-operating-cycle.md` — Defines the morning check-in and evening wrap-up/overnight approval cycle, including compressed executive decisions, daily queue formation, prior approval maturation, business health summaries, export/runtime summaries, and the six-button entry model.
- `architecture/executive-attention-doctrine.md` — Establishes that Kairos optimizes for executive attention rather than information volume.
- `architecture/kairos-department-reporting-standard.md` — Standardizes how all Kairos departments report upward into summaries, health status, decisions, risks, recommendations, and drill-down detail.
- `architecture/kairos-executive-decision-engine.md` — Defines the decision compression layer that turns department activity into concise executive decision packages for check-ins, wrap-ups, approvals, and health summaries.
- `architecture/kairos-system-health-framework.md` — Defines the Overall Health Check domains and executive scorecard model.
- `architecture/kairos-overnight-orchestration-engine.md` — Defines the controlled overnight work cycle between Evening Wrap-Up and Morning Check-In.
- `architecture/kairos-work-queue-lifecycle.md` — Defines canonical lifecycle states for tasks, projects, assets, approvals, and workflows.
- `architecture/kairos-executive-daily-briefing-standard.md` — Standardizes Morning Check-In and Evening Wrap-Up briefing order.
- `architecture/kairos-department-contract-standard.md` — Defines the minimum interface every Kairos department must implement.

## Active Standards Records

- `standards/kairos-production-session-standard.md` — Defines the standard operating process for MMG/Kairos production sessions, including repository context loading, coherent commits, indexing, exact reporting, and continuous process improvement.

## Active Decision Records

- `decisions/shopify-ai-toolkit-adoption.md` — Adopts Shopify's official AI Toolkit and Codex plugin as the canonical Shopify engineering layer while preserving Kairos runtime and mutation-governance boundaries.

## Active Workflow Records

- `workflows/shopify-ai-toolkit-operations.md` — Defines installation, privacy controls, least-privilege authentication, validation, governed execution, receipts, rollback, production gates, and troubleshooting for Shopify AI Toolkit operations.
