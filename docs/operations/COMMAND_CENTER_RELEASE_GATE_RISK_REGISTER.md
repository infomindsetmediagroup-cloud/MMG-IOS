# Command Center Release Gate Risk Register

## Risks

| Risk | Mitigation |
|---|---|
| SwiftUI result-builder compile regression | Keep the implementation inside one existing view and avoid explicit `return` in `body`. |
| Duplicate declaration regression | Do not copy view structs into shared support files. |
| Customer release count inflation | Count published releases separately from staged and publish-ready releases. |
| Asset doctrine drift | Keep intermediate production assets out of customer-publication state. |
| Validation drift | Do not update workflow assertions unless the runtime contract changes permanently. |

## Current risk level

Moderate until Manual iOS Validation passes on the branch.
