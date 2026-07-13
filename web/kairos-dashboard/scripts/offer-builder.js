const BUILD = "kairos-offer-builder-ui-20260713-1";
const state = { open: false, loading: false, error: "", offer: null, workflow: null };

start();

function start() {
  document.addEventListener("click", interceptOfferBuilder, true);
  window.addEventListener("kairos:offer-builder:open", openWorkspace);
}

function interceptOfferBuilder(event) {
  const button = event.target.closest?.('[data-child="offer-builder"]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openWorkspace();
}

async function openWorkspace() {
  state.open = true;
  await loadLatest();
  render();
  setTimeout(() => document.querySelector("#offer-builder")?.scrollIntoView({ behavior: "smooth", block: "start" }), 20);
}

async function loadLatest() {
  try {
    const { response, body } = await request("/api/offers/latest");
    if (response.ok) {
      state.offer = body.offer || null;
      state.workflow = body.workflow || null;
    }
  } catch {}
}

async function createOffer(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  state.loading = true;
  state.error = "";
  render();
  try {
    const { response, body } = await request("/api/offers", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        title: data.get("title"),
        type: data.get("type"),
        customer: data.get("customer"),
        problem: data.get("problem"),
        outcome: data.get("outcome"),
        promise: data.get("promise"),
        differentiation: data.get("differentiation"),
        deliverables: data.get("deliverables"),
        deliveryModel: data.get("deliveryModel"),
        timeframe: data.get("timeframe"),
        support: data.get("support"),
        price: data.get("price"),
        costInputs: data.get("costInputs"),
        proof: data.get("proof"),
        risks: data.get("risks"),
        priority: data.get("priority"),
        approvalRequired: data.get("approvalRequired") === "on",
      }),
    });
    if (!response.ok) throw new Error(body?.error?.message || "Kairos could not build the offer package.");
    state.offer = body.offer;
    state.workflow = body.workflow;
  } catch (error) {
    state.error = error.message || "Kairos could not build the offer package.";
  } finally {
    state.loading = false;
    render();
  }
}

function render() {
  const hub = document.querySelector("#kairos-hub");
  if (!hub) return;
  let root = document.querySelector("#offer-builder");
  if (!state.open) { root?.remove(); return; }
  if (!root) {
    root = document.createElement("section");
    root.id = "offer-builder";
    root.className = "offer-builder workspace";
    hub.appendChild(root);
  }

  root.innerHTML = `<header class="offer-head"><div><p class="eyebrow">Business · Offer Builder</p><h2>Offer Architecture Workspace</h2><p>Shape the customer, promise, delivery model, economics, and approval-ready offer package.</p></div><button type="button" data-close-offer>Close</button></header>${state.error ? `<p class="offer-error">${escapeHTML(state.error)}</p>` : ""}<div class="offer-layout"><section class="offer-form"><h3>Build an Offer</h3><form data-offer-form><label>Offer name<input name="title" maxlength="180" required placeholder="Example: Creator Growth Sprint"></label><div class="offer-fields"><label>Offer type<select name="type"><option value="digital-product">Digital product</option><option value="service">Service</option><option value="subscription">Subscription</option><option value="bundle">Bundle</option><option value="book">Book</option><option value="course">Course</option><option value="consulting">Consulting</option><option value="custom">Custom</option></select></label><label>Priority<select name="priority"><option value="high">High</option><option value="normal" selected>Normal</option><option value="critical">Critical</option><option value="low">Low</option></select></label></div><label>Intended customer<textarea name="customer" maxlength="1600" required placeholder="Who is this for, specifically?"></textarea></label><label>Customer problem<textarea name="problem" maxlength="2400" placeholder="What problem, friction, or unmet need exists now?"></textarea></label><label>Desired outcome<textarea name="outcome" maxlength="2400" required placeholder="What meaningful result should the customer receive?"></textarea></label><label>Core promise<textarea name="promise" maxlength="2400" placeholder="State the approved promise without guarantees."></textarea></label><label>Differentiation<textarea name="differentiation" maxlength="2400" placeholder="Why this offer, from MMG, instead of the alternatives?"></textarea></label><label>Deliverables<textarea name="deliverables" maxlength="4000" placeholder="What exactly is included?"></textarea></label><div class="offer-fields"><label>Delivery model<input name="deliveryModel" maxlength="2400" placeholder="Download, portal, service, subscription..."></label><label>Timeframe<input name="timeframe" maxlength="300" placeholder="Immediate, 30 days, recurring..."></label></div><label>Support model<textarea name="support" maxlength="1800" placeholder="What support is included and what is not?"></textarea></label><div class="offer-fields"><label>Price or pricing model<input name="price" maxlength="600" placeholder="$49, monthly, tiered, pending approval"></label><label>Cost inputs<input name="costInputs" maxlength="1800" placeholder="Production, fulfillment, platform, labor"></label></div><label>Proof and evidence<textarea name="proof" maxlength="2400" placeholder="Verified proof, experience, assets, or evidence supporting the offer"></textarea></label><label>Risks and constraints<textarea name="risks" maxlength="2400" placeholder="Claims, delivery, pricing, capacity, legal, or operational risks"></textarea></label><label class="offer-check"><input type="checkbox" name="approvalRequired" checked> Require executive approval before production starts</label><button class="primary" type="submit">Build Offer + Workflow</button></form></section><section class="offer-current">${state.loading ? `<p class="offer-loading">Kairos is assembling the offer architecture…</p>` : currentOfferMarkup()}</section></div>`;
  bind();
}

function currentOfferMarkup() {
  if (!state.offer || !state.workflow) return `<div class="offer-empty"><strong>No offer package is open.</strong><p>Build an offer and Kairos will place its five governed stages into the Work Queue.</p></div>`;
  const offer = state.offer;
  const workflow = state.workflow;
  return `<article class="offer-package"><p class="eyebrow">${escapeHTML(offer.type.replaceAll("-", " "))}</p><h3>${escapeHTML(offer.title)}</h3><div class="offer-block"><strong>Customer</strong><p>${escapeHTML(offer.customer)}</p></div><div class="offer-block"><strong>Outcome</strong><p>${escapeHTML(offer.outcome)}</p></div><div class="offer-block"><strong>Promise</strong><p>${escapeHTML(offer.promise || "Pending refinement")}</p></div><div class="offer-stats"><div><strong>${Number(workflow.progress || 0)}%</strong><span>Progress</span></div><div><strong>${workflow.tasks?.length || 0}</strong><span>Stages</span></div><div><strong>${escapeHTML(workflow.approvalStatus || "not-required")}</strong><span>Approval</span></div></div><div class="offer-boundary"><strong>Governed release boundary</strong><p>Pricing, customer-facing claims, and publication require approval. No automatic discounting or guaranteed-outcome language is permitted.</p></div><div class="offer-actions"><button type="button" data-open-offer-workflow>Open in Work Queue</button><button type="button" data-new-offer>Build Another Offer</button></div></article>`;
}

function bind() {
  document.querySelector("[data-close-offer]")?.addEventListener("click", () => { state.open = false; render(); });
  document.querySelector("[data-offer-form]")?.addEventListener("submit", createOffer);
  document.querySelector("[data-new-offer]")?.addEventListener("click", () => { state.offer = null; state.workflow = null; render(); });
  document.querySelector("[data-open-offer-workflow]")?.addEventListener("click", () => window.dispatchEvent(new CustomEvent("kairos:workflow-runtime:open", { detail: { workflowID: state.workflow?.id } })));
}

function headers() { return { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD }; }
async function request(url, init = {}) { const response = await fetch(url, { cache: "no-store", credentials: "include", ...init }); const text = await response.text(); let body = {}; try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; } return { response, body }; }
function escapeHTML(value) { return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }
