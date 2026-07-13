const BUILD = "kairos-product-launch-studio-ui-20260713-1";
const state = { open: false, loading: false, error: "", project: null, workflow: null };

start();

function start() {
  document.addEventListener("click", interceptLaunchStudio, true);
  window.addEventListener("kairos:product-launch:open", openStudio);
}

function interceptLaunchStudio(event) {
  const button = event.target.closest?.('[data-child="product-launch"]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openStudio();
}

async function openStudio() {
  state.open = true;
  await loadLatest();
  render();
  setTimeout(() => document.querySelector("#product-launch-studio")?.scrollIntoView({ behavior: "smooth", block: "start" }), 20);
}

async function loadLatest() {
  try {
    const { response, body } = await request("/api/product-launch/latest");
    if (response.ok) {
      state.project = body.project || null;
      state.workflow = body.workflow || null;
    }
  } catch {}
}

async function createProject(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  state.loading = true;
  state.error = "";
  render();
  try {
    const { response, body } = await request("/api/product-launch/projects", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        title: data.get("title"),
        objective: data.get("objective"),
        productType: data.get("productType"),
        audience: data.get("audience"),
        problem: data.get("problem"),
        promise: data.get("promise"),
        positioning: data.get("positioning"),
        price: data.get("price"),
        delivery: data.get("delivery"),
        channels: data.get("channels"),
        launchDate: data.get("launchDate"),
        successMetric: data.get("successMetric"),
        dependencies: data.get("dependencies"),
        priority: data.get("priority"),
        approvalRequired: data.get("approvalRequired") === "on",
      }),
    });
    if (!response.ok) throw new Error(body?.error?.message || "Kairos could not create the launch project.");
    state.project = body.project;
    state.workflow = body.workflow;
  } catch (error) {
    state.error = error.message || "Kairos could not create the launch project.";
  } finally {
    state.loading = false;
    render();
  }
}

function render() {
  const hub = document.querySelector("#kairos-hub");
  if (!hub) return;
  let root = document.querySelector("#product-launch-studio");
  if (!state.open) { root?.remove(); return; }
  if (!root) {
    root = document.createElement("section");
    root.id = "product-launch-studio";
    root.className = "product-launch-studio workspace";
    hub.appendChild(root);
  }

  root.innerHTML = `<header class="launch-studio-head"><div><p class="eyebrow">Business · Product Launch</p><h2>Product Launch Studio</h2><p>Build the commercial strategy, production package, readiness review, and governed release workflow.</p></div><button type="button" data-close-launch-studio>Close</button></header>${state.error ? `<p class="launch-studio-error">${escapeHTML(state.error)}</p>` : ""}<div class="launch-studio-layout"><section class="launch-studio-form"><h3>New Launch Project</h3><form data-launch-studio-form><label>Product or offer name<input name="title" maxlength="180" required placeholder="Example: AI Prompting for Beginners™"></label><label>Finished launch objective<textarea name="objective" maxlength="4000" required placeholder="Describe exactly what should be ready, approved, and measurable at launch."></textarea></label><div class="launch-studio-fields"><label>Product type<select name="productType"><option value="digital-download">Digital download</option><option value="book">Book</option><option value="physical-product">Physical product</option><option value="merchandise">Merchandise</option><option value="service">Service</option><option value="subscription">Subscription</option><option value="bundle">Bundle</option><option value="custom">Custom</option></select></label><label>Priority<select name="priority"><option value="critical">Critical</option><option value="high" selected>High</option><option value="normal">Normal</option><option value="low">Low</option></select></label></div><label>Target customer<input name="audience" maxlength="2000" placeholder="Who is this for?"></label><label>Problem addressed<textarea name="problem" maxlength="2000" placeholder="What problem or need does it address?"></textarea></label><label>Customer promise<textarea name="promise" maxlength="2000" placeholder="What outcome or value is being promised?"></textarea></label><label>Positioning<textarea name="positioning" maxlength="3000" placeholder="Why this product, why MMG, and why now?"></textarea></label><div class="launch-studio-fields"><label>Price or pricing model<input name="price" maxlength="300" placeholder="$19.99, subscription, tiered..."></label><label>Launch date<input name="launchDate" maxlength="120" placeholder="Tonight, tomorrow, specific date"></label></div><label>Delivery and fulfillment<textarea name="delivery" maxlength="2000" placeholder="Download, shipping, portal access, service delivery..."></textarea></label><label>Launch channels<textarea name="channels" maxlength="2000" placeholder="Shopify, TikTok, email, CapCut, partner channel..."></textarea></label><label>Primary success metric<input name="successMetric" maxlength="1200" placeholder="Sales, conversion, signups, downloads, leads..."></label><label>Dependencies and constraints<textarea name="dependencies" maxlength="3000" placeholder="Assets, approvals, inventory, legal, pricing, integrations..."></textarea></label><label class="launch-studio-check"><input type="checkbox" name="approvalRequired" checked> Require executive approval before release work starts</label><button class="primary" type="submit">Create Launch + Workflow</button></form></section><section class="launch-studio-current">${state.loading ? `<p class="launch-studio-loading">Kairos is building the launch workflow…</p>` : currentProjectMarkup()}</section></div>`;
  bind();
}

function currentProjectMarkup() {
  if (!state.project || !state.workflow) return `<div class="launch-studio-empty"><strong>No launch project is open.</strong><p>Create a launch project and Kairos will place its five governed stages into the Work Queue.</p></div>`;
  const project = state.project;
  const workflow = state.workflow;
  return `<div class="launch-studio-project"><p class="eyebrow">${escapeHTML(project.productType.replaceAll("-", " "))}</p><h3>${escapeHTML(project.title)}</h3><p>${escapeHTML(project.objective)}</p><div class="launch-studio-stats"><div><strong>${Number(workflow.progress || 0)}%</strong><span>Progress</span></div><div><strong>${workflow.tasks?.length || 0}</strong><span>Stages</span></div><div><strong>${escapeHTML(workflow.approvalStatus || "not-required")}</strong><span>Approval</span></div></div><div class="launch-studio-boundary"><strong>Release boundary</strong><p>Pricing, customer-facing publication, campaign activation, and irreversible release actions remain approval-gated. Rollback evidence is required.</p></div><div class="launch-studio-next"><strong>Next action</strong><p>${escapeHTML(project.nextAction || workflow.nextAction || "Open the workflow.")}</p></div><div class="launch-studio-actions"><button type="button" data-open-launch-workflow>Open in Work Queue</button><button type="button" data-new-launch-project>Start Another Launch</button></div></div>`;
}

function bind() {
  document.querySelector("[data-close-launch-studio]")?.addEventListener("click", () => { state.open = false; render(); });
  document.querySelector("[data-launch-studio-form]")?.addEventListener("submit", createProject);
  document.querySelector("[data-new-launch-project]")?.addEventListener("click", () => { state.project = null; state.workflow = null; render(); });
  document.querySelector("[data-open-launch-workflow]")?.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("kairos:workflow-runtime:open", { detail: { workflowID: state.workflow?.id } }));
  });
}

function headers() { return { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD }; }
async function request(url, init = {}) { const response = await fetch(url, { cache: "no-store", credentials: "include", ...init }); const text = await response.text(); let body = {}; try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; } return { response, body }; }
function escapeHTML(value) { return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }
