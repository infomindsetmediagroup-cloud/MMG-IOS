const BUILD = "kairos-creation-engine-20260712-2";
const TERMINAL = new Set(["completed", "needs-attention"]);
const state = {
  open: false,
  working: false,
  error: "",
  type: "product_asset_copy",
  objective: "",
  coverFile: null,
  job: null,
  monitorToken: 0,
};

function mount() {
  const button = document.createElement("button");
  button.className = "creation-engine-launch";
  button.textContent = "Open Creation Engine";
  button.onclick = () => { state.open = true; render(); };
  document.body.appendChild(button);
  render();
}

function render() {
  document.querySelector("#creation-engine-overlay")?.remove();
  if (!state.open) return;
  const overlay = document.createElement("div");
  overlay.id = "creation-engine-overlay";
  overlay.className = "creation-engine-overlay";
  overlay.innerHTML = `<section class="creation-engine-panel" role="dialog" aria-modal="true" aria-labelledby="creation-engine-title">
    <header><div><p class="eyebrow">Kairos Native Production</p><h2 id="creation-engine-title">Creation Engine</h2><p>Give Kairos the idea. It researches, writes, edits, manufactures, previews, and packages the deliverables.</p></div><button data-close aria-label="Close">×</button></header>
    ${state.job ? jobView() : inputView()}
  </section>`;
  document.body.appendChild(overlay);
  overlay.querySelector("[data-close]").onclick = () => { state.open = false; render(); };
  overlay.querySelector("[data-run]")?.addEventListener("click", run);
  overlay.querySelector("[data-new]")?.addEventListener("click", reset);
  overlay.querySelector("[data-approve]")?.addEventListener("click", approveCover);
  overlay.querySelector("#ce-cover")?.addEventListener("change", event => { state.coverFile = event.target.files?.[0] || null; });
}

function inputView() {
  return `<div class="creation-engine-grid">
    <label>Production package<select id="ce-type">
      <option value="product_asset_copy" ${state.type === "product_asset_copy" ? "selected" : ""}>Complete book + product page + assets</option>
      <option value="book_package" ${state.type === "book_package" ? "selected" : ""}>Complete book publishing package</option>
    </select></label>
    <label>Approved front cover <span>(optional)</span><input id="ce-cover" type="file" accept="image/png,image/jpeg"><small>PNG or JPEG, up to 8 MB. A supplied cover is treated as the canonical approved cover and is not altered.</small></label>
  </div>
  <label>Book idea and production brief<textarea id="ce-objective" maxlength="12000" placeholder="Example: Write a practical beginner-friendly book titled AI Prompts for Beginners. Teach clear prompting, context, constraints, iteration, verification, and responsible judgment. Create the complete product page and marketing asset package.">${esc(state.objective)}</textarea></label>
  <div class="creation-engine-contract"><strong>Native production contract</strong><p>Direct-source research · 12-chapter Gold Master · three editorial passes · DOCX · digital PDF · KDP interior and wrap · EPUB · Shopify HTML · product copy · cover-derived assets · preview · complete ZIP</p></div>
  <p class="creation-engine-note">Kairos uses its private intelligence runtime when configured and its native deterministic production engine as the operational fallback. No OpenAI endpoint or service is used.</p>
  ${state.error ? `<p class="creation-engine-error" role="alert">${esc(state.error)}</p>` : ""}
  <button class="primary" data-run ${state.working ? "disabled" : ""}>${state.working ? "Starting production…" : "Build Complete Package"}</button>`;
}

function jobView() {
  const job = state.job;
  const progress = Math.max(0, Math.min(100, Number(job.overallProgress || 0)));
  const stages = (job.stages || []).map(stage => `<li class="${esc(stage.status)}"><span>${stage.status === "completed" ? "✓" : stage.status === "working" || stage.status === "awaiting-approval" ? "●" : "○"}</span>${esc(stage.label)}</li>`).join("");
  const preview = job.preview ? `<div class="creation-engine-preview">
    <img src="${attr(job.preview.coverURL)}" alt="${attr(job.title)} cover preview">
    <div><p class="eyebrow">Production preview</p><h3>${esc(job.title)}</h3>${job.subtitle ? `<p>${esc(job.subtitle)}</p>` : ""}<p>${number(job.wordCount)} words · approximately ${number(job.pageCount)} interior pages</p>${job.preview.product ? `<strong>${esc(job.preview.product.valueProposition)}</strong><p>${esc(job.preview.product.shortDescription)}</p>` : ""}</div>
  </div>` : "";
  const approval = job.status === "awaiting-cover-approval" ? `<div class="creation-engine-approval"><strong>Cover proof ready</strong><p>Review the cover preview. Approval unlocks the final KDP wrap and complete package.</p><button class="primary" data-approve>Approve Cover and Package</button></div>` : "";
  const artifacts = job.status === "completed" ? artifactView(job.artifacts || []) : "";
  const error = job.error ? `<p class="creation-engine-error" role="alert">${esc(job.error.message || "Production needs attention.")}</p>` : "";
  return `<div class="creation-engine-job">
    <div class="creation-engine-status"><span>${esc(statusLabel(job.status))}</span><strong>${progress}%</strong></div>
    <h3>${esc(job.stageLabel || "Kairos is working")}</h3>
    <div class="creation-engine-progress"><i style="width:${progress}%"></i></div>
    <ol class="creation-engine-stages">${stages}</ol>
    ${preview}${approval}${artifacts}${error}
    <div class="creation-engine-actions">${TERMINAL.has(job.status) ? `<button class="secondary" data-new>Create Another Package</button>` : ""}</div>
  </div>`;
}

function artifactView(artifacts) {
  const primary = artifacts.find(item => item.name === "complete-production-package.zip");
  const links = artifacts.filter(item => item !== primary).map(item => `<a href="${attr(item.url)}" download>${esc(artifactLabel(item.name))}<small>${esc(item.name)}</small></a>`).join("");
  return `<section class="creation-engine-delivery"><p class="eyebrow">Deliverables ready</p><h3>Complete production package</h3>${primary ? `<a class="creation-engine-package" href="${attr(primary.url)}" download>Download Complete ZIP</a>` : ""}<details><summary>Individual files (${artifacts.length})</summary><div class="creation-engine-artifacts">${links}</div></details><p class="creation-engine-note">Pricing, ISBN assignment, and submission through publishing or commerce accounts remain controlled final decisions.</p></section>`;
}

async function run() {
  state.type = document.querySelector("#ce-type")?.value || "product_asset_copy";
  state.objective = document.querySelector("#ce-objective")?.value.trim() || "";
  const selectedCover = document.querySelector("#ce-cover")?.files?.[0] || state.coverFile;
  if (state.objective.length < 12) { state.error = "Describe the book, reader, and outcome Kairos should produce."; render(); return; }
  state.working = true;
  state.error = "";
  render();
  try {
    const cover = selectedCover ? await readCover(selectedCover) : null;
    const response = await fetch("/api/content/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD },
      credentials: "include",
      body: JSON.stringify({ type: state.type, objective: state.objective, cover }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message || "Kairos could not start the production project.");
    state.job = body;
    state.working = false;
    render();
    monitor(body.pollURL);
  } catch (error) {
    state.error = error.message || "Kairos could not start the production project.";
    state.working = false;
    render();
  }
}

async function monitor(pollURL) {
  const token = ++state.monitorToken;
  for (let attempt = 0; attempt < 2400 && token === state.monitorToken; attempt += 1) {
    if (TERMINAL.has(state.job?.status) || state.job?.status === "awaiting-cover-approval") return;
    await delay(1200);
    try {
      const response = await fetch(pollURL, { credentials: "include", cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || "Kairos could not read production progress.");
      state.job = body;
      if (state.open) render();
    } catch (error) {
      state.error = error.message || "The progress connection was interrupted.";
      if (state.open) render();
      return;
    }
  }
}

async function approveCover() {
  const job = state.job;
  try {
    const response = await fetch(`/api/publishing/jobs/${encodeURIComponent(job.projectId)}/cover-approval`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ approved: true, note: "Approved in Kairos Creation Engine" }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message || "Kairos could not record cover approval.");
    state.job = body;
    render();
    monitor(body.pollURL);
  } catch (error) {
    state.job = { ...job, error: { message: error.message || "Kairos could not record cover approval." } };
    render();
  }
}

function reset() {
  state.monitorToken += 1;
  state.job = null;
  state.error = "";
  state.coverFile = null;
  render();
}

function readCover(file) {
  if (!['image/png', 'image/jpeg'].includes(file.type)) return Promise.reject(new Error("Upload the approved cover as a PNG or JPEG image."));
  if (file.size > 8 * 1024 * 1024) return Promise.reject(new Error("The approved cover must be 8 MB or smaller."));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The approved cover could not be read."));
    reader.onload = () => resolve({ name: file.name, type: file.type, dataBase64: String(reader.result).split(",")[1] || "" });
    reader.readAsDataURL(file);
  });
}

function statusLabel(status) {
  return ({ queued: "Queued", working: "Native production running", "awaiting-cover-approval": "Approval required", completed: "Production complete", "needs-attention": "Needs attention" })[status] || "Production project";
}

function artifactLabel(name) {
  const labels = { "gold-master.docx": "Gold Master manuscript", "digital-asset.pdf": "Digital edition PDF", "kdp-interior.pdf": "KDP interior", "kdp-full-wrap-cover.pdf": "KDP full-wrap cover", "ebook.epub": "EPUB edition", "shopify-product-page.html": "Shopify product page", "product-package.json": "Product copy package", "research-record.json": "Research record" };
  if (labels[name]) return labels[name];
  if (name.startsWith("approved-cover.")) return "Approved cover";
  if (name.endsWith(".svg")) return "Cover-derived asset";
  return name;
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function number(value) { return Number(value || 0).toLocaleString(); }
function attr(value) { return esc(value); }
function esc(value) { return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[character]); }

mount();
