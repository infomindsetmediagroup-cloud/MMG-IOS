# Command Center Release Gate Acceptance Criteria

## Acceptance criteria

The Command Center release-gate slice is acceptable when:

1. the app builds through the manual iOS validation workflow;
2. Command Center shows release-gate state without requiring the user to inspect the Customer Releases tab;
3. blocked releases expose the first blocking gate detail;
4. publish-ready releases are counted separately from published releases;
5. draft/internal-review releases remain distinct from final customer publication;
6. customer-facing publication remains limited to approved final deliverables behind controlled portal access.

## Explicit non-acceptance conditions

The slice is not acceptable if:

- any Swift duplicate declaration is introduced;
- any customer-facing count includes intermediate production assets;
- release publication can be inferred without approval metadata;
- workflow validation must be changed merely to hide a compile failure.
