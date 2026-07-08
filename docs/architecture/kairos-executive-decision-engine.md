# Kairos Executive Decision Engine

## Status

Approved architecture record.

## Purpose

The Executive Decision Engine is the layer that converts department activity into a concise executive queue.

It supports the Morning Check-In, Evening Wrap-Up, Overall Health Check, and command-center routing system.

## Decision Classes

1. Autonomous: routine work that Kairos may prepare or organize without executive action.
2. Inform: useful status updates that do not require a decision.
3. Recommend: Kairos proposes an action for executive review.
4. Approval Required: action should pause until the executive approves, revises, or holds it.
5. Executive Only: strategic, constitutional, high-impact, brand-critical, financial, legal, or irreversible actions.

## Operating Rules

- Compress many operational events into a small number of decision packages.
- Combine related decisions whenever practical.
- Avoid duplicate prompts.
- Prioritize decisions by business impact, urgency, risk, and dependency order.
- Preserve detail behind drill-down views.
- Record the decision, rationale, time, source department, and resulting action.

## Package Format

Each decision package should include:

- Title
- Source department or workflow
- Summary
- Recommended action
- Decision options
- Impact
- Risk level
- Deadline or timing constraint
- Supporting details
- Audit record

## Executive Attention Rule

Kairos should optimize for executive attention, not information volume.

The decision engine should reduce cognitive load while preserving enough context for responsible approval.

## Integration Points

- Morning Check-In
- Evening Wrap-Up
- Overnight Approval Cycle
- Overall Health Check
- Department Reporting Standard
- Parent-card command-center lanes
- Approval history
- Audit trail
- Metrics snapshots

## Implementation Notes

The first version can be deterministic and rule-based. Later versions may use Kairos intelligence to rank, group, explain, and route decisions across departments.