const BUILD = "kairos-creative-studio-ui-20260713-1";
const state = { open: false, loading: false, error: "", project: null, workflow: null };

start();

function start() {
  document.addEventListener("click", interceptCreativeStudio, true);
  window.addEventListener("kairos:creative-studio:open", openStudio);
}

function interceptCreativeStudio(event) {
  const button = event.target.closest?.('[data-child="creative-studio"]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openStudio();
}

async function openStudio() {
  state.open = true;
  await loadLatest();
  render();
  setTimeout(() => document.querySelector("#creative-studio")?.scrollIntoView({ behavior: "smooth", block: "start" }), 20);
}

async function loadLatest() {
  try {
    const { response, body } = await request("/api/creative-studio/latest");
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
    const { response, body } = await request("/api/creative-studio/projects", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        title: data.get("title"),
        objective: data.get("objective"),
        format: data.get("format"),
        audience: data.get("audience"),
        message: data.get("message"),
        dimensions: data.get("dimensions"),
        platform: data.get("platform"),
        references: data.get("references"),
        constraints: data.get("constraints"),
        due: data.get("due"),
        priority: data.get("priority"),
        approvalRequired: data.get("approvalRequired") === "on",
      }),
    });
    if (!response.ok) throw new Error(body?.error?.message || "Kairos could not create the creative project.");
    state.project = body.project;
    state.workflow = body.workflow;
  } catch (error) {
    state.error = error.message || "Kairos could not create the creative project.";
  } finally {
    state.loading = false;
    render();
  }
}

function render() {
  const hub = document.querySelector("#kairos-hub");
  if (!hub) return;
  let root = document.querySelector("#creative-studio");
  if (!state.open) { root?.remove(); return; }
  if (!root) {
    root = document.createElement("section");
    root.id = "creative-studio";
    root.className = "creative-studio workspace";
    hub.appendChild(root);
  }

  root.innerHTML = `<header class="creative-head"><div><p class="eyebrow">Content · Creative Studio</p><h2>Creative Production Workspace</h2><p>Turn an approved objective into a governed creative workflow.</p></div><button type="button" data-close-creative>Close</button></header>${state.error ? `<p class="creative-error">${escapeHTML(state.error)}</p>` : ""}<div class="creative-layout"><section class="creative-form"><h3>New Creative Project</h3><form data-creative-form><label>Project title<input name="title" maxlength="180" required placeholder="Example: Tonight’s TikTok carousel"></label><label>Finished objective<textarea name="objective" maxlength="4000" required placeholder="Describe exactly what should be ready when this project is complete."></textarea></label><div class="creative-fields"><label>Format<select name="format"><option value="social-post">Social post</option><option value="carousel">Carousel</option><option value="video-cover">Video cover</option><option value="product-image">Product image</option><option value="book-cover">Book cover</option><option value="website-asset">Website asset</option><option value="print-asset">Print asset</option><option value="custom">Custom</option></select></label><label>Priority<select name="priority"><option value="high">High</option><option value="normal" selected>Normal</option><option value="critical">Critical</option><option value="low">Low</option></select></label></div><label>Audience<input name="audience" maxlength="1000" placeholder="Who is this for?"></label><label>Core message<textarea name="message" maxlength="2000" placeholder="What must the asset communicate?"></textarea></label><div class="creative-fields"><label>Dimensions<input name="dimensions" maxlength="200" placeholder="1080 × 1920"></label><label>Platform<input name="platform" maxlength="300" placeholder="TikTok, Shopify, print..."></label></div><label>References<textarea name="references" maxlength="4000" placeholder="Approved visual references, assets, or links"></textarea></label><label>Constraints<textarea name="constraints" maxlength="4000" placeholder="Brand, copy, production, or release constraints"></textarea></label><label>Due<input name="due" maxlength="120" placeholder="Tonight, tomorrow, specific date"></label><label class="creative-check"><input type="checkbox" name="approvalRequired" checked> Require executive approval before production starts</label><button class="primary" type="submit">Create Project + Workflow</button></form></section><section class="creative-current">${state.loading ? `<p class="creative-loading">Kairos is building the creative workflow…</p>` : currentProjectMarkup()}</section></div>`;
  bind();
}

function currentProjectMarkup() {
  if (!state.project || !state.workflow) return `<div class="creative-empty"><strong>No creative project is open.</strong><p>Create a project and Kairos will automatically place its five production tasks into the Work Queue.</p></div>`;
  const project = state.project;
  const workflow = state.workflow;
  return `<div class="creative-project"><p class="eyebrow">${escapeHTML(project.format.replaceAll("-", " "))}</p><h3>${escapeHTML(project.title)}</h3><p>${escapeHTML(project.objective)}</p><div class="creative-stats"><div><strong>${Number(workflow.progress || 0)}%</strong><span>Progress</span></div><div><strong>${workflow.tasks?.length || 0}</strong><span>Tasks</span></div><div><strong>${escapeHTML(workflow.approvalStatus || "not-required")}</strong><span>Approval</span></div></div><div class="creative-boundary"><strong>Production boundary</strong><p>Intermediate and editable source assets stay inside the MMG/Kairos workspace. Only an approved final deliverable may be released.</p></div><div class="creative-actions"><button type="button" data-open-workflow>Open in Work Queue</button><button type="button" data-new-creative>Start Another Project</button></div></div>`;
}

function bind() {
  document.querySelector("[data-close-creative]")?.addEventListener("click", () => { state.open = false; render(); });
  document.querySelector("[data-creative-form]")?.addEventListener("submit", createProject);
  document.querySelector("[data-new-creative]")?.addEventListener("click", () => { state.project = null; state.workflow = null; render(); });
  document.querySelector("[data-open-workflow]")?.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("kairos:workflow-runtime:open", { detail: { workflowID: state.workflow?.id } }));
  });
}

function headers() { return { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD }; }
async function request(url, init = {}) { const response = await fetch(url, { cache: "no-store", credentials: "include", ...init }); const text = await response.text(); let body = {}; try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; } return { response, body }; }
function escapeHTML(value) { return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }
