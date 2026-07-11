const BUILD = "command-center-shopify-mutation-20260711-8";

const actionRoutes = {
  "executive.priority.review": {
    department: "Executive Office",
    confidence: 0.97,
    objectiveSuffix: "Review the current Command Center operating graph, identify the highest-value next actions, surface dependencies and blockers, and return a concise ordered executive priority brief. Do not claim external execution.",
    executionSuffix: "Execute the approved internal executive-priority decision by finalizing the ordered operating brief, recording the approved priorities, and returning completion evidence. Do not claim external mutations.",
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
    objectiveSuffix: "Use the completed storefront audit evidence already preserved in the Command Center and the approved MMG guided-experience doctrine to prepare a cohesive, implementation-ready homepage change package. Separate verified findings, recommended changes, affected pages and assets, expected benefits, risk controls, acceptance criteria, rollback plan, and required approvals. Do not publish changes.",
    executionPlan: [
      "Read the current published Shopify theme sources.",
      "Compile complete replacement content for the minimum required files.",
      "Bind every file to its current source hash.",
      "Return the exact mutation plan for executive approval without publishing anything.",
    ],
    governanceNote: "Proposal preparation only. No theme mutation or publishing is authorized until a separate executive approval event is recorded.",
    scope: "website-change-package",
    requiresReview: true,
    sourceGroundedMutationPlan: true,
  },
  "production.pipeline.map": {
    department: "Production Operations",
    confidence: 0.96,
    objectiveSuffix: "Create the canonical internal production pipeline map for approved MMG work. Define governed stages, required evidence, approval boundaries, completion criteria, rollback controls, and knowledge-preservation handoff. Do not claim external delivery or publishing.",
    executionSuffix: "Execute the approved internal production-pipeline decision by finalizing the canonical stages, controls, evidence requirements, ownership boundaries, and completion handoff. Return a production-ready operating record and do not claim external delivery.",
    executionPlan: [
      "Define intake, approval, production, verification, delivery, and preservation stages.",
      "Specify evidence, ownership, controls, and exit criteria at each stage.",
      "Return the operating map for executive approval without external execution.",
    ],
    governanceNote: "Proposal preparation only. No external mutation, delivery, or publishing is authorized.",
    scope: "internal-production-pipeline-map",
    requiresReview: true,
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
  if (!route) return;
  event.stopImmediatePropagation();
  if (action.phase === "execute") executeApprovedWorkflow(action, route);
  else executeKairosWorkflow(action, route);
}, true);

async function executeStorefrontInspection(action) {
  if (!action.id || !action.objective) return;
  dispatchStatus(action.id, "Working", 45, "", null, action.phase || "execute");
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
      dispatchStatus(action.id, "Needs Attention", 70, "The live storefront inspection did not return verified evidence.", null, action.phase || "execute");
      return;
    }

    complete(action.id, body, {
      summary: body.message,
      inspection: body.inspection,
      scope: "live-storefront-audit",
    }, body.inspection.auditId || body.auditId, action.phase || "execute");
  } catch (error) {
    fail(action.id, error, "Live storefront inspection failed.", action.phase || "execute");
  }
}

async function executeKairosWorkflow(action, route) {
  if (!action.id || !action.objective) return;
  dispatchStatus(action.id, "Working", 40, "", null, action.phase || "prepare");
  try {
    if (route.sourceGroundedMutationPlan) {
      const body = await callThemePlan(`${action.objective}\n\n${route.objectiveSuffix}`);
      dispatchStatus(action.id, "Proposal Ready", 100, "", body, action.phase || "prepare");
      return;
    }

    const body = await callKairos({
      objective: `${action.objective}\n\n${route.objectiveSuffix}`,
      department: route.department,
      routingConfidence: route.confidence,
      executionPlan: route.executionPlan,
      governanceNote: route.governanceNote,
    });
    const result = {
      actionID: body.auditId || crypto.randomUUID(),
      completedAt: new Date().toISOString(),
      summary: body.message,
      scope: route.scope,
      center: action.center,
      recommendedChanges: body.recommendations || body.changes || [body.message],
      affectedAssets: body.affectedAssets || body.pages || ["MMG Shopify homepage and directly referenced public homepage assets"],
      expectedBenefits: body.expectedBenefits || ["A clearer guided customer journey aligned with approved MMG experience doctrine"],
      risks: body.risks || ["Production changes require exact diff review, live verification, and rollback readiness"],
      rollbackPlan: body.rollbackPlan || ["Preserve the current production version before mutation and restore it if acceptance checks fail"],
      acceptanceCriteria: body.acceptanceCriteria || ["Approved scope implemented", "Mobile and desktop verification completed", "No broken navigation or critical storefront regressions"],
      evidence: {
        message: body.message,
        requestId: body.requestId,
        auditId: body.auditId,
        authorizationMode: body.executionContext?.authorizationMode,
        sessionId: body.executionContext?.sessionId,
      },
    };
    if (route.requiresReview || action.requiresReview) {
      dispatchStatus(action.id, "Proposal Ready", 100, "", result, action.phase || "prepare");
      return;
    }
    complete(action.id, body, result, result.actionID, action.phase || "execute");
  } catch (error) {
    fail(action.id, error, `${route.department} workflow failed.`, action.phase || "prepare");
  }
}

async function executeApprovedWorkflow(action, route) {
  if (!action.id || !action.objective) return;
  dispatchStatus(action.id, "Working", 55, "", null, "execute");
  try {
    const proposal = action.proposal ? `\n\nApproved proposal evidence:\n${JSON.stringify(action.proposal)}` : "";
    const body = await callKairos({
      objective: `${action.objective}\n\n${route.executionSuffix}${proposal}`,
      department: route.department,
      routingConfidence: Math.max(route.confidence, 0.98),
      executionPlan: [
        "Validate the recorded executive approval and approved proposal scope.",
        "Execute the approved internal workflow and create an authoritative operating record.",
        "Return explicit completion, verification, and rollback evidence.",
        "Do not claim any external mutation that is not directly evidenced by a connected adapter.",
      ],
      governanceNote: `Executive approval recorded for ${action.id}. Execute only the approved internal scope; preserve audit traceability and distinguish completed internal routing from external publication.`,
    });
    complete(action.id, body, {
      summary: body.message,
      scope: route.scope,
      center: action.center,
      approval: action.approval || null,
      approvedProposal: action.proposal || null,
      executionType: "governed-internal-execution",
      externalMutation: false,
      verification: body.verification || body.message,
    }, body.auditId || crypto.randomUUID(), "execute");
  } catch (error) {
    fail(action.id, error, `${route.department} approved execution failed.`, "execute");
  }
}

async function callThemePlan(objective) {
  const response = await fetch("/api/theme-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "X-MMG-Client-Build": BUILD },
    credentials: "include",
    body: JSON.stringify({ objective }),
  });
  const body = await readJSON(response);
  if (!response.ok) throw new Error(body?.error?.message || body?.message || `Theme plan returned ${response.status}.`);
  return body;
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
  if (!response.ok) throw new Error(body?.error?.message || body?.message || `Kairos returned ${response.status}.`);
  return body;
}

function complete(id, body, evidence, actionID = body.auditId || crypto.randomUUID(), phase = "execute") {
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
  }, phase);
}

function fail(id, error, fallback, phase) {
  dispatchStatus(id, "Needs Attention", 45, error instanceof Error ? error.message : fallback, null, phase);
}

function dispatchStatus(id, status, progress, error = "", result = null, phase = "execute") {
  window.dispatchEvent(new CustomEvent("kairos:approved-action-status", {
    detail: { id, status, progress, error, result, phase },
  }));
}

async function readJSON(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { message: text }; }
}
