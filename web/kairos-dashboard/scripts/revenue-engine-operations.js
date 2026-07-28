const BUILD = "kairos-revenue-engine-operations-20260727-2";
const state = { open: false, loading: false, error: "", products: [] };
start();

function start() {
  window.addEventListener("kairos:revenue-engine:open", open);
  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-open-revenue-engine]");
    if (!button) return;
    event.preventDefault();
    open();
  });
}
async function open() { state.open = true; await refresh(); render(); }
async function refresh() {
  state.loading = true; state.error = "";
  try {
    const response = await fetch("/api/kairos/revenue/products", { credentials: "include", cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message || "Unable to load revenue products.");
    state.products = body.products || [];
  } catch (error) { state.error = error.message; }
  finally { state.loading = false; }
}
function render() {
  const hub = document.querySelector("#kairos-hub");
  if (!hub || !state.open) return;
  let root = document.querySelector("#revenue-engine-operations");
  if (!root) { root = document.createElement("section"); root.id = "revenue-engine-operations"; root.className = "revenue-engine-operations workspace"; hub.appendChild(root); }
  root.innerHTML = `<header><div><p class="eyebrow">Revenue · Shopify Asset Factory</p><h2>Revenue Engine</h2><p>Blueprint, manufacture, validate, approve, and hand off sellable Shopify products.</p></div><button data-close-revenue>Close</button></header>${state.error ? `<p class="revenue-error">${esc(state.error)}</p>` : ""}<div class="revenue-scorecards"><article><strong>${state.products.length}</strong><span>Products</span></article><article><strong>${count("ready_to_publish")}</strong><span>Ready</span></article><article><strong>${state.products.reduce((sum, product) => sum + Number(product.executionQueue?.readyCount || 0), 0)}</strong><span>Jobs Ready</span></article><article><strong>${state.products.reduce((sum, product) => sum + (product.executionReceipts || []).length, 0)}</strong><span>Receipts</span></article></div><div class="revenue-products">${state.loading ? "<p>Loading…</p>" : state.products.map(card).join("") || "<p>No revenue products yet.</p>"}</div>`;
  bind();
}
function card(product) {
  const jobs = product.productionJobs || [];
  const queue = product.executionQueue || {};
  const completed = jobs.filter((job) => job.state === "completed").length;
  const next = queue.next;
  const receipts = product.executionReceipts || [];
  return `<article class="revenue-product"><div><p class="eyebrow">${esc(product.blueprint?.productType || "product")}</p><h3>${esc(product.blueprint?.title || product.revenueProductId)}</h3><p>${esc(product.blueprint?.audience || "")}</p></div><dl><div><dt>State</dt><dd>${esc(product.state)}</dd></div><div><dt>Assets</dt><dd>${(product.assets || []).length}/${(product.blueprint?.requiredAssets || []).length}</dd></div><div><dt>Jobs</dt><dd>${completed}/${jobs.length}</dd></div><div><dt>Next</dt><dd>${esc(next?.outputType || next?.jobId || "Blocked")}</dd></div><div><dt>QA</dt><dd>${esc(product.qualityAssurance?.status || "pending")}</dd></div><div><dt>Receipts</dt><dd>${receipts.length}</dd></div></dl><div class="revenue-actions"><button data-revenue-action="plan-jobs" data-id="${esc(product.revenueProductId)}">Plan Jobs</button>${next ? `<button data-revenue-action="execute-next" data-id="${esc(product.revenueProductId)}">Execute Next Job</button>` : ""}<button data-revenue-action="approve" data-id="${esc(product.revenueProductId)}">Approve</button><button data-revenue-action="shopify-handoff" data-id="${esc(product.revenueProductId)}">Shopify Handoff</button></div>${jobs.length ? `<div class="revenue-job-list">${jobs.map((job) => jobRow(product, job)).join("")}</div>` : ""}${receipts.length ? `<details><summary>Execution receipts</summary>${receipts.slice().reverse().slice(0, 10).map(receiptRow).join("")}</details>` : ""}</article>`;
}
function jobRow(product, job) {
  const authorized = job.authorization?.status === "authorized";
  return `<div class="revenue-job"><span>${esc(job.outputType || job.jobId)}</span><span>${esc(job.state || "planned")}</span>${!authorized && job.state !== "completed" ? `<button data-authorize-job data-id="${esc(product.revenueProductId)}" data-job-id="${esc(job.jobId)}">Authorize</button>` : ""}</div>`;
}
function receiptRow(receipt) { return `<div class="revenue-receipt"><strong>${esc(receipt.asset?.filename || receipt.receiptId)}</strong><span>${esc(receipt.asset?.status || "generated")}</span><span>${esc(receipt.model || "")}</span></div>`; }
function bind() {
  document.querySelector("[data-close-revenue]")?.addEventListener("click", () => { state.open = false; document.querySelector("#revenue-engine-operations")?.remove(); });
  document.querySelectorAll("[data-revenue-action]").forEach((button) => button.addEventListener("click", () => action(button.dataset.id, button.dataset.revenueAction)));
  document.querySelectorAll("[data-authorize-job]").forEach((button) => button.addEventListener("click", () => authorizeJob(button.dataset.id, button.dataset.jobId)));
}
async function authorizeJob(id, jobId) { return action(id, "authorize-job", { jobId, rationale: "Operator authorized revenue production job." }); }
async function action(id, name, extra = {}) {
  state.loading = true; render();
  try {
    const payload = { rationale: "Operator authorized revenue workflow action.", ...extra };
    if (name === "execute-next") payload.confirmation = "EXECUTE REVENUE JOB";
    const response = await fetch(`/api/kairos/revenue/products/${encodeURIComponent(id)}/${name}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD }, body: JSON.stringify(payload) });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message || "Revenue action failed.");
    await refresh();
  } catch (error) { state.error = error.message; state.loading = false; }
  render();
}
function count(value) { return state.products.filter((product) => product.state === value).length; }
function esc(value) { return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }
