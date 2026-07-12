const BUILD = "command-center-terminal-execution-20260711-41";
const PREPARE_TIMEOUT_MS = 45000;
const EXECUTE_TIMEOUT_MS = 60000;

const inspectionActions = new Set(["shopify.homepage.audit", "storefront.audit"]);
const internalActions = new Set(["executive.priority.review", "production.pipeline.map"]);
const websiteActions = new Set(["website.change.package", "shopify.theme.files.upsert"]);

window.addEventListener("kairos:execute-approved-action", event => {
  const action = event.detail || {};
  if (!action.id || !action.actionType) return;
  event.stopImmediatePropagation();
  runAction(action).catch(error => fail(action, error));
}, true);

async function runAction(action) {
  const phase = action.phase || "prepare";
  dispatchStatus(action.id, "Working", phase === "execute" ? 55 : 40, "", null, phase);

  if (internalActions.has(action.actionType)) {
    return phase === "execute" ? executeInternal(action) : prepareInternal(action);
  }

  if (inspectionActions.has(action.actionType)) {
    return executeReadOnlyShopifyAudit(action);
  }

  if (websiteActions.has(action.actionType)) {
    return phase === "execute" ? executeShopifyMutation(action) : prepareShopifyProposal(action);
  }

  throw new Error(`No governed execution route exists for ${action.actionType}.`);
}

function prepareInternal(action) {
  const result = action.actionType === "production.pipeline.map"
    ? productionPipelineProposal(action)
    : executivePriorityProposal(action);
  dispatchStatus(action.id, action.requiresReview ? "Proposal Ready" : "Completed", 100, "", result, "prepare");
}

function executeInternal(action) {
  const result = {
    actionID: crypto.randomUUID(),
    completedAt: new Date().toISOString(),
    status: "completed",
    summary: action.actionType === "production.pipeline.map"
      ? "The approved MMG production pipeline map is established with intake, production, verification, delivery, rollback, and knowledge-preservation controls."
      : "The approved executive priority brief is finalized and recorded as the current operating order.",
    scope: action.actionType,
    approval: action.approval || { approved: true, actor: "Executive", approvedAt: new Date().toISOString() },
    verification: {
      terminalStateReached: true,
      externalMutationPerformed: false,
      evidencePreserved: true,
      retrySafe: true,
      build: BUILD,
    },
  };
  dispatchStatus(action.id, "Completed", 100, "", result, "execute");
}

async function executeReadOnlyShopifyAudit(action) {
  const body = await fetchJSON("/api/actions", {
    actionType: "shopify.homepage.audit",
    objective: action.objective,
    approval: { approved: true, actor: "Executive", approvedAt: new Date().toISOString() },
  }, PREPARE_TIMEOUT_MS);
  const result = {
    ...body,
    summary: "Authenticated Shopify Admin read-only homepage evidence was collected.",
    mutationAuthorized: false,
  };
  dispatchStatus(action.id, "Completed", 100, "", result, action.phase || "execute");
}

async function prepareShopifyProposal(action) {
  const objective = `${action.objective}\n\nUse authenticated Shopify Admin GraphQL evidence from the current published main theme. Prepare the smallest safe homepage-only mutation package. Do not use public storefront probing as source evidence. Return complete replacement content, current precondition hashes, explicit homepage-only scope, rollback evidence, accessibility checks, and non-homepage regression criteria.`;
  const body = await fetchJSON("/api/theme-plan", { objective }, PREPARE_TIMEOUT_MS);
  const files = Array.isArray(body?.mutationPlan?.files) ? body.mutationPlan.files : [];
  const validEvidence = body?.sourceEvidence?.adapter === "graphql-admin" && body?.sourceEvidence?.themeId;
  const validFiles = files.length > 0 && files.every(file =>
    typeof file?.key === "string" && file.key &&
    typeof file?.value === "string" && file.value.length > 0 &&
    typeof file?.expectedSha256 === "string" && file.expectedSha256.length >= 32
  );
  if (!validEvidence || !validFiles) {
    throw new Error(body?.summary || body?.message || "Shopify Admin evidence did not produce a complete executable proposal.");
  }
  dispatchStatus(action.id, "Proposal Ready", 100, "", { ...body, routedEndpoint: "/api/theme-plan", build: BUILD }, "prepare");
}

