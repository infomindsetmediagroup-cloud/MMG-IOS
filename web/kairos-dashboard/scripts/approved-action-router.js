const BUILD = "command-center-ecosystem-20260711-4";

const actionRoutes = {
  "executive.priority.review": {
    department: "Executive Office",
    confidence: 0.97,
    objectiveSuffix: "Review the current Command Center operating graph, identify the highest-value next actions, surface dependencies and blockers, and return a concise ordered executive priority brief. Do not claim external execution.",
    executionPlan: [
      "Review active, queued, blocked, and completed Command Center work.",
      "Rank the next actions by value, urgency, dependency, and readiness.",
      "Return a governed executive brief with explicit next steps.",
    ],
    governanceNote: "Approved internal executive-priority review. Planning only; no external mutation is authorized.",
    scope: "executive-priority-brief",
  },
  "website.change.package": {
    department: "Website Operations",
    confidence: 0.97,
    objectiveSuffix: "Use the completed storefront audit evidence already preserved in the Command Center and the approved MMG guided-experience doctrine to prepare a cohesive, implementation-ready homepage change package. Separate verified findings, recommended changes, acceptance criteria, and required approvals. Do not publish changes.",
    executionPlan: [
      "Translate verified storefront findings into a prioritized homepage change package.",
      "Define implementation scope, acceptance criteria, and dependencies.",
      "Preserve the package as evidence for the production pipeline.",
    ],
    governanceNote: "Approved internal website change-package preparation. No theme mutation or publishing is authorized.",
    scope: "website-change-package",
  },
  "production.pipeline.map": {
    department: "Production Operations",
    confidence: 0.96,
    objectiveSuffix: "Create the canonical internal production pipeline map for approved MMG work. Define governed stages, required evidence, approval boundaries, completion criteria, and knowledge-preservation handoff. Do not claim external delivery or publishing.",
    executionPlan: [
      "Define intake, approval, production, verification, delivery, and preservation stages.",
      "Specify evidence, ownership, and exit criteria at each stage.",
      "Return a production-ready operating map without claiming external execution.",
    ],
    governanceNote: "Approved internal production-system mapping. No external mutation, delivery, or publishing is authorized.",
    scope: "internal-production-pipeline-map",
  },
};

const inspectionActions = new Set(["shopify.homepage.audit", "storefront.audit"]);

window.addEventListener("kairos:execute-approved-action", event => {
  const action = event.detail || {};
  if (inspectionActions.has(action.actionType)) {
    event.stopImmediatePropagation();
    executeStorefrontInspection(action);
    return;
  }
  const route = actionRoutes[action.actionType];
  if (route) {
    event.stopImmediatePropagation();
    executeKairosWorkflow(action, route);
  }
}, true);

async function executeStorefrontInspection(action) {
  if (!action.id || !action.objective) return;
  dispatchStatus(action.id, "Working", 45);
  try {
    const body = await callKairos({
      objective: `${action.objective}\n\nPerform a verified, read-only audit of the live MMG storefront. Use the connected storefront inspection evidence. Clearly distinguish public storefront findings from Shopify Admin details that are unavailable without a configured Admin adapter.`,
      department: "Website Operations",
      routingConfidence: 0.98,
      executionPlan: [
        "Inspect the allowlisted live MMG storefront and sitemap.",
        "Report only evidence-backed findings.",
        "Preserve inspection, request, audit, and session traceability.",
      ],
      governanceNote: "Approved read-only Command Center inspection. Do not perform mutations or claim access to unavailable Shopify Admin data.",
    });

    if (!body.inspection || body.inspection.source !== "live-storefront") {
      dispatchStatus(action.id, "Needs Attention", 70, "The live storefront inspection did not return verified evidence.");
      return;
    }

    complete(action.id, body, {
      summary: body.message,
      inspection: body.inspection,
      scope: "live-storefront-audit",
    }, body.inspection.auditId || body.auditId);
  } catch (error) {
    fail(action.id, error, "Live storefront inspection failed.");
  }
}

async function executeKairosWorkflow(action, route) {
  if (!action.id || !action.objective) return;
  dispatchStatus(action.id, "Working", 40);
  try {
    const body = await callKairos({
      objective: `${action.objective}\n\n${route.objectiveSuffix}`,
      department: route.department,
      routingConfidence: route.confidence,
      executionPlan: route.executionPlan,
      governanceNote: route.governanceNote,
    });
    complete(action.id, body, {
      summary: body.message,
      scope: route.scope,
      center: action.center,
    });
  } catch (error) {
    fail(action.id, error, `${route.department} workflow failed.`);
  }
}

async function callKairos(payload) {
  const response = await fetch("/api/kairos", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-MMG-Client-Build": BUILD,
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  const body = await readJSON(response);
  if (!response.ok) {
    throw new Error(body?.error?.message || body?.message || `Kairos returned ${response.status}.`);
  }
  return body;
}

function complete(id, body, evidence, actionID = body.auditId || crypto.randomUUID()) {
  dispatchStatus(id, "Completed", 100, "", {
    actionID,
    completedAt: new Date().toISOString(),
    evidence: {
      ...evidence,
      requestId: body.requestId,
      auditId: body.auditId,
      authorizationMode: body.executionContext?.authorizationMode,
      sessionId: body.executionContext?.sessionId,
    },
  });
}

function fail(id, error, fallback) {
  dispatchStatus(id, "Needs Attention", 45, error instanceof Error ? error.message : fallback);
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
