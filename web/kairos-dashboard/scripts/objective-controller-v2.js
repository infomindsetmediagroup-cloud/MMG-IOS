const BUILD = "kairos-objective-controller-ui-20260725-5-operator-controls";
const state = { working: false, result: null, error: "", objective: "", requestId: "", department: "", evidenceCount: 0, sourceMode: "", continuingApprovalId: "" };

const observer = new MutationObserver(upgrade);
observer.observe(document.documentElement, { childList: true, subtree: true });
upgrade();

function upgrade() {
  const current = document.querySelector("#objective-router");
  if (!current || current.dataset.objectiveControllerV2 === "true") return;
  const upgraded = current.cloneNode(true);
  upgraded.dataset.objectiveControllerV2 = "true";
  upgraded.querySelector("label")?.replaceChildren(document.createTextNode("Tell Kairos what you want finished"));
  const button = upgraded.querySelector('button[type="submit"]');
  if (button) button.textContent = "Send to Kairos";
  const input = upgraded.querySelector("#objective-router-input");
  if (input) input.placeholder = "Example: Review the current publishing workflow and identify the highest-priority next action.";
  current.replaceWith(upgraded);
  upgraded.addEventListener("submit", executeObjective);
  render();
}

async function executeObjective(event) {
  event.preventDefault();
  const input = document.querySelector("#objective-router-input");
  const objective = input?.value?.trim() || "";
  if (objective.length < 3) return;
  state.working = true; state.error = ""; state.result = null; state.requestId = ""; state.department = ""; state.evidenceCount = 0; state.sourceMode = ""; state.objective = objective; render();
  try {
    const response = await fetch("/api/kairos", {
      method: "POST", cache: "no-store", credentials: "include",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "X-MMG-Client-Build": BUILD },
      body: JSON.stringify({ objective, mode: "informational", client: "kairos-dashboard" }),
    });
    const body = await response.json().catch(() => ({}));
    captureTrace(response, body);
    if (!response.ok) throw new Error(body?.error?.message || `Kairos returned ${response.status}.`);
    state.result = body;
  } catch (error) { state.error = error.message || "Kairos could not process the objective."; }
  finally { state.working = false; render(); }
}

async function continueApproval(action) {
  if (!action?.approvalId || action.executorAvailable !== true || state.continuingApprovalId) return;
  state.continuingApprovalId = action.approvalId;
  state.error = "";
  render();
  try {
    const response = await fetch("/api/kairos/tools/continue", {
      method: "POST", cache: "no-store", credentials: "include",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "X-MMG-Client-Build": BUILD },
      body: JSON.stringify({ approvalId: action.approvalId, confirmation: action.confirmationRequired || `APPROVE ${action.approvalId}` }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error?.message || `Approval continuation returned ${response.status}.`);
    state.result = {
      success: true,
      status: body.status || "completed",
      message: body.status === "verification_failed"
        ? "The mutation executed, but post-mutation verification found unexpected changes. Review the rollback plan before taking further action."
        : "The approved action completed and the production result was verified.",
      classification: "approval_continuation",
      actions: [],
      toolEvidence: [{
        verified: body.verified !== false,
        toolId: body.tool || action.toolId,
        executor: action.toolId,
        executedAt: new Date().toISOString(),
        result: body.result || body.verification || body,
      }],
      approvalResult: body,
    };
  } catch (error) {
    state.error = error.message || "The approved action could not be continued.";
  } finally {
    state.continuingApprovalId = "";
    render();
  }
}

function captureTrace(response, body) {
  state.requestId = body?.requestId || response.headers.get("X-Kairos-Request-Id") || "";
  state.department = response.headers.get("X-Kairos-Department") || "";
  state.evidenceCount = Math.max(0, Number(response.headers.get("X-Kairos-Knowledge-Evidence") || 0));
  state.sourceMode = response.headers.get("X-Kairos-Knowledge-Source-Mode") || "";
}

function render() {
  const result = document.querySelector("#objective-router-result");
  const submit = document.querySelector('#objective-router button[type="submit"]');
  if (submit) { submit.disabled = state.working; submit.textContent = state.working ? "Kairos is working…" : "Send to Kairos"; }
  if (!result) return;
  if (state.working) {
    result.hidden = false;
    result.innerHTML = `<div class="objective-v2-progress"><div class="objective-v2-stages"><span class="done">1 · Request</span><span class="active">2 · Retrieve</span><span>3 · Govern</span><span>4 · Deliver</span></div><p><i></i>Kairos is routing the objective and retrieving bounded MMG evidence.</p></div>`;
    return;
  }
  if (state.error) {
    result.hidden = false;
    result.innerHTML = `<div class="objective-v2-error"><strong>Objective not completed</strong><p>${escapeHTML(state.error)}</p>${traceCopy()}<button type="button" data-objective-retry>Retry the same objective</button></div>`;
    result.querySelector("[data-objective-retry]")?.addEventListener("click", () => document.querySelector("#objective-router")?.requestSubmit());
    return;
  }
  if (!state.result) { result.hidden = true; result.innerHTML = ""; return; }

  result.hidden = false;
  const status = String(state.result.status || "completed");
  const classification = String(state.result.classification || state.result.governance?.classification || state.result.mode || "informational");
  const message = state.result.message || state.result.output || state.result.summary || "Kairos completed the objective review.";
  const actions = Array.isArray(state.result.actions) ? state.result.actions : [];
  const evidence = Array.isArray(state.result.toolEvidence) ? state.result.toolEvidence : [];
  const approvalCopy = actions.filter(action => action.type === "tool_approval").map(renderApproval).join("");
  const actionCopy = actions.filter(action => action.type !== "tool_approval").length
    ? `<div class="objective-v2-sections">${actions.filter(action => action.type !== "tool_approval").slice(0, 8).map(action => `<article><h4>${escapeHTML(action.title || action.type || "Proposed action")}</h4><p>${escapeHTML(action.description || action.status || "")}</p></article>`).join("")}</div>` : "";
  const evidenceCopy = evidence.length ? `<div class="objective-v2-sections"><article><h4>Verified tool evidence</h4>${evidence.slice(0, 5).map(renderEvidence).join("")}</article></div>` : "";
  const approvalResultCopy = renderApprovalResult(state.result.approvalResult);
  result.innerHTML = `<div class="objective-v2-result objective-v2-result--deliverable"><div><p class="eyebrow">${escapeHTML(classification)} · ${escapeHTML(status)}</p><strong>${escapeHTML(message)}</strong>${traceCopy()}</div>${approvalCopy}${approvalResultCopy}${evidenceCopy}${actionCopy}<div class="objective-v2-actions"><button type="button" data-new-objective>Run another objective</button></div></div>`;
  result.querySelector("[data-new-objective]")?.addEventListener("click", reset);
  result.querySelectorAll("[data-continue-approval]").forEach(button => button.addEventListener("click", () => {
    const action = actions.find(item => item.approvalId === button.dataset.continueApproval);
    continueApproval(action);
  }));
}

function renderApproval(action) {
  const available = action.executorAvailable === true;
  const confirmation = action.confirmationRequired || (action.approvalId ? `APPROVE ${action.approvalId}` : "");
  const target = action.arguments?.productId || "not specified";
  const publication = action.arguments?.publicationId ? `<p>Publication target: <code>${escapeHTML(action.arguments.publicationId)}</code></p>` : "";
  const changes = action.arguments?.changes ? `<details><summary>Approved changes</summary><pre>${escapeHTML(JSON.stringify(action.arguments.changes, null, 2))}</pre></details>` : "";
  const pending = state.continuingApprovalId === action.approvalId;
  return `<div class="objective-v2-approval"><strong>Approval review</strong><p>${escapeHTML(action.toolLabel || action.toolId || "Governed action")} · risk: ${escapeHTML(action.risk || "unspecified")}</p><p>Target: <code>${escapeHTML(target)}</code></p>${publication}<p>Approval: ${escapeHTML(action.approvalId || "not issued")}${action.expiresAt ? ` · expires ${escapeHTML(action.expiresAt)}` : ""}</p><p>Required confirmation: <code>${escapeHTML(confirmation)}</code></p>${changes}<p>${available ? "The registered executor is available. Continuing captures required production evidence before the approval is consumed." : "Continuation is disabled because no production executor is connected. No mutation can be performed."}</p><button type="button" data-continue-approval="${escapeHTML(action.approvalId || "")}" ${available && !pending ? "" : "disabled aria-disabled=\"true\""}>${pending ? "Capturing and verifying…" : available ? "Continue approved action" : "Executor unavailable"}</button></div>`;
}

function renderEvidence(item) {
  const verification = item?.result?.verification || item?.result?.result?.verification;
  const rollback = verification?.rollbackPlan || item?.result?.rollbackPlan;
  const details = verification ? `<p>Post-mutation verification: <strong>${verification.verified ? "passed" : "failed"}</strong>${Array.isArray(verification.changedFields) ? ` · changed ${escapeHTML(verification.changedFields.join(", ") || "none")}` : ""}</p>` : "";
  const rollbackCopy = rollback?.available ? `<p>Rollback plan available · automatic: no · new approval required: yes</p>` : "";
  return `<p><strong>${escapeHTML(item.toolId || "Governed tool")}</strong> · ${item.verified ? "verified" : "unverified"} · ${escapeHTML(item.executor || "")}</p>${details}${rollbackCopy}`;
}

function renderApprovalResult(result) {
  if (!result || typeof result !== "object") return "";
  const verification = result.verification || result.result?.verification;
  const rollback = verification?.rollbackPlan || result.rollbackPlan || result.result?.rollbackPlan;
  const status = verification ? (verification.verified ? "Verification passed" : "Verification failed") : "Execution completed";
  return `<div class="objective-v2-approval"><strong>${escapeHTML(status)}</strong>${verification ? `<p>Approved fields: ${escapeHTML((verification.approvedFields || []).join(", ") || "none")}</p><p>Changed fields: ${escapeHTML((verification.changedFields || []).join(", ") || "none")}</p><p>Unexpected changes: ${escapeHTML((verification.unexpectedChanges || []).map(item => item.field).join(", ") || "none")}</p>` : ""}${rollback?.available ? `<details><summary>Review rollback plan</summary><p>Rollback is not automatic. It requires a new identity-bound, single-use approval.</p><pre>${escapeHTML(JSON.stringify(rollback.changes || {}, null, 2))}</pre></details>` : ""}</div>`;
}

function reset() {
  state.result = null; state.error = ""; state.objective = ""; state.requestId = ""; state.department = ""; state.evidenceCount = 0; state.sourceMode = ""; state.continuingApprovalId = "";
  const input = document.querySelector("#objective-router-input");
  if (input) { input.value = ""; input.focus(); }
  render();
}

function traceCopy() {
  const parts = [];
  if (state.department) parts.push(`Department: ${state.department}`);
  parts.push(`Evidence: ${state.evidenceCount}`);
  if (state.sourceMode) parts.push(`Source mode: ${state.sourceMode}`);
  if (state.requestId) parts.push(`Request: ${state.requestId}`);
  return `<p class="objective-v2-trace">${parts.map(escapeHTML).join(" · ")}</p>`;
}

function escapeHTML(value) { return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]); }
