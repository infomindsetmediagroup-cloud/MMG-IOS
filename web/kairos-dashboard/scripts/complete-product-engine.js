const BUILD = "kairos-complete-product-20260717-4";
const state = {
  open: false,
  mode: "idea",
  cover: null,
  manuscript: null,
  job: null,
  error: "",
  busy: false,
  shopify: null,
  shopifyBusy: false,
};

const libraries = {
  mammoth: ["https://cdn.jsdelivr.net/npm/mammoth@1.8.0/+esm", "https://esm.sh/mammoth@1.8.0"],
  pdf: ["https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs", "https://esm.sh/pdfjs-dist@4.10.38/build/pdf.mjs"],
};

function mount() {
  const button = document.createElement("button");
  button.className = "creation-engine-launch";
  button.textContent = "Build Complete Product";
  button.addEventListener("click", () => {
    state.open = true;
    render();
  });
  document.body.appendChild(button);
}

function render() {
  document.querySelector("#complete-product-overlay")?.remove();
  if (!state.open) return;

  const overlay = document.createElement("div");
  overlay.id = "complete-product-overlay";
  overlay.className = "creation-engine-overlay";
  overlay.innerHTML = `
    <section class="creation-engine-panel">
      <header>
        <div>
          <p class="eyebrow">Kairos Production</p>
          <h2>Build Complete Product</h2>
          <p>Start with an idea, an approved cover, or an existing manuscript. The manuscript path now preserves the uploaded source as the authoritative product content.</p>
        </div>
        <button data-close aria-label="Close">×</button>
      </header>
      ${state.job ? jobView() : formView()}
    </section>`;
  document.body.appendChild(overlay);
  bind(overlay);
}

function formView() {
  const coverRequired = state.mode === "cover" || state.mode === "manuscript";
  return `
    <div class="creation-engine-modes">
      ${modeButton("idea", "Start With an Idea")}
      ${modeButton("cover", "Start With a Cover")}
      ${modeButton("manuscript", "Start With a Manuscript")}
    </div>

    <div class="creation-engine-grid">
      <label>
        Package
        <select id="cp-type">
          <option value="product_asset_copy">Complete product + Shopify page + assets</option>
          <option value="book_package">Complete publishing package</option>
        </select>
      </label>
      <label>
        Exact publication title
        <input id="cp-title" maxlength="180" placeholder="Book title">
      </label>
      <label>
        Author
        <input id="cp-author" maxlength="180" value="Michael King" placeholder="Author name">
      </label>
    </div>

    <div class="creation-engine-grid">
      <label>
        Approved front cover ${coverRequired ? "<strong>required</strong>" : "<span>optional</span>"}
        <input id="cp-cover" type="file" accept="image/png,image/jpeg">
        <small>PNG or JPEG, up to 8 MB. The approved cover becomes the featured Shopify image and a reusable website asset.</small>
      </label>
      ${state.mode === "manuscript" ? `
        <label>
          Authoritative manuscript <strong>required</strong>
          <input id="cp-manuscript" type="file" accept=".txt,.md,.rtf,.docx,.pdf">
          <small>TXT, MD, RTF, DOCX, or text-based PDF, up to 20 MB. The original source and extracted text are checksum-bound and preserved.</small>
        </label>` : ""}
    </div>

    ${state.manuscript ? `
      <p class="creation-engine-note">
        <strong>Authoritative source loaded:</strong>
        ${escapeHTML(state.manuscript.name)} ·
        ${state.manuscript.words.toLocaleString()} words ·
        ${formatBytes(state.manuscript.file?.size || 0)} ·
        checksum ${escapeHTML(state.manuscript.checksum.slice(0, 12))}…
      </p>` : ""}

    <label>
      ${state.mode === "manuscript" ? "Product positioning and production direction" : "Book idea and production brief"}
      <textarea id="cp-brief" maxlength="12000" placeholder="Describe the intended reader, promise, tone, and final outcome."></textarea>
    </label>

    <div class="creation-engine-contract">
      <strong>${state.mode === "manuscript" ? "Authoritative manuscript contract" : "One production pipeline"}</strong>
      <p>${state.mode === "manuscript"
        ? "Original source preservation · checksum verification · preservation-first editorial passes · DOCX · PDF · KDP interior and wrap · EPUB · Shopify product page · cover-derived assets · website asset registration · ZIP"
        : "Source intake · research where appropriate · manuscript creation · editorial · DOCX · PDF · KDP interior and wrap · EPUB · Shopify page · product copy · assets · ZIP"}</p>
    </div>

    <p class="creation-engine-note">The manuscript path does not replace the uploaded book with a newly generated manuscript. The uploaded source remains authoritative.</p>
    ${state.error ? `<p class="creation-engine-error">${escapeHTML(state.error)}</p>` : ""}
    <button class="primary" data-run ${state.busy ? "disabled" : ""}>${state.busy ? "Preparing product…" : "Build Complete Product"}</button>`;
}

function modeButton(id, label) {
  return `<button type="button" class="creation-engine-mode ${state.mode === id ? "active" : ""}" data-mode="${id}"><strong>${label}</strong></button>`;
}

function jobView() {
  const job = state.job;
  const artifacts = job.artifacts || [];
  const zip = artifacts.find(artifact => artifact.name === "complete-production-package.zip");
  const source = job.source || {};
  const website = job.websitePopulation || {};
  return `
    <div class="creation-engine-job">
      <div class="creation-engine-status"><span>${escapeHTML(job.status || "completed")}</span><strong>${Number(job.overallProgress || 100)}%</strong></div>
      <h3>${escapeHTML(job.title || "Complete product")}</h3>
      <p>${Number(job.wordCount || 0).toLocaleString()} words · ${Number(job.pageCount || 0).toLocaleString()} estimated pages</p>

      ${job.authoritativeManuscript ? `
        <div class="creation-engine-contract">
          <strong>Authoritative manuscript verified</strong>
          <p>${escapeHTML(source.filename || "Uploaded manuscript")} · ${Number(source.wordCount || 0).toLocaleString()} words · checksum ${escapeHTML(String(source.checksum || "").slice(0, 16))}…</p>
        </div>` : ""}

      ${website.status === "cover-registered" ? `
        <p class="creation-engine-note"><strong>Website population ready:</strong> The approved product cover was automatically registered for reuse by the homepage and future page composers.</p>` : ""}

      <ol class="creation-engine-stages">
        ${(job.stages || []).map(stage => `<li class="${escapeHTML(stage.status)}"><span>✓</span>${escapeHTML(stage.label)}</li>`).join("")}
      </ol>

      ${zip ? `<a class="creation-engine-package" href="${safeAttr(zip.url)}" download>Download Complete ZIP</a>` : ""}
      <details>
        <summary>Individual files (${artifacts.length})</summary>
        <div class="creation-engine-artifacts">${artifacts.filter(item => item !== zip).map(item => `<a href="${safeAttr(item.url)}" download>${escapeHTML(item.name)}</a>`).join("")}</div>
      </details>

      ${job.status === "completed" ? shopifyPanel(job) : ""}
      <div class="creation-engine-actions"><button class="secondary" data-new>Build Another Product</button></div>
    </div>`;
}

function shopifyPanel(job) {
  if (!state.shopify) {
    return `
      <section class="creation-engine-shopify">
        <p class="eyebrow">Website handoff</p>
        <h3>Create the Shopify product draft</h3>
        <p>Kairos will use the completed product package, approved cover, description, tags, SEO, and selected price. The product remains DRAFT until separate visual and publication approval.</p>
        <label>Approved price<input id="cp-price" type="number" min="0.50" max="10000" step="0.01" placeholder="9.95"></label>
        <button class="primary" data-shopify-prepare ${state.shopifyBusy ? "disabled" : ""}>${state.shopifyBusy ? "Preparing…" : "Prepare Shopify Draft"}</button>
      </section>`;
  }

  const release = state.shopify;
  if (release.status === "awaiting-executive-approval") {
    return `
      <section class="creation-engine-shopify">
        <p class="eyebrow">Shopify handoff</p>
        <h3>${escapeHTML(release.desired?.title || job.title)}</h3>
        <div class="creation-engine-contract">
          <strong>${escapeHTML(release.action)}</strong>
          <p>Price: $${escapeHTML(release.desired.price)} · Status: DRAFT · Template: ${escapeHTML(release.desired.templateSuffix)}</p>
        </div>
        <label>Type ${escapeHTML(release.confirmationRequired)}<input id="cp-shopify-confirm" autocomplete="off"></label>
        <button class="primary" data-shopify-execute>Approve and Create Draft</button>
      </section>`;
  }

  return `
    <section class="creation-engine-shopify">
      <p class="eyebrow">Shopify handoff</p>
      <h3>${escapeHTML(release.status)}</h3>
      <p>The Shopify draft was created and verified. It remains unpublished.</p>
      <a class="creation-engine-package" href="${safeAttr(release.previewURL || "#")}" target="_blank" rel="noopener">Open Product Route</a>
      <label>Rollback confirmation<input id="cp-shopify-rollback" placeholder="ROLL BACK PRODUCT DRAFT"></label>
      <button class="secondary" data-shopify-rollback>Roll Back Product Draft</button>
    </section>`;
}

