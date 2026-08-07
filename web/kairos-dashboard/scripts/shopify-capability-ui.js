const BUILD = "kairos-shopify-capability-ui-20260807-1";

const APPS = Object.freeze({
  "knowledge-library": cfg("Shopify evidence", ["shopify.site.inspect", "shopify.product.read"], "Read verified storefront/product state into Knowledge. No Shopify writes."),
  "research-brief": cfg("Shopify evidence", ["shopify.site.inspect", "shopify.product.read"], "Use first-party Shopify state as research evidence. No Shopify writes."),
  website: cfg("Shopify site control", ["shopify.site.inspect", "shopify.page.create", "shopify.page.update", "shopify.menu.create", "shopify.menu.update", "shopify.theme.files.upsert"], "Full redesigns stay in Website Retool's stage → review → approve → execute → verify flow. Use these controls only for bounded Shopify actions."),
  "product-launch": cfg("Shopify launch control", ["shopify.product.create", "shopify.product.update", "shopify.product.publish", "shopify.collection.create", "shopify.collection.update"], "Products create as DRAFT by default. Publishing is a separate critical approval."),
  "offer-builder": cfg("Shopify offer control", ["shopify.product.create", "shopify.product.update", "shopify.collection.create", "shopify.collection.update"], "Translate approved offers into bounded product/collection fields. Do not publish automatically."),
  "customer-journey": cfg("Shopify journey content", ["shopify.site.inspect", "shopify.page.create", "shopify.page.update"], "Use only for public help/onboarding/FAQ/portal gateway content. Customer PII and order mutation are prohibited."),
  "support-intelligence": cfg("Shopify support content", ["shopify.site.inspect", "shopify.page.create", "shopify.page.update"], "Turn recurring support findings into approved public help content. Never mutate customer records."),
  "release-control": cfg("Shopify release control", ["shopify.site.inspect", "shopify.menu.create", "shopify.menu.update", "shopify.theme.files.upsert"], "Stage and verify approved site changes. Theme file writes are blocked on the live MAIN theme."),
  "system-registry": cfg("Shopify system control", ["shopify.site.inspect", "shopify.theme.files.upsert"], "Inspect Shopify structure and perform only approved non-live theme-file actions."),
});

const TOOL = Object.freeze({
  "shopify.site.inspect": tool("Inspect site", {}),
  "shopify.product.read": tool("Read product", { productId: "gid://shopify/Product/1234567890" }),
  "shopify.product.create": tool("Create product draft", { title: "New Product", descriptionHtml: "<p>Customer-facing description.</p>", vendor: "Mindset Media Group", productType: "Digital Download", tags: ["Digital Download"], status: "DRAFT", seoTitle: "New Product", seoDescription: "Search description." }),
  "shopify.product.update": tool("Update product", { productId: "gid://shopify/Product/1234567890", changes: { title: "Updated Product Title", seoTitle: "Updated SEO title", seoDescription: "Updated SEO description." } }),
  "shopify.product.publish": tool("Publish product", { productId: "gid://shopify/Product/1234567890", publicationId: "gid://shopify/Publication/1234567890" }),
  "shopify.collection.create": tool("Create collection", { title: "New Collection", descriptionHtml: "<p>Collection description.</p>", handle: "new-collection", productIds: [], sortOrder: "MANUAL", seoTitle: "New Collection", seoDescription: "Collection SEO description." }),
  "shopify.collection.update": tool("Update collection", { collectionId: "gid://shopify/Collection/1234567890", changes: { title: "Updated Collection", seoTitle: "Updated Collection" } }),
  "shopify.page.create": tool("Create page draft", { title: "New Page", body: "<p>Page content.</p>", handle: "new-page", isPublished: false }),
  "shopify.page.update": tool("Update page", { pageId: "gid://shopify/Page/1234567890", changes: { title: "Updated Page", body: "<p>Updated page content.</p>" } }),
  "shopify.menu.create": tool("Create navigation", { title: "Footer Resources", handle: "footer-resources", items: [{ title: "Home", type: "FRONTPAGE" }] }),
  "shopify.menu.update": tool("Update navigation", { menuId: "gid://shopify/Menu/1234567890", title: "Main menu", items: [{ title: "Home", type: "FRONTPAGE" }] }),
  "shopify.theme.files.upsert": tool("Stage theme files", { themeId: "gid://shopify/OnlineStoreTheme/1234567890", files: [{ filename: "sections/example.liquid", body: "<section>Approved staged content</section>" }] }),
});

let dialog;
let activeApp;
let activeTool;
let proposal;

installStyles();
annotate();
new MutationObserver(annotate).observe(document.documentElement, { childList: true, subtree: true });

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-kairos-shopify]");
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  openPanel(button.dataset.kairosShopify);
}, true);

function annotate() {
  document.querySelectorAll(".child-card .child-action[data-child]").forEach((primary) => {
    const id = primary.dataset.child;
    const config = APPS[id];
    if (!config) return;
    const card = primary.closest(".child-card");
    if (!card || card.querySelector("[data-kairos-shopify]")) return;
    const badge = document.createElement("span");
    badge.className = "kairos-shopify-badge";
    badge.textContent = "Shopify enabled";
    card.querySelector("h3")?.after(badge);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "kairos-shopify-action";
    button.dataset.kairosShopify = id;
    button.textContent = config.label;
    primary.insertAdjacentElement("afterend", button);
  });
}

function openPanel(appId) {
  activeApp = appId;
  activeTool = APPS[appId]?.tools?.[0] || "shopify.site.inspect";
  proposal = null;
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.className = "kairos-shopify-dialog";
    document.body.append(dialog);
  }
  renderPanel();
  if (!dialog.open) dialog.showModal();
}

function renderPanel(message = "") {
  const config = APPS[activeApp];
  const selected = TOOL[activeTool];
  dialog.innerHTML = `<form method="dialog" class="kairos-shopify-shell"><header><div><p class="kairos-shopify-eyebrow">Kairos · Governed Shopify</p><h2>${escapeHTML(config.label)}</h2></div><button class="kairos-shopify-close" value="cancel" aria-label="Close">×</button></header><p>${escapeHTML(config.instruction)}</p><div class="kairos-shopify-rule"><strong>Execution rule</strong><span>Credentials stay server-side. Mutations require durable approval. MAIN-theme file writes, deletes, customer PII, orders, money operations, and arbitrary GraphQL are blocked.</span></div><label>Action<select id="kairos-shopify-tool">${config.tools.map((id) => `<option value="${id}" ${id === activeTool ? "selected" : ""}>${escapeHTML(TOOL[id]?.label || id)}</option>`).join("")}</select></label><label>Approved arguments<textarea id="kairos-shopify-args" spellcheck="false">${escapeHTML(JSON.stringify(selected.template, null, 2))}</textarea></label><p class="kairos-shopify-help">Edit only the fields required for this action. Shopify GIDs must use the exact <code>gid://shopify/…</code> form.</p>${message ? `<div class="kairos-shopify-result">${message}</div>` : ""}<div class="kairos-shopify-actions"><button type="button" class="primary" id="kairos-shopify-prepare">${activeTool === "shopify.site.inspect" || activeTool === "shopify.product.read" ? "Run verified read" : "Prepare approval"}</button><button value="cancel" class="secondary">Close</button></div><div id="kairos-shopify-approval"></div></form>`;
  dialog.querySelector("#kairos-shopify-tool").addEventListener("change", (event) => { activeTool = event.target.value; proposal = null; renderPanel(); });
  dialog.querySelector("#kairos-shopify-prepare").addEventListener("click", prepare);
}

async function prepare() {
  const textarea = dialog.querySelector("#kairos-shopify-args");
  let args;
  try { args = JSON.parse(textarea.value || "{}"); }
  catch { return setResult("Invalid JSON. Correct the approved arguments before continuing.", true); }
  setBusy(true);
  try {
    const response = await fetch("/api/kairos", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json", "X-Kairos-Request-Id": `shopify-ui-${crypto.randomUUID()}` }, body: JSON.stringify({ objective: `Execute governed Shopify capability ${activeTool}.`, context: APPS[activeApp].instruction, toolRequest: { toolId: activeTool, arguments: args } }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok && response.status !== 202) throw new Error(payload?.error?.message || `Kairos returned HTTP ${response.status}.`);
    const action = Array.isArray(payload.actions) ? payload.actions.find((item) => item.type === "tool_approval") : null;
    if (action?.approvalId) {
      proposal = action;
      renderApproval(action);
    } else {
      const evidence = payload.toolEvidence?.[0]?.result || payload.result || payload;
      setResult(`<strong>Verified.</strong><pre>${escapeHTML(JSON.stringify(evidence, null, 2))}</pre>`, false, true);
    }
  } catch (error) { setResult(error.message || "The Shopify capability request failed.", true); }
  finally { setBusy(false); }
}

function renderApproval(action) {
  const area = dialog.querySelector("#kairos-shopify-approval");
  area.innerHTML = `<div class="kairos-shopify-approval"><p><strong>Approval required</strong></p><p>Tool: ${escapeHTML(action.toolLabel || action.toolId)} · Risk: ${escapeHTML(action.risk || "high")}</p><code>${escapeHTML(action.confirmationRequired || `APPROVE ${action.approvalId}`)}</code><p>No Shopify mutation has run yet.</p><button type="button" class="primary" id="kairos-shopify-execute">Approve & execute</button></div>`;
  area.querySelector("#kairos-shopify-execute").addEventListener("click", continueApproval);
}

async function continueApproval() {
  if (!proposal?.approvalId) return;
  setBusy(true);
  try {
    const confirmation = proposal.confirmationRequired || `APPROVE ${proposal.approvalId}`;
    const response = await fetch("/api/kairos/tools/continue", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ approvalId: proposal.approvalId, confirmation }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || `Kairos returned HTTP ${response.status}.`);
    proposal = null;
    setResult(`<strong>Shopify action completed and recorded.</strong><pre>${escapeHTML(JSON.stringify(payload.result || payload, null, 2))}</pre>`, false, true);
  } catch (error) { setResult(error.message || "Approved Shopify execution failed.", true); }
  finally { setBusy(false); }
}

function setResult(value, error = false, html = false) {
  const area = dialog.querySelector(".kairos-shopify-result") || document.createElement("div");
  area.className = `kairos-shopify-result${error ? " error" : ""}`;
  if (!area.isConnected) dialog.querySelector(".kairos-shopify-actions").before(area);
  if (html) area.innerHTML = value; else area.textContent = value;
}

function setBusy(busy) { dialog.querySelectorAll("button,select,textarea").forEach((element) => { if (!element.classList.contains("kairos-shopify-close")) element.disabled = busy; }); }
function cfg(label, tools, instruction) { return Object.freeze({ label, tools: Object.freeze(tools), instruction }); }
function tool(label, template) { return Object.freeze({ label, template: Object.freeze(template) }); }
function escapeHTML(value) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[char])); }

function installStyles() {
  if (document.querySelector("#kairos-shopify-capability-style")) return;
  const style = document.createElement("style"); style.id = "kairos-shopify-capability-style";
  style.textContent = `.kairos-shopify-badge{display:inline-flex;margin:-2px 0 12px;padding:5px 9px;border:1px solid rgba(114,220,255,.32);border-radius:999px;color:#72dcff;background:rgba(114,220,255,.08);font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.kairos-shopify-action{width:100%;margin-top:8px;padding:11px 14px;border:1px solid #24465d;border-radius:12px;background:#0a1720;color:#bfeeff;font:inherit;font-weight:750;cursor:pointer}.kairos-shopify-dialog{width:min(760px,calc(100vw - 24px));max-height:88vh;padding:0;border:1px solid #1b3446;border-radius:22px;background:#071018;color:#f5f8fb;box-shadow:0 30px 80px rgba(0,0,0,.6)}.kairos-shopify-dialog::backdrop{background:rgba(0,0,0,.72);backdrop-filter:blur(8px)}.kairos-shopify-shell{display:grid;gap:16px;padding:22px}.kairos-shopify-shell header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.kairos-shopify-shell h2{margin:2px 0;font-size:24px}.kairos-shopify-eyebrow{margin:0;color:#72dcff;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.kairos-shopify-close{border:0;background:transparent;color:#d8e4ec;font-size:28px;cursor:pointer}.kairos-shopify-shell label{display:grid;gap:7px;font-size:13px;font-weight:700}.kairos-shopify-shell select,.kairos-shopify-shell textarea{width:100%;box-sizing:border-box;border:1px solid #27465a;border-radius:12px;background:#050b10;color:#eef7fc;padding:12px;font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace}.kairos-shopify-shell textarea{min-height:210px;resize:vertical}.kairos-shopify-rule,.kairos-shopify-approval,.kairos-shopify-result{display:grid;gap:6px;padding:14px;border:1px solid #1e3a4d;border-radius:14px;background:#091722}.kairos-shopify-rule span,.kairos-shopify-help{color:#9eb0bf;font-size:12px}.kairos-shopify-actions{display:flex;flex-wrap:wrap;gap:10px}.kairos-shopify-shell .primary,.kairos-shopify-shell .secondary{padding:11px 15px;border-radius:12px;font:inherit;font-weight:800;cursor:pointer}.kairos-shopify-shell .primary{border:1px solid #4ccdf5;background:#0b84ad;color:white}.kairos-shopify-shell .secondary{border:1px solid #2b3e4b;background:#0b1017;color:#dbe8ef}.kairos-shopify-result.error{border-color:#71313a;color:#ffb6bf}.kairos-shopify-result pre{max-height:240px;overflow:auto;white-space:pre-wrap;font-size:11px}.kairos-shopify-approval code{display:block;padding:10px;border-radius:9px;background:#03080c;color:#72dcff;overflow:auto}`;
  document.head.append(style);
}

window.__KAIROS_SHOPIFY_CAPABILITIES__ = Object.freeze({ build: BUILD, apps: APPS, tools: TOOL });
