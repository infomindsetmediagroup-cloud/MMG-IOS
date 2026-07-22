const BUILD = "kairos-publishing-operations-center-20260722-1";
const STORAGE = { token: "kairosPublishingToken", projectId: "kairosPublishingProjectId" };
const STAGES = ["INTAKE","SOURCE_VALIDATION","MANUSCRIPT_EXTRACTION","METADATA_INFERENCE","EDITORIAL_ANALYSIS","DELIVERABLE_GENERATION","PRODUCT_METADATA_GENERATION","PACKAGE_ASSEMBLY","REVIEW","SHOPIFY_STAGING_HANDOFF"];

const state = { token: localStorage.getItem(STORAGE.token) || "", projectId: localStorage.getItem(STORAGE.projectId) || "", project: null, busy: false };

window.addEventListener("DOMContentLoaded", () => setTimeout(mount, 250));

function mount() {
  if (document.querySelector(".kairos-publishing-ops")) return;
  const host = document.querySelector("#kairos-hub") || document.body;
  const section = document.createElement("section");
  section.className = "kairos-publishing-ops";
  section.setAttribute("aria-labelledby", "kpo-title");
  section.innerHTML = `
    <header class="kpo-header">
      <div><p class="kpo-eyebrow">Operational publishing pipeline</p><h2 id="kpo-title">Kairos Publishing Operations</h2><p>Upload a cover and manuscript, manufacture the complete package, review safeguards, and stage a Shopify draft.</p></div>
      <div id="kpo-status" class="kpo-status">Not connected</div>
    </header>
    <div class="kpo-grid">
      <div class="kpo-card">
        <h3>Project intake</h3>
        <div class="kpo-fields">
          <div class="kpo-field"><label for="kpo-title-input">Working title</label><input id="kpo-title-input" autocomplete="off"></div>
          <div class="kpo-field"><label for="kpo-author">Author</label><input id="kpo-author" autocomplete="off"></div>
          <div class="kpo-field"><label for="kpo-product-type">Product type</label><select id="kpo-product-type"><option value="GUIDE">Guide</option><option value="DIGITAL_BOOK">Digital book</option><option value="WORKBOOK">Workbook</option><option value="OTHER">Other</option></select></div>
          <div class="kpo-field"><label for="kpo-audience">Audience</label><input id="kpo-audience" autocomplete="off"></div>
          <div class="kpo-field kpo-field-wide"><label for="kpo-notes">Production notes</label><textarea id="kpo-notes"></textarea></div>
        </div>
        <div class="kpo-files">
          <label class="kpo-file"><strong>Cover image</strong><span>PNG, JPG, JPEG, or WebP</span><input id="kpo-cover" type="file" accept="image/png,image/jpeg,image/webp"></label>
          <label class="kpo-file"><strong>Manuscript</strong><span>DOCX, PDF, TXT, or Markdown</span><input id="kpo-manuscript" type="file" accept=".docx,.pdf,.txt,.md,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"></label>
        </div>
        <div class="kpo-actions">
          <button class="kpo-button kpo-button-primary" data-action="create">Create project</button>
          <button class="kpo-button" data-action="upload" disabled>Upload sources</button>
          <button class="kpo-button kpo-button-primary" data-action="run" disabled>Run Kairos</button>
          <button class="kpo-button" data-action="refresh" disabled>Refresh status</button>
        </div>
        <div class="kpo-actions">
          <button class="kpo-button kpo-button-warn" data-action="render" disabled>Approve cover render</button>
          <button class="kpo-button kpo-button-warn" data-action="rights" disabled>Confirm rights</button>
          <button class="kpo-button" data-action="assemble" disabled>Assemble package</button>
          <button class="kpo-button kpo-button-good" data-action="approve" disabled>Approve staging</button>
        </div>
        <div class="kpo-actions">
          <button class="kpo-button kpo-button-good" data-action="stage" disabled>Stage Shopify draft</button>
          <button class="kpo-button" data-action="download" disabled>Download ZIP</button>
          <button class="kpo-button kpo-button-danger" data-action="rollback" disabled>Rollback Shopify draft</button>
        </div>
      </div>
      <div class="kpo-card">
        <h3>Connection and progress</h3>
        <div class="kpo-token-row"><input id="kpo-token" type="password" placeholder="Kairos API token" value="${escapeHtml(state.token)}"><button class="kpo-button" data-action="save-token">Save</button></div>
        <div class="kpo-project-meta">
          <div class="kpo-metric"><span>Project</span><strong id="kpo-project-id">${escapeHtml(state.projectId || "Not created")}</strong></div>
          <div class="kpo-metric"><span>Status</span><strong id="kpo-project-status">—</strong></div>
        </div>
        <div id="kpo-stages" class="kpo-stages">${renderStages([])}</div>
        <pre id="kpo-log" class="kpo-log" aria-live="polite">${BUILD}\nReady.</pre>
      </div>
    </div>`;
  host.appendChild(section);
  section.addEventListener("click", handleClick);
  if (state.projectId && state.token) refreshProject();
  syncButtons();
}

async function handleClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button || state.busy) return;
  const action = button.dataset.action;
  try {
    setBusy(true, action);
    if (action === "save-token") saveToken();
    else if (action === "create") await createProject();
    else if (action === "upload") await uploadSources();
    else if (action === "run") await post(`/api/kairos/projects/${state.projectId}/run`);
    else if (action === "refresh") await refreshProject();
    else if (action === "render") await post(`/api/kairos/projects/${state.projectId}/cover/render`, { confirmation: "APPROVE_NO_CROP_NO_REDRAW_RENDER", croppingAllowed: false, redrawingAllowed: false });
    else if (action === "rights") await confirmRights();
    else if (action === "assemble") await post(`/api/kairos/projects/${state.projectId}/package/assemble`);
    else if (action === "approve") await post(`/api/kairos/projects/${state.projectId}/review/approve`, { reviewerName: currentOperator(), confirmation: "APPROVE_FOR_SHOPIFY_STAGING" });
    else if (action === "stage") await post(`/api/kairos/projects/${state.projectId}/shopify-staging`);
    else if (action === "rollback") await post(`/api/kairos/projects/${state.projectId}/shopify-staging/rollback`);
    else if (action === "download") downloadPackage();
    if (!['save-token','download','refresh'].includes(action) && state.projectId) await refreshProject();
  } catch (error) {
    log(`${action} failed: ${error.message}`, "bad");
  } finally { setBusy(false); }
}

function saveToken() {
  state.token = document.querySelector("#kpo-token").value.trim();
  localStorage.setItem(STORAGE.token, state.token);
  log(state.token ? "API token saved locally in this browser." : "API token cleared.");
  syncStatus();
}

async function createProject() {
  ensureToken();
  const payload = {
    workingTitle: value("#kpo-title-input"), author: value("#kpo-author"),
    productType: value("#kpo-product-type"), intendedAudience: value("#kpo-audience"), notes: value("#kpo-notes")
  };
  const result = await request("/api/kairos/projects", { method: "POST", body: JSON.stringify(payload), headers: { "Content-Type": "application/json" } });
  state.project = result.project;
  state.projectId = result.project.id;
  localStorage.setItem(STORAGE.projectId, state.projectId);
  renderProject(); log(`Project created: ${state.projectId}`, "good");
}

async function uploadSources() {
  const cover = document.querySelector("#kpo-cover").files[0];
  const manuscript = document.querySelector("#kpo-manuscript").files[0];
  if (!cover || !manuscript) throw new Error("Select both a cover and manuscript.");
  await uploadAsset("COVER_SOURCE", cover);
  await uploadAsset("MANUSCRIPT_SOURCE", manuscript);
  log("Cover and manuscript uploaded.", "good");
}

async function uploadAsset(role, file) {
  await request(`/api/kairos/projects/${state.projectId}/assets?role=${role}`, { method: "POST", headers: { "Content-Type": file.type || fallbackMime(file.name), "X-Filename": file.name }, body: file });
}

async function confirmRights() {
  const signerName = prompt("Rights signer name", currentOperator());
  if (!signerName) throw new Error("Rights signer name is required.");
  await post(`/api/kairos/projects/${state.projectId}/rights/confirm`, { signerName, signerRole: "Owner", confirmations: { manuscriptRights: true, coverRights: true, thirdPartyRights: true } });
}

async function post(path, body) {
  const result = await request(path, { method: "POST", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  log(`${path.split('/').slice(-2).join('/')} completed.`, "good");
  return result;
}

async function refreshProject() {
  ensureToken();
  const result = await request(`/api/kairos/projects/${state.projectId}/status`);
  state.project = result.project;
  renderProject();
  return result.project;
}

async function request(path, options = {}) {
  ensureToken();
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${state.token}`);
  const response = await fetch(path, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `HTTP ${response.status}`);
  return payload;
}

function downloadPackage() {
  ensureToken();
  fetch(`/api/kairos/projects/${state.projectId}/package/download`, { headers: { Authorization: `Bearer ${state.token}` } })
    .then(async response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.blob(); })
    .then(blob => { const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `${state.project?.shopifyDraft?.handle || "kairos"}-deliverable-package.zip`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); })
    .catch(error => log(`download failed: ${error.message}`, "bad"));
}

function renderProject() {
  const project = state.project;
  document.querySelector("#kpo-project-id").textContent = project?.id || state.projectId || "Not created";
  document.querySelector("#kpo-project-status").textContent = project?.status || "—";
  document.querySelector("#kpo-stages").innerHTML = renderStages(project?.stages || []);
  syncStatus(); syncButtons();
}

function renderStages(stages) {
  const byName = new Map(stages.map(stage => [stage.name, stage]));
  return STAGES.map(name => { const status = byName.get(name)?.status || "PENDING"; return `<div class="kpo-stage" data-status="${status}"><span>${name.replaceAll('_',' ')}</span><b>${status}</b></div>`; }).join("");
}

function syncButtons() {
  const project = state.project;
  const hasProject = Boolean(state.projectId);
  const artifacts = new Set(project?.artifacts?.map(item => item.kind) || []);
  enable("upload", hasProject && !hasSources(project));
  enable("run", hasProject && hasSources(project) && !["RUNNING","COMPLETED"].includes(project?.status));
  enable("refresh", hasProject);
  enable("render", hasProject && artifacts.has("STOREFRONT_PRODUCT_IMAGE") && !artifacts.has("STOREFRONT_PRIMARY_IMAGE"));
  enable("rights", hasProject && artifacts.has("RIGHTS_DECLARATION") && project?.rights?.declarationStatus !== "OWNER_CONFIRMED");
  enable("assemble", hasProject && project?.rights?.declarationStatus === "OWNER_CONFIRMED" && artifacts.has("STOREFRONT_PRIMARY_IMAGE") && !artifacts.has("ZIP_ARCHIVE"));
  enable("approve", project?.status === "REVIEW_REQUIRED" && artifacts.has("ZIP_ARCHIVE"));
  enable("stage", project?.status === "APPROVED_FOR_SHOPIFY_STAGING");
  enable("download", artifacts.has("ZIP_ARCHIVE"));
  enable("rollback", project?.shopifyStaging?.rollbackAvailable === true);
}

function syncStatus() {
  const el = document.querySelector("#kpo-status"); if (!el) return;
  if (!state.token) { el.textContent = "Token required"; el.dataset.tone = "bad"; }
  else if (state.project?.status) { el.textContent = state.project.status.replaceAll("_", " "); el.dataset.tone = state.project.status === "COMPLETED" ? "good" : ""; }
  else { el.textContent = "Connected"; el.dataset.tone = "good"; }
}

function setBusy(value, action = "") { state.busy = value; document.querySelectorAll(".kpo-button").forEach(button => button.disabled = value || button.dataset.locked === "true"); if (value) log(`Running ${action}…`); else syncButtons(); }
function enable(action, allowed) { const button = document.querySelector(`[data-action="${action}"]`); if (!button) return; button.dataset.locked = allowed ? "false" : "true"; button.disabled = state.busy || !allowed; }
function hasSources(project) { const roles = new Set(project?.sourceAssets?.map(item => item.role) || []); return roles.has("COVER_SOURCE") && roles.has("MANUSCRIPT_SOURCE"); }
function ensureToken() { if (!state.token) throw new Error("Save the Kairos API token first."); }
function currentOperator() { return value("#kpo-author") || "MMG Executive"; }
function value(selector) { return document.querySelector(selector)?.value?.trim() || ""; }
function fallbackMime(name) { const lower = name.toLowerCase(); if (lower.endsWith(".md")) return "text/markdown"; if (lower.endsWith(".txt")) return "text/plain"; if (lower.endsWith(".pdf")) return "application/pdf"; if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"; return "application/octet-stream"; }
function log(message, tone = "") { const node = document.querySelector("#kpo-log"); if (!node) return; node.textContent += `\n[${new Date().toLocaleTimeString()}] ${message}`; node.scrollTop = node.scrollHeight; const status = document.querySelector("#kpo-status"); if (tone) status.dataset.tone = tone; }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char])); }
