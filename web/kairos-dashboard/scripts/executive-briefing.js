const BUILD = "kairos-executive-briefing-ui-20260713-1";
const state = { briefing: null, loading: false, error: "", evidence: null };

start();

function start() {
  observe();
  loadLatest();
}

function observe() {
  const observer = new MutationObserver(() => mount());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  mount();
}

function mount() {
  const metrics = document.querySelector("#kairos-hub .metrics");
  if (!metrics || document.querySelector("#executive-briefing")) return;
  const section = document.createElement("section");
  section.id = "executive-briefing";
  section.className = "executive-briefing";
  metrics.insertAdjacentElement("afterend", section);
  render();
}

async function loadLatest() {
  state.loading = true;
  state.error = "";
  render();
  try {
    const { response, body } = await json("/api/executive-briefing/latest");
    if (response.status === 404) {
      state.briefing = null;
    } else if (!response.ok) {
      throw new Error(body?.error?.message || body?.message || "Kairos could not load the approval brief.");
    } else {
      state.briefing = body.briefing || null;
    }
  } catch (error) {
    state.error = error.message || "Kairos could not load the approval brief.";
  } finally {
    state.loading = false;
    render();
  }
}

async function buildBriefing() {
  state.loading = true;
  state.error = "";
  render();
  try {
    const { response, body } = await json("/api/executive-briefing/build", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD },
      body: "{}",
    });
    if (!response.ok) throw new Error(body?.error?.message || "Kairos could not prepare the approval brief.");
    state.briefing = body.briefing;
  } catch (error) {
    state.error = error.message || "Kairos could not prepare the approval brief.";
  } finally {
    state.loading = false;
    render();
  }
}

async function decide(itemID, decision) {
  const note = decision === "fix" ? window.prompt("What should Kairos correct?") : "";
  if (decision === "fix" && note === null) return;
  state.loading = true;
  state.error = "";
  render();
  try {
    const { response, body } = await json("/api/executive-briefing/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD },
      body: JSON.stringify({ itemID, decision, note: note || "", actor: "Executive" }),
    });
    if (!response.ok) throw new Error(body?.error?.message || "Kairos could not record the decision.");
    state.briefing = body.briefing;
    state.evidence = null;
  } catch (error) {
    state.error = error.message || "Kairos could not record the decision.";
  } finally {
    state.loading = false;
    render();
  }
}

function render() {
  const root = document.querySelector("#executive-briefing");
  if (!root) return;
  const briefing = state.briefing;
  const items = briefing?.items || [];
  const pending = items.filter(item => item.state === "pending");
  root.innerHTML = `<header class="briefing-head"><div><p class="eyebrow">Executive Approval</p><h2>${escapeHTML(briefing?.title || "Morning & Evening Brief")}</h2><p>${escapeHTML(briefing?.summary || "Kairos prepares decision-ready work twice daily.")}</p></div><div class="briefing-head-actions"><span>${pending.length} ready</span><button data-build>${briefing ? "Refresh Brief" : "Prepare Brief"}</button></div></header>${state.error ? `<p class="briefing-error">${escapeHTML(state.error)}</p>` : ""}${state.loading ? `<p class="briefing-loading"><i></i>Kairos is preparing the approval queue…</p>` : briefingBody(briefing, items)}`;
  root.querySelector("[data-build]")?.addEventListener("click", buildBriefing);
  root.querySelectorAll("[data-decision]").forEach(button => button.addEventListener("click", () => decide(button.dataset.item, button.dataset.decision)));
  root.querySelectorAll("[data-evidence]").forEach(button => button.addEventListener("click", () => { state.evidence = state.evidence === button.dataset.evidence ? null : button.dataset.evidence; render(); }));
}

function briefingBody(briefing, items) {
  if (!briefing) return `<div class="briefing-empty"><strong>No brief has been prepared yet.</strong><p>Run Website Intelligence, then prepare the current approval brief.</p></div>`;
  if (!items.length) return `<div class="briefing-empty"><strong>Nothing needs approval.</strong><p>Kairos will keep working and prepare the next brief automatically.</p></div>`;
  return `<div class="briefing-counts">${count("Ready", briefing.counts?.ready || 0)}${count("Approved", briefing.counts?.approved || 0)}${count("Fix", briefing.counts?.needsFix || 0)}${count("Denied", briefing.counts?.denied || 0)}</div><div class="briefing-items">${items.map(itemCard).join("")}</div>`;
}

function count(label, value) {
  return `<div><strong>${Number(value)}</strong><span>${label}</span></div>`;
}

function itemCard(item) {
  const decided = item.state !== "pending";
  const evidenceOpen = state.evidence === item.id;
  return `<article class="briefing-item" data-state="${escapeHTML(item.state || "pending")}"><div class="briefing-item-top"><div><p class="eyebrow">${escapeHTML(item.domain || "Business")} · ${escapeHTML(item.category || "Review")}</p><h3>${escapeHTML(item.title || "Approval item")}</h3></div><span class="decision-state">${escapeHTML(stateLabel(item.state))}</span></div><p>${escapeHTML(item.summary || "")}</p><div class="recommendation"><strong>Recommended</strong><span>${escapeHTML(item.recommendation || "Review the prepared work.")}</span></div>${item.decision?.note ? `<p class="decision-note"><strong>Executive note:</strong> ${escapeHTML(item.decision.note)}</p>` : ""}${evidenceOpen ? `<pre class="briefing-evidence">${escapeHTML(JSON.stringify(item.evidence || {}, null, 2))}</pre>` : ""}<div class="briefing-actions"><button class="approve" data-decision="approve" data-item="${escapeHTML(item.id)}" ${decided ? "disabled" : ""}>Approve</button><button data-decision="fix" data-item="${escapeHTML(item.id)}" ${decided ? "disabled" : ""}>Fix</button><button data-decision="deny" data-item="${escapeHTML(item.id)}" ${decided ? "disabled" : ""}>Deny</button><button data-evidence="${escapeHTML(item.id)}">${evidenceOpen ? "Hide Evidence" : "View Evidence"}</button></div></article>`;
}

function stateLabel(value) {
  return ({ pending: "Ready", approved: "Approved", denied: "Denied", "needs-fix": "Fix Requested", completed: "Completed" })[value] || "Ready";
}

async function json(url, init = {}) {
  const response = await fetch(url, { cache: "no-store", credentials: "include", ...init });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; }
  return { response, body };
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}
