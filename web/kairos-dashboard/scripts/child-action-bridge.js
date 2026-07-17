const BUILD = "kairos-child-action-bridge-20260716-1";
const EXCLUDED = new Set(["website", "health"]);
const SURFACES = [
  "#knowledge-operations",
  "#knowledge-library-provenance",
  "#research-evidence-closeout",
  "#research-synthesis-operations",
  "#decision-record-operations",
  "#manuscript-studio-overlay",
  "#social-production",
  "#publishing-studio",
  "#creative-studio",
  "#product-launch-studio",
  "#revenue-intelligence",
  "#growth-plan",
  "#offer-builder",
  "#campaign-operations",
  "#visitor-activity",
  "#customer-portal-workspace",
  "#deliverables-workspace",
  "#customer-journeys",
  "#support-intelligence",
  "#workflow-runtime",
  "#shopify-release-control-overlay",
  "#executive-briefing",
  "#system-registry-workspace",
];

const state = { action: null, objective: "", working: false, result: null, error: "" };
installStyles();
scheduleBridge();
window.addEventListener("popstate", scheduleBridge);
document.addEventListener("click", event => {
  if (event.target.closest?.("[data-route-workspace],[data-route-center],[data-route-home]")) scheduleBridge();
}, true);
window.addEventListener("kairos:knowledge-library:open", scheduleBridge);
window.addEventListener("kairos:doctrine-vault:open", scheduleBridge);
window.addEventListener("kairos:research-brief:open", scheduleBridge);
window.addEventListener("kairos:intelligence-synthesis:open", scheduleBridge);
window.addEventListener("kairos:manuscript-studio:open", scheduleBridge);
window.addEventListener("kairos:social-production:open", scheduleBridge);
window.addEventListener("kairos:publishing-studio:open", scheduleBridge);
window.addEventListener("kairos:creative-studio:open", scheduleBridge);
window.addEventListener("kairos:product-launch:open", scheduleBridge);
window.addEventListener("kairos:revenue-intelligence:open", scheduleBridge);
window.addEventListener("kairos:growth-plan:open", scheduleBridge);
window.addEventListener("kairos:offer-builder:open", scheduleBridge);
window.addEventListener("kairos:campaign-operations:open", scheduleBridge);
window.addEventListener("kairos:visitor-activity:open", scheduleBridge);
window.addEventListener("kairos:customer-portal:open", scheduleBridge);
window.addEventListener("kairos:deliverables:open", scheduleBridge);
window.addEventListener("kairos:customer-journeys:open", scheduleBridge);
window.addEventListener("kairos:support-intelligence:open", scheduleBridge);
window.addEventListener("kairos:workflow-runtime:open", scheduleBridge);
window.addEventListener("kairos:release-control:open", scheduleBridge);
window.addEventListener("kairos:executive-briefing:open", scheduleBridge);
window.addEventListener("kairos:system-registry:open", scheduleBridge);

function scheduleBridge() {
  for (const delay of [0, 40, 140, 400, 900, 1600]) setTimeout(renderForRoute, delay);
}

function renderForRoute() {
  const action = currentAction();
  if (!action || EXCLUDED.has(action)) {
    document.querySelector("#kairos-child-action-bridge")?.remove();
    state.action = null;
    return;
  }
  if (state.action !== action) restoreActionState(action);
  const host = preferredHost();
  if (!host) return;
  let bridge = document.querySelector("#kairos-child-action-bridge");
  if (!bridge) {
    bridge = document.createElement("section");
    bridge.id = "kairos-child-action-bridge";
    bridge.className = "kairos-child-action-bridge";
  }
  if (bridge.parentElement !== host) host.prepend(bridge);
  bridge.innerHTML = markup(action);
  bind(bridge);
}

function preferredHost() {
  for (const selector of SURFACES) {
    const surface = document.querySelector(selector);
    if (surface && surface.isConnected && !surface.hidden) return surface;
  }
  return document.querySelector(".child-workspace-page .routed-job");
}

