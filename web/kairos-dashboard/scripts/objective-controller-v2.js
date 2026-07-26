const BUILD = "kairos-objective-controller-ui-20260725-3-evidence-trace";
const state = { working: false, result: null, error: "", objective: "", requestId: "", department: "", evidenceCount: 0, sourceMode: "" };

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
  state.working = true;
  state.error = "";
  state.result = null;
  state.requestId = "";
  state.department = "";
  state.evidenceCount = 0;
  state.sourceMode = "";
  state.objective = objective;
  render();
  try {
    const response = await fetch("/api/kairos", {
      method: "POST",
      cache: "no-store",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-MMG-Client-Build": BUILD,
      },
      body: JSON.stringify({ objective, mode: "informational", client: "kairos-dashboard" }),
    });
    const body = await response.json().catch(() => ({}));
    state.requestId = body?.requestId || response.headers.get("X-Kairos-Request-Id") || "";
    state.department = response.headers.get("X-Kairos-Department") || "";
    state.evidenceCount = Math.max(0, Number(response.headers.get("X-Kairos-Knowledge-Evidence") || 0));
    state.sourceMode = response.headers.get("X-Kairos-Knowledge-Source-Mode") || "";
    if (!response.ok) throw new Error(body?.error?.message || `Kairos returned ${response.status}.`);
    state.result = body;
  } catch (error) {
    state.error = error.message || "Kairos could not process the objective.";
  } finally {
    state.working = false;
    render();
  }
}

function render() {
  const result = document.querySelector("#objective-router-result");
  const submit = document.querySelector('#objective-router button[type="submit"]');
  if (submit) {
    submit.disabled = state.working;
    submit.textContent = state.working ? "Kairos is working…" : "Send to Kairos";
  }
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
  if (!state.result) {
    result.hidden = true;
    result.innerHTML = "";
    return;
  }
  result.hidden = false;
  const status = String(state.result.status || "completed");
  const classification = String(state.result.classification || state.result.mode || "informational");
  const message = state.result.message || state.result.output || state.result.summary || "Kairos completed the objective review.";
  const requiresApproval = Boolean(state.result.requiresApproval);
  const actions = Array.isArray(state.result.actions) ? state.result.actions : [];
  const approvalCopy = requiresApproval
    ? `<div class="objective-v2-approval"><strong>Approval required</strong><p>Kairos identified a production-affecting action and did not execute it automatically.</p></div>`
    : "";
  const actionCopy = actions.length
    ? `<div class="objective-v2-sections">${actions.slice(0, 8).map(action => `<article><h4>${escapeHTML(action.title || action.type || "Proposed action")}</h4><p>${escapeHTML(action.description || action.status || "")}</p></article>`).join("")}</div>`
    : "";
  result.innerHTML = `<div class="objective-v2-result objective-v2-result--deliverable"><div><p class="eyebrow">${escapeHTML(classification)} · ${escapeHTML(status)}</p><strong>${escapeHTML(message)}</strong>${traceCopy()}</div>${approvalCopy}${actionCopy}<div class="objective-v2-actions"><button type="button" data-new-objective>Run another objective</button></div></div>`;
  result.querySelector("[data-new-objective]")?.addEventListener("click", () => {
    state.result = null;
    state.error = "";
    state.objective = "";
    state.requestId = "";
    state.department = "";
    state.evidenceCount = 0;
    state.sourceMode = "";
    const input = document.querySelector("#objective-router-input");
    if (input) {
      input.value = "";
      input.focus();
    }
    render();
  });
}

function traceCopy() {
  const parts = [];
  if (state.department) parts.push(`Department: ${state.department}`);
  parts.push(`Evidence: ${state.evidenceCount}`);
  if (state.sourceMode) parts.push(`Source mode: ${state.sourceMode}`);
  if (state.requestId) parts.push(`Request: ${state.requestId}`);
  return `<p class="objective-v2-trace">${parts.map(escapeHTML).join(" · ")}</p>`;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}
