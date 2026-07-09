# Customer Release Gate Action Advisor

## Purpose

The release gate detail screen should not only show pass/fail gate results. It should tell the operator what to do next.

## Runtime addition

`CustomerReleaseGateActionAdvisor` converts failed `CustomerReleaseGateResult` values into prioritized operator next actions.

## Current action mappings

| Failed gate | Recommended action |
|---|---|
| Production-only asset check | Move release to controlled portal storage. |
| Approval metadata check | Complete approval metadata. |
| Final deliverable scope check | Complete final deliverable scope. |
| Customer publication check | Move release to approved Customer Portal state. |

## Operational effect

Blocked releases become executable work instead of static warnings. This supports the Command Center principle that every blocker should resolve into a clear next action.