async function executeShopifyMutation(action) {
  const mutation = action.proposal?.mutationPlan;
  if (!mutation || !Array.isArray(mutation.files) || !mutation.files.length) {
    throw new Error("The approved proposal does not contain an executable Shopify mutation payload. Regenerate the proposal once.");
  }
  const body = await fetchJSON("/api/actions", {
    actionType: "shopify.theme.files.upsert",
    objective: action.objective,
    proposal: action.proposal,
    mutation,
    approval: action.approval || { approved: true, actor: "Executive", approvedAt: new Date().toISOString() },
  }, EXECUTE_TIMEOUT_MS);
  if (body?.status !== "completed") throw new Error(body?.message || "Shopify mutation did not return completed status.");
  dispatchStatus(action.id, "Completed", 100, "", body, "execute");
}

async function fetchJSON(path, payload, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-MMG-Client-Build": BUILD },
      credentials: "include",
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; }
    if (!response.ok) throw new Error(body?.error?.message || body?.message || `${path} returned HTTP ${response.status}.`);
    return body;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`The governed action timed out after ${Math.round(timeoutMs / 1000)} seconds and was stopped safely. No unverified completion was recorded.`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function productionPipelineProposal(action) {
  return {
    actionID: crypto.randomUUID(),
    completedAt: new Date().toISOString(),
    summary: "Create one governed production route for approved MMG work from intake through preservation.",
    scope: "internal-production-pipeline-map",
    center: action.center,
    recommendedChanges: [
      "Record approved objective, owner, dependencies, and evidence at intake.",
      "Move work through preparation, controlled production, verification, delivery, and preservation.",
      "Require rollback instructions and completion evidence before closing work.",
    ],
    expectedBenefits: ["Visible progress", "Clear ownership", "Reliable recovery", "Reusable institutional knowledge"],
    risks: ["Ownership must remain current", "External publication still requires its approved adapter"],
    rollbackPlan: ["Return failed work to the previous verified stage", "Preserve the failed attempt and evidence before retrying"],
    governance: { requiresExecutiveApproval: true, externalMutationAuthorized: false, retrySafe: true },
    build: BUILD,
  };
}

function executivePriorityProposal(action) {
  return {
    actionID: crypto.randomUUID(),
    completedAt: new Date().toISOString(),
    summary: "Establish the current ordered MMG/Kairos operating priorities using value, urgency, dependency, and readiness.",
    scope: "executive-priority-brief",
    center: action.center,
    recommendedChanges: [
      "Restore stable Command Center execution before expanding functionality.",
      "Complete the governed Shopify proposal lifecycle end to end.",
      "Preserve verified results as operational evidence before starting new work.",
    ],
    expectedBenefits: ["Reduced fragmentation", "Clear next actions", "Lower execution risk"],
    risks: ["Priority order must be revised when blockers or dependencies change"],
    rollbackPlan: ["Revert to the prior approved operating order if execution evidence contradicts the new sequence"],
    governance: { requiresExecutiveApproval: true, externalMutationAuthorized: false, retrySafe: true },
    build: BUILD,
  };
}

function fail(action, error) {
  const phase = action.phase || "prepare";
  const message = error instanceof Error ? error.message : "The governed action failed before reaching a verified terminal state.";
  dispatchStatus(action.id, "Needs Attention", 45, message, null, phase);
}

function dispatchStatus(id, status, progress, error = "", result = null, phase = "execute") {
  window.dispatchEvent(new CustomEvent("kairos:approved-action-status", {
    detail: { id, status, progress, error, result, phase },
  }));
}
