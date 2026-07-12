const GUIDED_HOMEPAGE_EXECUTION_BRIEF = `

PRODUCTION-SAFE IMPLEMENTATION BRIEF:
Prepare a concrete source-grounded mutation rather than a conceptual plan. Use the current published files supplied by Shopify. Make the smallest reversible improvement that advances the MMG guided homepage experience while preserving existing Liquid, JSON, settings, app blocks, routes, and dynamic data.

Priorities:
1. Improve clarity, hierarchy, readability, spacing, and guided progression on the homepage.
2. Prefer one existing homepage section file when supplied.
3. If the available structural files are insufficient, use one supplied existing CSS stylesheet for a conservative mobile-first presentation enhancement.
4. Return complete replacement content for every changed file and bind it to the supplied source hash.
5. Do not return an empty mutation merely because broader redesign work would require additional files; produce the safest useful bounded improvement supported by the supplied source files.
6. Do not invent products, links, assets, snippets, settings, schema fields, or app blocks.`;

window.addEventListener("kairos:execute-approved-action", event => {
  const action = event.detail;
  if (!action || action.phase === "execute") return;
  if (action.actionType !== "website.change.package" || action.id !== "WEB-002") return;
  const objective = String(action.objective || "");
  if (!objective.includes("PRODUCTION-SAFE IMPLEMENTATION BRIEF")) {
    action.objective = `${objective}${GUIDED_HOMEPAGE_EXECUTION_BRIEF}`.slice(0, 7600);
  }
}, true);