function markup(action) {
  const label = actionLabel(action);
  if (state.working) {
    return `<header><div><p class="eyebrow">Kairos Direct Execution</p><h2>${escapeHTML(label)}</h2></div><span class="bridge-state working">Executing</span></header><div class="bridge-working"><i></i><strong>Kairos is producing the verified deliverable.</strong><p>It is gathering authoritative domain evidence, executing the safe internal job, preserving the artifact, and verifying durable read-back before returning the result.</p></div>`;
  }
  if (state.result) return resultMarkup(label, state.result);
  return `<header><div><p class="eyebrow">Kairos Direct Execution</p><h2>${escapeHTML(label)}</h2><p>State the outcome. Kairos will execute the internal job now and return the finished, verified deliverable here—not a queued acknowledgment.</p></div><span class="bridge-state ready">Ready</span></header>${state.error ? `<p class="bridge-error">${escapeHTML(state.error)}</p>` : ""}<label for="kairos-child-objective">Objective</label><textarea id="kairos-child-objective" maxlength="12000" placeholder="Describe exactly what Kairos should produce or analyze.">${escapeHTML(state.objective)}</textarea><div class="bridge-actions"><button class="primary" type="button" data-child-execute>Execute & Return Deliverable</button><small>Safe internal execution is automatic. Publishing, live changes, spending, destructive actions, and permission changes remain approval-gated.</small></div>`;
}

function resultMarkup(label, result) {
  const sections = Array.isArray(result?.sections) ? result.sections : [];
  const completed = result?.status === "completed";
  const stateClass = completed ? "complete" : result?.status === "blocked" ? "blocked" : "attention";
  return `<header><div><p class="eyebrow">Kairos Direct Execution</p><h2>${escapeHTML(label)}</h2></div><span class="bridge-state ${stateClass}">${escapeHTML(statusLabel(result?.status))}</span></header><div class="bridge-summary"><strong>${escapeHTML(result?.summary || "Kairos returned the execution result.")}</strong><small>${escapeHTML(result?.workflowID || "")}${result?.workItemID ? ` · ${escapeHTML(result.workItemID)}` : ""}</small></div><div class="bridge-results">${sections.map(section => `<article><h3>${escapeHTML(section?.name || "Result")}</h3><pre>${escapeHTML(section?.content || section?.summary || "")}</pre>${section?.artifactID ? `<small>Artifact ${escapeHTML(section.artifactID)}${section?.contentHash ? ` · ${escapeHTML(section.contentHash)}` : ""}</small>` : ""}</article>`).join("") || `<article><h3>Execution State</h3><pre>${escapeHTML(result?.error?.message || "No deliverable content was returned.")}</pre></article>`}</div><div class="bridge-actions"><button class="primary" type="button" data-child-new>Run Another Objective</button><button type="button" data-child-open-work>Open My Work</button></div>`;
}

function bind(bridge) {
  bridge.querySelector("[data-child-execute]")?.addEventListener("click", execute);
  bridge.querySelector("[data-child-new]")?.addEventListener("click", () => {
    state.result = null;
    state.error = "";
    state.objective = "";
    saveActionState();
    renderForRoute();
  });
  bridge.querySelector("[data-child-open-work]")?.addEventListener("click", () => {
    window.KairosCommandHub?.openWorkspace?.("operations", "work-queue");
  });
  bridge.querySelector("#kairos-child-objective")?.addEventListener("input", event => {
    state.objective = event.currentTarget.value;
    saveActionState();
  });
}

async function execute() {
  const textarea = document.querySelector("#kairos-child-objective");
  const objective = textarea?.value.trim() || state.objective.trim();
  state.objective = objective;
  if (objective.length < 2 && requiresObjective(state.action)) {
    state.error = "Enter the objective before execution.";
    renderForRoute();
    return;
  }
  state.working = true;
  state.result = null;
  state.error = "";
  saveActionState();
  renderForRoute();
  try {
    const response = await fetch("/api/hub/execute", {
      method: "POST",
      cache: "no-store",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-MMG-Client-Build": BUILD,
      },
      body: JSON.stringify({ action: state.action, objective, executionMode: "direct-objective-to-deliverable" }),
    });
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; }
    catch { body = { status: "needs-attention", summary: text }; }
    if (!response.ok && !Array.isArray(body?.sections)) {
      throw new Error(body?.error?.message || body?.summary || `Kairos returned ${response.status}.`);
    }
    state.result = body;
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Kairos could not complete this action.";
  } finally {
    state.working = false;
    saveActionState();
    renderForRoute();
  }
}

function currentAction() {
  const parts = location.pathname.split("/").filter(Boolean);
  return parts[0] === "center" && parts[2] ? decodeURIComponent(parts[2]) : "";
}

function restoreActionState(action) {
  state.action = action;
  state.objective = "";
  state.working = false;
  state.result = null;
  state.error = "";
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey(action)) || "null");
    if (saved && typeof saved === "object") {
      state.objective = String(saved.objective || "");
      state.result = saved.result || null;
      state.error = String(saved.error || "");
    }
  } catch {}
}

function saveActionState() {
  if (!state.action) return;
  try {
    sessionStorage.setItem(storageKey(state.action), JSON.stringify({
      objective: state.objective,
      result: state.result,
      error: state.error,
    }));
  } catch {}
}

