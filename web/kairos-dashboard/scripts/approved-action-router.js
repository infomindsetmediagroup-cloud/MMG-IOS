const SUPPORTED_INSPECTION_ACTIONS = new Set([
  "shopify.homepage.audit",
  "storefront.audit",
]);

window.addEventListener("kairos:execute-approved-action", event => {
  const action = event.detail || {};

  if (SUPPORTED_INSPECTION_ACTIONS.has(action.actionType)) {
    event.stopImmediatePropagation();
    executeStorefrontInspection(action);
    return;
  }

  if (action.actionType === "production.pipeline.map") {
    event.stopImmediatePropagation();
    executeProductionPipelineMapping(action);
  }
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

async function executeProductionPipelineMapping(action) {
  if (!action.id || !action.objective) return;

  dispatchStatus(action.id, "Working", 35);

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
        objective: `${action.objective}\n\nCreate the canonical internal production pipeline map for approved MMG work. Define governed stages, required evidence, approval boundaries, completion criteria, and knowledge-preservation handoff. This is an internal planning and orchestration action only; do not claim external delivery or publishing.`,
        department: "Production Operations",
        routingConfidence: 0.96,
        executionPlan: [
          "Define intake, approval, production, verification, delivery, and preservation stages.",
          "Specify evidence and ownership at each stage.",
          "Return a production-ready operating map without claiming external execution.",
        ],
        governanceNote: "Approved internal production-system mapping. No external mutation, delivery, or publishing is authorized by this action.",
      }),
    });

    const body = await readJSON(response);
    if (!response.ok) {
      const message = body?.error?.message || body?.message || `Production mapping returned ${response.status}.`;
      dispatchStatus(action.id, "Needs Attention", 45, message);
      return;
    }

    dispatchStatus(action.id, "Completed", 100, "", {
      actionID: body.auditId || crypto.randomUUID(),
      completedAt: new Date().toISOString(),
      evidence: {
        summary: body.message,
        requestId: body.requestId,
        auditId: body.auditId,
        authorizationMode: body.executionContext?.authorizationMode,
        sessionId: body.executionContext?.sessionId,
        scope: "internal-production-pipeline-map",
      },
    });
  } catch (error) {
    dispatchStatus(
      action.id,
      "Needs Attention",
      45,
      error instanceof Error ? error.message : "Production pipeline mapping failed.",
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
