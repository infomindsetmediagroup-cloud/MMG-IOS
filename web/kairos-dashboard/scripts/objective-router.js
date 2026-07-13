const BUILD = "kairos-objective-router-ui-20260713-1";
const state = { routing: false, route: null, error: "" };

start();

function start() {
  const observer = new MutationObserver(mount);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  mount();
}

function mount() {
  const hero = document.querySelector("#kairos-hub .hero");
  if (!hero || hero.querySelector("#objective-router")) return;
  const form = document.createElement("form");
  form.id = "objective-router";
  form.className = "objective-router";
  form.innerHTML = `<label for="objective-router-input">Tell Kairos what you want finished</label><div class="objective-router-bar"><textarea id="objective-router-input" maxlength="6000" rows="1" placeholder="Example: Build tonight’s TikTok post package and put it into the work queue."></textarea><button type="submit">Route Objective</button></div><div id="objective-router-result" class="objective-router-result" hidden></div>`;
  hero.querySelector("div")?.appendChild(form);
  form.addEventListener("submit", routeObjective);
}

async function routeObjective(event) {
  event.preventDefault();
  const input = document.querySelector("#objective-router-input");
  const objective = input?.value?.trim();
  if (!objective) return;
  state.routing = true; state.error = ""; state.route = null; render();
  try {
    const { response, body } = await request("/api/objectives/route", {
      method: "POST", headers: headers(), body: JSON.stringify({ objective }),
    });
    if (!response.ok) throw new Error(body?.error?.message || "Kairos could not route the objective.");
    state.route = body.route;
  } catch (error) { state.error = error.message || "Kairos could not route the objective."; }
  finally { state.routing = false; render(); }
}

async function dispatchObjective() {
  const objective = document.querySelector("#objective-router-input")?.value?.trim();
  if (!objective) return;
  state.routing = true; state.error = ""; render();
  try {
    const { response, body } = await request("/api/objectives/dispatch", {
      method: "POST", headers: headers(), body: JSON.stringify({ objective, priority: "high", approvalRequired: false }),
    });
    if (!response.ok) throw new Error(body?.error?.message || "Kairos could not dispatch the objective.");
    state.route = body.dispatch;
    window.dispatchEvent(new CustomEvent("kairos:workflow-runtime:open"));
  } catch (error) { state.error = error.message || "Kairos could not dispatch the objective."; }
  finally { state.routing = false; render(); }
}

function openHome() {
  const route = state.route;
  if (!route) return;
  const center = document.querySelector(`[data-center="${CSS.escape(route.center)}"]`);
  center?.click();
  setTimeout(() => document.querySelector(`[data-child="${CSS.escape(route.entryPoint)}"]`)?.click(), 80);
}

function render() {
  const result = document.querySelector("#objective-router-result");
  if (!result) return;
  if (state.routing) {
    result.hidden = false;
    result.innerHTML = `<p class="objective-router-loading">Kairos is finding the correct operating center…</p>`;
    return;
  }
  if (state.error) {
    result.hidden = false;
    result.innerHTML = `<p class="objective-router-error">${escapeHTML(state.error)}</p>`;
    return;
  }
  if (!state.route) { result.hidden = true; result.innerHTML = ""; return; }
  const dispatched = state.route.status === "dispatched";
  result.hidden = false;
  result.innerHTML = `<div><p class="eyebrow">${escapeHTML(state.route.center)} center · ${escapeHTML(state.route.confidence)} confidence</p><strong>${escapeHTML(dispatched ? "Workflow created" : state.route.label)}</strong><p>${escapeHTML(dispatched ? state.route.nextAction : state.route.rationale)}</p></div><div class="objective-router-actions">${dispatched ? `<button type="button" data-open-queue>Open Work Queue</button>` : `<button type="button" data-dispatch-objective>Create Workflow</button><button type="button" data-open-route>Open ${escapeHTML(state.route.label)}</button>`}</div>`;
  result.querySelector("[data-dispatch-objective]")?.addEventListener("click", dispatchObjective);
  result.querySelector("[data-open-route]")?.addEventListener("click", openHome);
  result.querySelector("[data-open-queue]")?.addEventListener("click", () => window.dispatchEvent(new CustomEvent("kairos:workflow-runtime:open")));
}

function headers() { return { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD }; }
async function request(url, init = {}) { const response = await fetch(url, { cache: "no-store", credentials: "include", ...init }); const text = await response.text(); let body = {}; try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; } return { response, body }; }
function escapeHTML(value) { return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }
