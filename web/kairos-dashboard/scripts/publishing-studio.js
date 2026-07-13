const BUILD = "kairos-publishing-studio-ui-20260713-1";
const state = { open: false, loading: false, error: "", project: null, workflow: null };

start();

function start() {
  document.addEventListener("click", interceptPublishingStudio, true);
  window.addEventListener("kairos:publishing-studio:open", openStudio);
}

function interceptPublishingStudio(event) {
  const button = event.target.closest?.('[data-child="publishing-studio"]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openStudio();
}

async function openStudio() {
  state.open = true;
  await loadLatest();
  render();
  setTimeout(() => document.querySelector("#publishing-studio")?.scrollIntoView({ behavior: "smooth", block: "start" }), 20);
}

async function loadLatest() {
  try {
    const { response, body } = await request("/api/publishing-studio/latest");
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
    const { response, body } = await request("/api/publishing-studio/projects", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        title: data.get("title"),
        subtitle: data.get("subtitle"),
        author: data.get("author"),
        objective: data.get("objective"),
        type: data.get("type"),
        sourceStatus: data.get("sourceStatus"),
        formats: data.get("formats"),
        channels: data.get("channels"),
        audience: data.get("audience"),
        description: data.get("description"),
        identifiers: data.get("identifiers"),
        pricingNotes: data.get("pricingNotes"),
        releaseTarget: data.get("releaseTarget"),
        priority: data.get("priority"),
        approvalRequired: data.get("approvalRequired") === "on",
      }),
    });
    if (!response.ok) throw new Error(body?.error?.message || "Kairos could not create the publishing project.");
    state.project = body.project;
    state.workflow = body.workflow;
  } catch (error) {
    state.error = error.message || "Kairos could not create the publishing project.";
  } finally {
    state.loading = false;
    render();
  }
}

function render() {
  const hub = document.querySelector("#kairos-hub");
  if (!hub) return;
  let root = document.querySelector("#publishing-studio");
  if (!state.open) { root?.remove(); return; }
  if (!root) {
    root = document.createElement("section");
    root.id = "publishing-studio";
    root.className = "publishing-studio workspace";
    hub.appendChild(root);
  }

  root.innerHTML = `<header class="publishing-head"><div><p class="eyebrow">Content · Publishing Studio</p><h2>Publication Production Workspace</h2><p>Turn a manuscript, guide, prompt library, or publication idea into a governed release package.</p></div><button type="button" data-close-publishing>Close</button></header>${state.error ? `<p class="publishing-error">${escapeHTML(state.error)}</p>` : ""}<div class="publishing-layout"><section class="publishing-form"><h3>New Publication</h3><form data-publishing-form><label>Publication title<input name="title" maxlength="240" required placeholder="Enter the publication title"></label><label>Subtitle<input name="subtitle" maxlength="500" placeholder="Optional subtitle"></label><label>Author<input name="author" maxlength="240" placeholder="Michael King"></label><label>Finished objective<textarea name="objective" maxlength="4000" required placeholder="Describe the complete, approved publication package that should exist when this work is finished."></textarea></label><div class="publishing-fields"><label>Type<select name="type"><option value="book">Book</option><option value="ebook">eBook</option><option value="guide">Guide</option><option value="workbook">Workbook</option><option value="prompt-library">Prompt library</option><option value="report">Report</option><option value="journal">Journal</option><option value="custom">Custom</option></select></label><label>Priority<select name="priority"><option value="high">High</option><option value="normal" selected>Normal</option><option value="critical">Critical</option><option value="low">Low</option></select></label></div><label>Source status<input name="sourceStatus" maxlength="240" placeholder="Idea, outline, partial manuscript, complete manuscript"></label><label>Formats<input name="formats" maxlength="1000" placeholder="PDF, EPUB, paperback, hardcover"></label><label>Channels<input name="channels" maxlength="1000" placeholder="Shopify, direct download, KDP, marketplace"></label><label>Audience<textarea name="audience" maxlength="1500" placeholder="Who is this publication for?"></textarea></label><label>Description<textarea name="description" maxlength="4000" placeholder="Publication summary or product description"></textarea></label><label>Identifiers<input name="identifiers" maxlength="1000" placeholder="ISBN, SKU, edition, volume"></label><label>Pricing notes<textarea name="pricingNotes" maxlength="2000" placeholder="Pricing inputs or approval notes"></textarea></label><label>Release target<input name="releaseTarget" maxlength="240" placeholder="Tonight, this week, specific date"></label><label class="publishing-check"><input type="checkbox" name="approvalRequired" checked> Require executive approval before production starts</label><button class="primary" type="submit">Create Publication + Workflow</button></form></section><section class="publishing-current">${state.loading ? `<p class="publishing-loading">Kairos is assembling the publication workflow…</p>` : currentProjectMarkup()}</section></div>`;
  bind();
}

function currentProjectMarkup() {
  if (!state.project || !state.workflow) return `<div class="publishing-empty"><strong>No publication is open.</strong><p>Create a publication and Kairos will place its five production stages into the Work Queue.</p></div>`;
  const project = state.project;
  const workflow = state.workflow;
  return `<div class="publishing-project"><p class="eyebrow">${escapeHTML(project.type.replaceAll("-", " "))}</p><h3>${escapeHTML(project.title)}</h3>${project.publication?.subtitle ? `<h4>${escapeHTML(project.publication.subtitle)}</h4>` : ""}<p>${escapeHTML(project.objective)}</p><div class="publishing-stats"><div><strong>${Number(workflow.progress || 0)}%</strong><span>Progress</span></div><div><strong>${workflow.tasks?.length || 0}</strong><span>Stages</span></div><div><strong>${escapeHTML(workflow.approvalStatus || "not-required")}</strong><span>Approval</span></div></div><div class="publishing-summary"><strong>Release package</strong><p>${escapeHTML((project.publication?.formats || []).join(", ") || "Formats not yet specified")}</p><p>${escapeHTML((project.publication?.channels || []).join(", ") || "Channels not yet specified")}</p></div><div class="publishing-boundary"><strong>Release boundary</strong><p>Draft and source files remain internal. Platform submission, pricing, live-store publication, and final release require governed approval.</p></div><div class="publishing-actions"><button type="button" data-open-publication-workflow>Open in Work Queue</button><button type="button" data-open-manuscript>Open Manuscript Studio</button><button type="button" data-new-publication>Start Another Publication</button></div></div>`;
}

function bind() {
  document.querySelector("[data-close-publishing]")?.addEventListener("click", () => { state.open = false; render(); });
  document.querySelector("[data-publishing-form]")?.addEventListener("submit", createProject);
  document.querySelector("[data-new-publication]")?.addEventListener("click", () => { state.project = null; state.workflow = null; render(); });
  document.querySelector("[data-open-publication-workflow]")?.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("kairos:workflow-runtime:open", { detail: { workflowID: state.workflow?.id } }));
  });
  document.querySelector("[data-open-manuscript]")?.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("kairos:manuscript-studio:open"));
  });
}

function headers() { return { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD }; }
async function request(url, init = {}) { const response = await fetch(url, { cache: "no-store", credentials: "include", ...init }); const text = await response.text(); let body = {}; try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; } return { response, body }; }
function escapeHTML(value) { return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }
