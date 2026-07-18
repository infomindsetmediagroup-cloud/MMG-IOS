const BUILD = "kairos-objective-controller-ui-20260717-1";
const state = { working: false, result: null, error: "", objective: "" };

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
  if (button) button.textContent = "Execute Objective";
  const input = upgraded.querySelector("#objective-router-input");
  if (input) input.placeholder = "Example: Build a premium MMG homepage with guided pathways, approved images, Kairos audio moments, and a verified Shopify staging preview.";
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
  state.objective = objective;
  render();
  try {
    const response = await fetch("/api/objectives/execute", {
      method: "POST",
      cache: "no-store",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD },
      body: JSON.stringify({ objective }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error?.message || `Kairos returned ${response.status}.`);
    state.result = body;
    if (body.mode === "website-builder-studio") {
      render();
      setTimeout(() => window.KairosWebsiteBuilder?.open(objective, body?.builder?.manifest), 100);
    }
  } catch (error) {
    state.error = error.message || "Kairos could not execute the objective.";
  } finally {
    state.working = false;
    render();
  }
}

function render() {
  const result = document.querySelector("#objective-router-result");
  const submit = document.querySelector('#objective-router button[type="submit"]');
  if (submit) { submit.disabled = state.working; submit.textContent = state.working ? "Executing…" : "Execute Objective"; }
  if (!result) return;
  if (state.working) {
    result.hidden = false;
    result.innerHTML = `<div class="objective-v2-progress"><div class="objective-v2-stages"><span class="done">1 · Request</span><span class="active">2 · Execute</span><span>3 · Verify</span><span>4 · Deliver</span></div><p><i></i>Kairos is resolving doctrine, routing the objective, and starting the correct execution path.</p></div>`;
    return;
  }
  if (state.error) {
    result.hidden = false;
    result.innerHTML = `<div class="objective-v2-error"><strong>Objective not completed</strong><p>${escapeHTML(state.error)}</p><button type="button" data-objective-retry>Retry the same objective</button></div>`;
    result.querySelector("[data-objective-retry]")?.addEventListener("click", () => document.querySelector("#objective-router")?.requestSubmit());
    return;
  }
  if (!state.result) { result.hidden = true; result.innerHTML = ""; return; }
  result.hidden = false;
  if (state.result.mode === "website-builder-studio") {
    result.innerHTML = `<div class="objective-v2-result"><div><p class="eyebrow">${escapeHTML(state.result.route?.center || "content")} center · Website Builder Studio</p><strong>${escapeHTML(state.result.summary || "Website Builder Studio is ready.")}</strong><p>${escapeHTML(state.result.nextAction || "Compose and verify the staging website.")}</p></div><div class="objective-v2-actions"><button type="button" data-open-builder>Open Website Builder Studio</button></div></div>`;
    result.querySelector("[data-open-builder]")?.addEventListener("click", () => window.KairosWebsiteBuilder?.open(state.objective, state.result?.builder?.manifest));
    return;
  }
  const execution = state.result.execution || {};
  const sections = Array.isArray(execution.sections) ? execution.sections : Array.isArray(execution?.execution?.sections) ? execution.execution.sections : [];
  result.innerHTML = `<div class="objective-v2-result objective-v2-result--deliverable"><div><p class="eyebrow">${escapeHTML(state.result.route?.label || "Kairos execution")} · verified objective path</p><strong>${escapeHTML(state.result.summary || "Objective completed.")}</strong><p>${escapeHTML(state.result.nextAction || "Review the deliverable.")}</p></div>${sections.length ? `<div class="objective-v2-sections">${sections.slice(0, 8).map(section => `<article><h4>${escapeHTML(section.name || "Deliverable")}</h4><p>${escapeHTML(section.content || section.status || "")}</p></article>`).join("")}</div>` : ""}<div class="objective-v2-actions"><button type="button" data-new-objective>Run another objective</button></div></div>`;
  result.querySelector("[data-new-objective]")?.addEventListener("click", () => {
    state.result = null; state.error = ""; state.objective = "";
    const input = document.querySelector("#objective-router-input"); if (input) { input.value = ""; input.focus(); }
    render();
  });
}

function escapeHTML(value) { return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]); }
