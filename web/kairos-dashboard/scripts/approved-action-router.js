const BUILD = "command-center-cloudflare-native-20260711-9";

const actionRoutes = {
  "executive.priority.review": {
    department: "Executive Office",
    confidence: 0.97,
    objectiveSuffix: "Review the current Command Center operating graph, identify the highest-value next actions, surface dependencies and blockers, and return a concise ordered executive priority brief.",
    executionSuffix: "Finalize the approved ordered operating brief and record the approved priorities. Return concise completion evidence.",
    executionPlan: ["Review active, queued, blocked, and completed work.", "Rank the next actions by value, urgency, dependency, and readiness.", "Return a concise executive brief."],
    governanceNote: "Approved internal executive-priority review. No external mutation is authorized.",
    scope: "executive-priority-brief",
  },
  "website.change.package": {
    department: "Website Operations",
    confidence: 0.97,
    objectiveSuffix: "Use current published Shopify theme sources and the approved MMG guided-experience doctrine to prepare an exact, minimal homepage mutation package for executive approval.",
    executionPlan: ["Read the current published theme sources.", "Compile complete replacement content for the minimum required files.", "Bind each file to its current source hash.", "Return a concise approval package without publishing."],
    governanceNote: "Proposal preparation only. No theme mutation is authorized until executive approval is recorded.",
    scope: "website-change-package",
    requiresReview: true,
    sourceGroundedMutationPlan: true,
  },
  "production.pipeline.map": {
    department: "Production Operations",
    confidence: 0.96,
    objectiveSuffix: "Create the canonical internal production pipeline map for approved MMG work. Define stages, approvals, evidence, completion criteria, rollback controls, and knowledge preservation. Keep the executive summary concise.",
    executionSuffix: "Finalize the approved internal production-pipeline map, its controls, ownership boundaries, and completion handoff. Return a concise operating record.",
    executionPlan: ["Define intake, approval, production, verification, delivery, and preservation stages.", "Specify evidence, ownership, controls, and exit criteria.", "Return a concise executive approval package."],
    governanceNote: "Internal operating-map work only. No external delivery or publishing is authorized.",
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
      objective: `${action.objective}\n\nPerform a verified, read-only audit of the live MMG storefront and return a concise findings summary.`,
      department: "Website Operations",
      routingConfidence: 0.98,
      executionPlan: ["Inspect the live storefront and sitemap.", "Report only evidence-backed findings.", "Preserve audit and session traceability."],
      governanceNote: "Approved read-only inspection. Do not mutate Shopify.",
    });
    if (!body.inspection || body.inspection.source !== "live-storefront") {
      dispatchStatus(action.id, "Needs Attention", 70, "The live storefront inspection did not return verified evidence.", null, action.phase || "execute");
      return;
    }
    complete(action.id, body, { summary: body.message, inspection: body.inspection, scope: "live-storefront-audit" }, body.inspection.auditId || body.auditId, action.phase || "execute");
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
      summary: conciseText(body.message),
      scope: route.scope,
      center: action.center,
      recommendedChanges: normalizeExecutiveList(body.recommendations || body.changes || [body.message], 5),
      expectedBenefits: normalizeExecutiveList(body.expectedBenefits || ["The approved workflow becomes operational with clear controls and evidence."], 3),
      risks: normalizeExecutiveList(body.risks || ["Execution remains bounded by the approved scope and rollback controls."], 3),
      rollbackPlan: normalizeExecutiveList(body.rollbackPlan || ["Restore the previous operating state if verification fails."], 3),
      evidence: { message: body.message, requestId: body.requestId, auditId: body.auditId, authorizationMode: body.executionContext?.authorizationMode, sessionId: body.executionContext?.sessionId },
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
    if (route.sourceGroundedMutationPlan) {
      const body = await callMutation(action);
      complete(action.id, body, {
        summary: "The approved Shopify theme changes were applied and verified.",
        scope: route.scope,
        center: action.center,
        approval: action.approval || null,
        externalMutation: true,
        verification: body.evidence,
      }, body.actionID || crypto.randomUUID(), "execute");
      return;
    }

    const proposalSummary = summarizeProposal(action.proposal);
    const objective = `${action.objective}\n\n${route.executionSuffix}\n\nApproved scope summary: ${proposalSummary}`.slice(0, 7600);
    const body = await callKairos({
      objective,
      department: route.department,
      routingConfidence: Math.max(route.confidence, 0.98),
      executionPlan: ["Validate executive approval.", "Execute only the approved internal scope.", "Return concise completion and verification evidence."],
      governanceNote: `Executive approval recorded for ${action.id}. Preserve audit traceability and do not claim external mutation.`,
    });
    complete(action.id, body, {
      summary: conciseText(body.message),
      scope: route.scope,
      center: action.center,
      approval: action.approval || null,
      approvedProposalSummary: proposalSummary,
      executionType: "governed-internal-execution",
      externalMutation: false,
      verification: body.verification || body.message,
    }, body.auditId || crypto.randomUUID(), "execute");
  } catch (error) {
    fail(action.id, error, `${route.department} approved execution failed.`, "execute");
  }
}

async function callMutation(action) {
  const response = await fetch("/api/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "X-MMG-Client-Build": BUILD },
    credentials: "include",
    body: JSON.stringify({
      actionType: "shopify.theme.files.upsert",
      objective: String(action.objective || "").slice(0, 4000),
      proposal: action.proposal || null,
      mutation: action.proposal?.mutationPlan || null,
      approval: action.approval || { approved: true, actor: "Executive", approvedAt: new Date().toISOString() },
    }),
  });
  const body = await readJSON(response);
  if (!response.ok) throw new Error(body?.error?.message || body?.message || `Mutation returned ${response.status}.`);
  return body;
}

async function callThemePlan(objective) {
  const response = await fetch("/api/theme-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "X-MMG-Client-Build": BUILD },
    credentials: "include",
    body: JSON.stringify({ objective: String(objective || "").slice(0, 7800) }),
  });
  const body = await readJSON(response);
  if (!response.ok) throw new Error(body?.error?.message || body?.message || `Theme plan returned ${response.status}.`);
  return body;
}

async function callKairos(payload) {
  const response = await fetch("/api/kairos", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "X-MMG-Client-Build": BUILD },
    credentials: "include",
    body: JSON.stringify({ ...payload, objective: String(payload.objective || "").slice(0, 7800) }),
  });
  const body = await readJSON(response);
  if (!response.ok) throw new Error(body?.error?.message || body?.message || `Kairos returned ${response.status}.`);
  return body;
}

function summarizeProposal(proposal) {
  if (!proposal) return "Approved proposal on record.";
  const parts = [proposal.summary, ...(Array.isArray(proposal.recommendedChanges) ? proposal.recommendedChanges.slice(0, 4) : [])].filter(Boolean);
  return conciseText(parts.join(" "), 1200);
}

function conciseText(value, maximum = 700) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maximum) return text;
  return `${text.slice(0, maximum - 1).trim()}…`;
}

function normalizeExecutiveList(value, maximum) {
  const list = Array.isArray(value) ? value : [value];
  return list.filter(Boolean).slice(0, maximum).map(item => conciseText(item, 220));
}

function complete(id, body, evidence, actionID = body.auditId || crypto.randomUUID(), phase = "execute") {
  dispatchStatus(id, "Completed", 100, "", { actionID, completedAt: new Date().toISOString(), evidence: { ...evidence, requestId: body.requestId, auditId: body.auditId, authorizationMode: body.executionContext?.authorizationMode, sessionId: body.executionContext?.sessionId } }, phase);
}
function fail(id, error, fallback, phase) { dispatchStatus(id, "Needs Attention", 45, error instanceof Error ? error.message : fallback, null, phase); }
function dispatchStatus(id, status, progress, error = "", result = null, phase = "execute") { window.dispatchEvent(new CustomEvent("kairos:approved-action-status", { detail: { id, status, progress, error, result, phase } })); }
async function readJSON(response) { const text = await response.text(); if (!text) return {}; try { return JSON.parse(text); } catch { return { message: text }; } }
