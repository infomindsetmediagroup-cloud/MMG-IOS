const BUILD = "kairos-website-registry-20260712-1";
const state = { open:false, loading:false, registry:null, validation:null, error:"" };

function mount() {
  document.addEventListener("click", intercept, true);
  const observer = new MutationObserver(bindEntry);
  observer.observe(document.documentElement, { childList:true, subtree:true });
  bindEntry();
}

function bindEntry() {
  const journey = document.querySelector('[data-wp-action="journey"]');
  if (journey && journey.dataset.registryBound !== BUILD) {
    journey.dataset.registryBound = BUILD;
    journey.insertAdjacentHTML("beforeend", '<small class="registry-link">Open live website map after selecting this action</small>');
  }
  const production = document.querySelector("#website-production-overlay .website-production-panel header");
  if (production && !production.querySelector("[data-registry-open]")) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary registry-open";
    button.dataset.registryOpen = "true";
    button.textContent = "Website Map";
    production.appendChild(button);
  }
}

function intercept(event) {
  const button = event.target.closest?.("[data-registry-open]");
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  state.open = true;
  render();
  loadRegistry(false);
}

function render() {
  document.querySelector("#website-registry-overlay")?.remove();
  if (!state.open) return;
  const overlay = document.createElement("div");
  overlay.id = "website-registry-overlay";
  overlay.className = "website-registry-overlay";
  overlay.innerHTML = `<section class="website-registry-panel"><header><div><p class="eyebrow">Shopify & Website</p><h2>Website Registry & Journey Graph</h2><p>Kairos maps every verified page to its purpose, journey stage, CTA, and next step so the ecosystem does not produce isolated pages.</p></div><button data-registry-close aria-label="Close">×</button></header>${body()}</section>`;
  document.body.appendChild(overlay);
  bind(overlay);
}

function body() {
  if (state.loading) return '<div class="registry-loading"><i></i><p>Inspecting the storefront, sitemap, canonical MMG pathways, and route health…</p></div>';
  if (state.error) return `<p class="registry-error">${esc(state.error)}</p><div class="registry-actions"><button class="primary" data-registry-sync>Retry Sync</button><button class="secondary" data-registry-close>Close</button></div>`;
  if (!state.registry) return '<div class="registry-actions"><button class="primary" data-registry-sync>Sync Website Registry</button></div>';
  const r = state.registry;
  const summary = r.summary || {};
  const nodes = Array.isArray(r.nodes) ? r.nodes : [];
  const edges = Array.isArray(r.edges) ? r.edges : [];
  const findings = state.validation?.findings || [];
  return `<div class="registry-status"><span>${esc(r.status || "ready")}</span><strong>${esc(r.store || "Shopify storefront")}</strong></div>
    <section class="registry-metrics"><article><span>Pages</span><strong>${summary.pages ?? nodes.length}</strong></article><article><span>Pathways</span><strong>${summary.pathways ?? edges.length}</strong></article><article><span>Unreachable</span><strong>${summary.unreachable ?? 0}</strong></article><article><span>Dead ends</span><strong>${summary.deadEnds ?? 0}</strong></article></section>
    <div class="registry-toolbar"><button class="primary" data-registry-sync>Sync Storefront</button><button class="secondary" data-registry-validate>Validate Journey</button></div>
    ${findings.length ? `<section class="registry-findings"><h3>Journey findings</h3>${findings.map(item=>`<article data-severity="${escAttr(item.severity)}"><strong>${esc(item.type)}</strong><p>${esc(item.message)}</p><small>${esc(item.nodeID)}</small></article>`).join("")}</section>` : ""}
    <section class="registry-stage-row">${["discover","learn","create","publish","grow","legacy"].map(stage=>`<span>${esc(stage)}</span>`).join("")}</section>
    <section class="registry-node-grid">${nodes.map(item=>nodeCard(item, edges)).join("")}</section>
    <p class="registry-doctrine">${esc(r.doctrine?.rule || "Every public page must lead to a verified next step.")}</p>`;
}

function nodeCard(item, edges) {
  const outgoing = edges.filter(edge => edge.from === item.id);
  return `<article class="registry-node" data-status="${escAttr(item.status)}"><div><span>${esc(item.stage)}</span><small>${esc(item.status)}</small></div><h3>${esc(item.label)}</h3><p>${esc(item.path)}</p><dl><dt>Role</dt><dd>${esc(item.role)}</dd><dt>Primary CTA</dt><dd>${esc(item.primaryCTA || "Not assigned")}</dd><dt>Next steps</dt><dd>${outgoing.map(edge=>esc(edge.to)).join(" · ") || "None registered"}</dd></dl>${item.httpStatus ? `<footer>HTTP ${esc(item.httpStatus)} · ${esc(item.latencyMs ?? "—")} ms</footer>` : ""}</article>`;
}

function bind(overlay) {
  overlay.querySelectorAll("[data-registry-close]").forEach(button => button.onclick = () => { state.open = false; render(); });
  overlay.querySelector("[data-registry-sync]")?.addEventListener("click", () => loadRegistry(true));
  overlay.querySelector("[data-registry-validate]")?.addEventListener("click", validateJourney);
}

async function loadRegistry(sync) {
  state.loading = true; state.error = ""; render();
  try {
    const response = await fetch(sync ? "/api/shopify/website-registry/sync" : "/api/shopify/website-registry", { method: sync ? "POST" : "GET", credentials:"include", headers:{ "Content-Type":"application/json", "X-MMG-Client-Build":BUILD }, cache:"no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message || "Kairos could not load the website registry.");
    state.registry = body;
    state.validation = null;
  } catch (error) { state.error = error?.message || "Kairos could not load the website registry."; }
  finally { state.loading = false; render(); }
}

async function validateJourney() {
  state.loading = true; state.error = ""; render();
  try {
    const response = await fetch("/api/shopify/website-registry/validate", { method:"POST", credentials:"include", headers:{ "Content-Type":"application/json", "X-MMG-Client-Build":BUILD }, body:JSON.stringify({}) });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message || "Kairos could not validate the customer journey.");
    state.validation = body;
  } catch (error) { state.error = error?.message || "Kairos could not validate the customer journey."; }
  finally { state.loading = false; render(); }
}

function esc(value) { return String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[c]); }
function escAttr(value) { return esc(value).replace(/`/g, "&#96;"); }
mount();