function storageKey(action) {
  return `kairos.child-action.${action}.v1`;
}

function requiresObjective(action) {
  return !new Set(["visitor-activity", "work-queue", "release-control", "executive-briefing", "system-registry"]).has(action);
}

function actionLabel(action) {
  const heading = document.querySelector(".child-workspace-page .workspace-head h1")?.textContent?.trim();
  return heading || String(action || "Kairos Action").replaceAll("-", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

function statusLabel(status) {
  if (status === "completed") return "Completed";
  if (status === "blocked") return "Blocked";
  if (status === "needs-approval") return "Approval Required";
  return "Needs Attention";
}

function installStyles() {
  if (document.querySelector("#kairos-child-action-bridge-styles")) return;
  const style = document.createElement("style");
  style.id = "kairos-child-action-bridge-styles";
  style.textContent = `
    .kairos-child-action-bridge{position:relative;z-index:20;margin:0 0 22px;padding:22px;border:1px solid #28465a;border-radius:22px;background:linear-gradient(180deg,rgba(12,24,34,.98),rgba(7,14,21,.98));box-shadow:0 18px 50px rgba(0,0,0,.24);color:#eef8ff}
    .kairos-child-action-bridge header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:18px}
    .kairos-child-action-bridge h2{margin:3px 0 5px;font-size:clamp(20px,3vw,28px)}
    .kairos-child-action-bridge header p{margin:0;max-width:820px;color:#a9c2d1;line-height:1.55}
    .kairos-child-action-bridge label{display:block;margin:0 0 8px;font-weight:700}
    .kairos-child-action-bridge textarea{display:block;width:100%;min-height:180px;box-sizing:border-box;padding:16px;border:1px solid #35566b;border-radius:15px;background:#071019;color:#f4fbff;font:inherit;line-height:1.5;resize:vertical}
    .kairos-child-action-bridge textarea:focus{outline:2px solid #27b5ff;outline-offset:2px}
    .bridge-state{flex:0 0 auto;padding:7px 10px;border:1px solid #315268;border-radius:999px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#b9d5e4;background:#0b1821}
    .bridge-state.complete{border-color:#2e7c5b;color:#baf2d5;background:#0d241b}.bridge-state.blocked{border-color:#8b4545;color:#ffd0d0;background:#2a1111}.bridge-state.attention{border-color:#8a6b32;color:#ffe2a4;background:#281e0e}.bridge-state.working{border-color:#2577a8;color:#cceeff;background:#0c2230}
    .bridge-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:14px}.bridge-actions button{padding:11px 15px;border:1px solid #35566b;border-radius:12px;background:#0b1821;color:#dff3ff;font-weight:750;cursor:pointer}.bridge-actions button.primary{border-color:#27b5ff;background:#0e79b3;color:#fff}.bridge-actions small{flex:1 1 300px;color:#8faaba;line-height:1.45}
    .bridge-error{padding:12px 14px;border:1px solid #8b4545;border-radius:12px;background:#2a1111;color:#ffd0d0}
    .bridge-working{display:grid;grid-template-columns:auto 1fr;gap:8px 13px;align-items:center;padding:18px;border:1px solid #254c64;border-radius:15px;background:#081722}.bridge-working i{grid-row:1/3;width:26px;height:26px;border:3px solid #28495c;border-top-color:#27b5ff;border-radius:50%;animation:kairos-child-spin .8s linear infinite}.bridge-working p{margin:0;color:#9fb9c8;line-height:1.5}
    .bridge-summary{display:flex;flex-direction:column;gap:6px;padding:14px;border:1px solid #26485d;border-radius:14px;background:#08151e}.bridge-summary small{color:#839fad;overflow-wrap:anywhere}
    .bridge-results{display:grid;gap:12px;margin-top:14px}.bridge-results article{padding:16px;border:1px solid #203b4c;border-radius:14px;background:#071119}.bridge-results h3{margin:0 0 10px;font-size:15px}.bridge-results pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;color:#dcecf5;font:inherit;line-height:1.58}.bridge-results small{display:block;margin-top:10px;color:#718c9c;overflow-wrap:anywhere}
    @keyframes kairos-child-spin{to{transform:rotate(360deg)}}
    @media(max-width:720px){.kairos-child-action-bridge{padding:17px;border-radius:17px}.kairos-child-action-bridge header{flex-direction:column}.bridge-state{align-self:flex-start}.kairos-child-action-bridge textarea{min-height:210px}.bridge-actions button{width:100%}}
  `;
  document.head.appendChild(style);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

window.KairosChildActionBridge = { build: BUILD, render: renderForRoute, execute };
