const SUPPORTED_INSPECTION_ACTIONS = new Set([
  "shopify.homepage.audit",
  "storefront.audit",
]);

window.addEventListener("kairos:execute-approved-action", event => {
  const action = event.detail || {};
  if (!SUPPORTED_INSPECTION_ACTIONS.has(action.actionType)) return;

  event.stopImmediatePropagation();
  executeStorefrontInspection(action);
});

async function executeStorefrontInspection(action) {
  if (!action.id || !action.objective) return;

  dispatchStatus(action.id, "Working", 45);

  try {
    const response = await fetch("/api/kairos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-MMG-Client-Build": "command-center-production-20260711-3",
      },
      credentials: "include",
      body: JSON.stringify({
        objective: `${action.objective}\n\nPerform a verified, read-only audit of the live MMG storefront. Use the connected storefront inspection evidence. Clearly distinguish public storefront findings from Shopify Admin details that are unavailable without a configured Admin adapter.`,
        department: "Website Operations",
        routingConfidence: 0.98,
        executionPlan: [
          "Inspect the allowlisted live MMG storefront and sitemap.",
          "Report only evidence-backed findings.",
          "Preserve inspection, request, audit, and session traceability.",
        ],
        governanceNote: "Approved read-only Command Center inspection. Do not perform mutations or claim access to unavailable Shopify Admin data.",
      }),
    });

    const body = await readJSON(response);
    if (!response.ok) {
      const message = body?.error?.message || body?.message || `Inspection returned ${response.status}.`;
      dispatchStatus(action.id, "Needs Attention", 45, message);
      return;
    }

    if (!body.inspection || body.inspection.source !== "live-storefront") {
      dispatchStatus(action.id, "Needs Attention", 70, "The live storefront inspection did not return verified evidence.");
      return;
    }

    dispatchStatus(action.id, "Completed", 100, "", {
      actionID: body.inspection.auditId || body.auditId,
      completedAt: new Date().toISOString(),
      evidence: {
        summary: body.message,
        inspection: body.inspection,
        requestId: body.requestId,
        auditId: body.auditId,
        authorizationMode: body.executionContext?.authorizationMode,
        sessionId: body.executionContext?.sessionId,
      },
    });
  } catch (error) {
    dispatchStatus(
      action.id,
      "Needs Attention",
      45,
      error instanceof Error ? error.message : "Live storefront inspection failed.",
    );
  }
}

function dispatchStatus(id, status, progress, error = "", result = null) {
  window.dispatchEvent(new CustomEvent("kairos:approved-action-status", {
    detail: { id, status, progress, error, result },
  }));
}

async function readJSON(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { message: text }; }
}