function bind(overlay) {
  overlay.querySelector("[data-close]")?.addEventListener("click", () => { state.open = false; render(); });
  overlay.querySelectorAll("[data-mode]").forEach(button => button.addEventListener("click", () => {
    state.mode = button.dataset.mode;
    state.manuscript = null;
    state.error = "";
    render();
  }));
  overlay.querySelector("#cp-cover")?.addEventListener("change", event => { state.cover = event.target.files?.[0] || null; });
  overlay.querySelector("#cp-manuscript")?.addEventListener("change", loadManuscript);
  overlay.querySelector("[data-run]")?.addEventListener("click", run);
  overlay.querySelector("[data-new]")?.addEventListener("click", reset);
  overlay.querySelector("[data-shopify-prepare]")?.addEventListener("click", prepareShopify);
  overlay.querySelector("[data-shopify-execute]")?.addEventListener("click", executeShopify);
  overlay.querySelector("[data-shopify-rollback]")?.addEventListener("click", rollbackShopify);
}

async function prepareShopify() {
  const price = document.querySelector("#cp-price")?.value || "";
  await shopifyRun("/api/shopify/product-publication/prepare", { projectId: state.job.projectId, price });
}

async function executeShopify() {
  const confirmation = document.querySelector("#cp-shopify-confirm")?.value || "";
  await shopifyRun("/api/shopify/product-publication/execute", { releaseId: state.shopify.releaseId, confirmation, actor: "Executive" });
}

async function rollbackShopify() {
  const confirmation = document.querySelector("#cp-shopify-rollback")?.value || "";
  await shopifyRun("/api/shopify/product-publication/rollback", { releaseId: state.shopify.releaseId, confirmation, actor: "Executive" });
}

async function shopifyRun(url, payload) {
  state.shopifyBusy = true;
  state.error = "";
  render();
  try {
    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message || "Shopify handoff failed.");
    state.shopify = body;
  } catch (error) {
    state.error = error.message || "Shopify handoff failed.";
  } finally {
    state.shopifyBusy = false;
    render();
  }
}

async function run() {
  const title = document.querySelector("#cp-title")?.value.trim() || "";
  const author = document.querySelector("#cp-author")?.value.trim() || "Michael King";
  const objective = document.querySelector("#cp-brief")?.value.trim() || "";
  const type = document.querySelector("#cp-type")?.value || "product_asset_copy";

  if (!title) return fail("Enter the exact publication title.");
  if (objective.length < 12) return fail("Describe the intended reader, promise, tone, and final outcome.");
  if ((state.mode === "cover" || state.mode === "manuscript") && !state.cover) return fail("Upload the approved cover.");
  if (state.mode === "manuscript" && !state.manuscript) return fail("Upload and extract the authoritative manuscript.");

  state.busy = true;
  state.error = "";
  render();

  try {
    const cover = state.cover ? await coverPayload(state.cover) : null;
    const manuscript = state.mode === "manuscript" ? await manuscriptPayload(state.manuscript) : null;
    const response = await fetch("/api/content/generate", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD },
      body: JSON.stringify({ type, mode: state.mode, title, author, objective, cover, manuscript }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message || "Production could not start.");
    state.job = body;
    sessionStorage.setItem("kairos.complete-product.job", JSON.stringify(body));
    render();
    if (body.pollURL && !["completed", "needs-attention", "awaiting-cover-approval"].includes(body.status)) poll(body.pollURL);
  } catch (error) {
    fail(error.message || "Production could not start.");
  } finally {
    state.busy = false;
    render();
  }
}

async function poll(url) {
  for (let attempt = 0; attempt < 2400; attempt += 1) {
    if (["completed", "needs-attention", "awaiting-cover-approval"].includes(state.job?.status)) return;
    await new Promise(resolve => setTimeout(resolve, 1200));
    const response = await fetch(url, { credentials: "include", cache: "no-store" });
    const body = await response.json();
    if (!response.ok) return fail(body?.error?.message || "Progress connection failed.");
    state.job = body;
    sessionStorage.setItem("kairos.complete-product.job", JSON.stringify(body));
    render();
  }
}

async function loadManuscript(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  state.busy = true;
  state.error = "";
  render();
  try {
    if (file.size > 20 * 1024 * 1024) throw new Error("Manuscript source files must be 20 MB or smaller.");
    const format = fileFormat(file);
    const output = await extract(file, format);
    const text = normalize(output.text);
    if (text.length < 500) throw new Error("The manuscript must contain at least 500 characters.");
    if (text.length > 600000) throw new Error("The manuscript exceeds the 600,000-character production limit.");
    state.manuscript = {
      file,
      name: file.name,
      mimeType: file.type || mimeFor(format),
      format,
      text,
      pages: output.pages || null,
      words: (text.match(/\b[\w’'-]+\b/g) || []).length,
      checksum: await checksum(file),
    };
  } catch (error) {
    state.manuscript = null;
    state.error = error.message || "Manuscript extraction failed.";
  } finally {
    state.busy = false;
    render();
  }
}

function fileFormat(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".docx")) return "docx";
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".rtf")) return "rtf";
  if (name.endsWith(".md")) return "md";
  if (name.endsWith(".txt")) return "txt";
  throw new Error("Use TXT, MD, RTF, DOCX, or PDF.");
}

async function extract(file, format) {
  if (format === "docx") {
    const module = await importWithFallback(libraries.mammoth);
    const api = module.default || module;
    return { text: (await api.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value || "" };
  }
  if (format === "pdf") {
    const pdf = await importWithFallback(libraries.pdf);
    if (pdf.GlobalWorkerOptions) pdf.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs";
    const document = await pdf.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
    if (document.numPages > 400) throw new Error("PDF manuscripts are limited to 400 pages.");
    const pages = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map(item => item.str || "").join(" "));
    }
    return { text: pages.join("\n\n"), pages: pages.length };
  }
  const raw = await file.text();
  return { text: format === "rtf" ? raw.replace(/\\par[d]?\b/g, "\n").replace(/\\[a-zA-Z]+-?\d* ?/g, "").replace(/[{}]/g, "") : raw };
}

async function importWithFallback(urls) {
  let lastError;
  for (const url of urls) {
    try { return await import(url); }
    catch (error) { lastError = error; }
  }
  throw new Error(`Extraction service unavailable${lastError?.message ? `: ${lastError.message}` : ""}.`);
}

async function coverPayload(file) {
  if (!["image/png", "image/jpeg"].includes(file.type)) throw new Error("Cover must be PNG or JPEG.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Cover must be 8 MB or smaller.");
  return { name: file.name, type: file.type, dataBase64: await fileBase64(file) };
}

async function manuscriptPayload(manuscript) {
  return {
    name: manuscript.name,
    mimeType: manuscript.mimeType,
    format: manuscript.format,
    text: manuscript.text,
    pages: manuscript.pages,
    words: manuscript.words,
    checksum: manuscript.checksum,
    sourceDataBase64: await fileBase64(manuscript.file),
  };
}

function fileBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`${file.name || "File"} could not be read.`));
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.readAsDataURL(file);
  });
}

async function checksum(file) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
}

function normalize(value) {
  return String(value || "").replace(/\r\n?/g, "\n").replace(/\u0000/g, "").replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function mimeFor(format) {
  return ({
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    rtf: "application/rtf",
    md: "text/markdown",
    txt: "text/plain",
  })[format] || "application/octet-stream";
}

function reset() {
  state.job = null;
  state.cover = null;
  state.manuscript = null;
  state.shopify = null;
  state.error = "";
  sessionStorage.removeItem("kairos.complete-product.job");
  render();
}

function fail(message) {
  state.error = message;
  state.busy = false;
  render();
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function safeAttr(value) {
  return escapeHTML(value).replace(/`/g, "&#96;");
}

window.addEventListener("kairos:complete-product:restore", event => {
  const job = event.detail?.job;
  if (!job?.projectId) return;
  state.job = job;
  state.open = true;
  state.error = "";
  sessionStorage.setItem("kairos.complete-product.job", JSON.stringify(job));
  render();
  if (job.pollURL && !["completed", "needs-attention", "awaiting-cover-approval"].includes(job.status)) poll(job.pollURL);
});

const persisted = (() => {
  try { return JSON.parse(sessionStorage.getItem("kairos.complete-product.job") || "null"); }
  catch { return null; }
})();
if (persisted?.projectId) state.job = persisted;
mount();
