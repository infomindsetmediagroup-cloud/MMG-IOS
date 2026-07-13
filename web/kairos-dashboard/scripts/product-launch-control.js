const BUILD = "kairos-product-launch-ui-20260713-1";
const originalFetch = window.fetch.bind(window);
const state = { media: null, launch: null, busy: false, error: "", checks: [] };

window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  try {
    const url = String(typeof args[0] === "string" ? args[0] : args[0]?.url || "");
    if (url.includes("/api/shopify/product-media/execute")) {
      const body = await response.clone().json();
      if (response.ok && body?.status === "media-installed-and-verified") {
        state.media = body;
        state.launch = null;
        sessionStorage.setItem("kairos.product.media", JSON.stringify(body));
        queueMicrotask(render);
      }
    }
  } catch {}
  return response;
};

function render() {
  const anchor = document.querySelector("#kairos-product-media");
  if (!anchor) return;
  document.querySelector("#kairos-product-launch")?.remove();
  const media = state.media || read("kairos.product.media");
  if (!media?.releaseId || media.status !== "media-installed-and-verified") return;
  const section = document.createElement("section");
  section.id = "kairos-product-launch";
  section.className = "creation-engine-launch-control";
  section.innerHTML = view(media);
  anchor.insertAdjacentElement("afterend", section);
  bind(section);
}

function view(media) {
  if (state.busy) return `<p class="eyebrow">Product launch</p><h3>Verifying the exact Shopify product state…</h3><p>Kairos is binding the draft product, cover, media, copy, price, SEO, and release evidence.</p>`;
  if (state.error) return `<p class="eyebrow">Product launch</p><h3>Launch control needs attention</h3><p class="creation-engine-error">${esc(state.error)}</p><button class="secondary" data-launch-retry>Retry</button>`;
  if (!state.launch) return `<p class="eyebrow">Product launch</p><h3>Review and publish the finished product</h3><p>The verified draft is ready for a governed product proof, executive visual approval, Online Store publication, live verification, and rollback.</p><button class="primary" data-launch-prepare>Prepare Product Review</button>`;
  const record = state.launch;
  if (record.status === "awaiting-product-visual-review") return reviewView(record);
  if (record.status === "product-visual-review-approved") return publishView(record);
  if (["revision-requested", "rejected"].includes(record.status)) return `<p class="eyebrow">Product launch</p><h3>${esc(record.status)}</h3><p>${esc(record.executiveDecision?.notes || "Return the product to revision before publication.")}</p><button class="secondary" data-launch-reset>Prepare New Review</button>`;
  if (record.publication) return liveView(record);
  return `<p class="eyebrow">Product launch</p><h3>${esc(record.status)}</h3><p>${esc(record.nextAction || "Review the launch record.")}</p>`;
}

function reviewView(record) {
  const p = record.preview || {};
  const image = p.featuredMedia?.image?.url || p.media?.[0]?.image?.url || "";
  const checks = record.requiredChecks || [];
  return `<p class="eyebrow">Executive product proof</p><h3>${esc(p.title || "Draft product")}</h3><div class="creation-engine-product-proof">${image ? `<img src="${attr(image)}" alt="${attr(p.featuredMedia?.alt || p.title || "Product cover")}">` : ""}<div><strong>$${esc(p.price || "—")}</strong><p>${esc(p.seo?.description || "Review the full product description below.")}</p><small>${esc(p.storefrontPath || "")}</small></div></div><details open><summary>Product-page content</summary><div class="creation-engine-html-proof">${p.descriptionHtml || "<p>No product HTML was returned.</p>"}</div></details><div class="creation-engine-checks">${checks.map((item, index) => `<label><input type="checkbox" data-launch-check="${index}"> <span>${esc(item)}</span></label>`).join("")}</div><label>Executive review notes<textarea data-launch-notes maxlength="2000" placeholder="Record required revisions or approval notes."></textarea></label><div class="creation-engine-actions"><button class="primary" data-launch-decision="approved">Approve Product Proof</button><button class="secondary" data-launch-decision="revision-requested">Request Revision</button><button class="secondary" data-launch-decision="rejected">Reject</button></div>`;
}

function publishView(record) {
  return `<p class="eyebrow">Final publication gate</p><h3>Product proof approved</h3><p>Kairos will activate this exact product, publish it to the Shopify Online Store, verify the live route, and retain rollback control.</p><label>Type PUBLISH PRODUCT LIVE<input data-launch-confirm autocomplete="off" placeholder="PUBLISH PRODUCT LIVE"></label><button class="primary danger" data-launch-publish>Publish Product Live</button>`;
}

function liveView(record) {
  const probe = record.publication?.liveProbe || {};
  const rolledBack = Boolean(record.rollback);
  return `<p class="eyebrow">Product launch</p><h3>${esc(record.status)}</h3><div class="creation-engine-contract"><strong>${rolledBack ? "Prior draft state restored" : "Live storefront verification"}</strong><p>${esc(probe.title || record.nextAction || "Product release recorded.")} ${probe.status ? `· HTTP ${esc(probe.status)}` : ""}</p></div>${probe.finalURL && !rolledBack ? `<a class="creation-engine-package" href="${attr(probe.finalURL)}" target="_blank" rel="noopener">Open Live Product</a>` : ""}${!rolledBack ? `<label>Type ROLL BACK LIVE PRODUCT<input data-launch-rollback-confirm autocomplete="off" placeholder="ROLL BACK LIVE PRODUCT"></label><button class="secondary danger" data-launch-rollback>Roll Back Live Product</button>` : ""}`;
}

function bind(section) {
  section.querySelector("[data-launch-prepare]")?.addEventListener("click", prepare);
  section.querySelectorAll("[data-launch-decision]").forEach(button => button.addEventListener("click", () => decide(button.dataset.launchDecision)));
  section.querySelector("[data-launch-publish]")?.addEventListener("click", publish);
  section.querySelector("[data-launch-rollback]")?.addEventListener("click", rollback);
  section.querySelector("[data-launch-reset]")?.addEventListener("click", () => { state.launch = null; state.error = ""; render(); });
  section.querySelector("[data-launch-retry]")?.addEventListener("click", () => { state.error = ""; render(); });
}

async function prepare() {
  const media = state.media || read("kairos.product.media");
  await run("/api/shopify/product-launch/prepare", { mediaReleaseId: media.releaseId });
}
async function decide(decision) {
  const checks = [...document.querySelectorAll("[data-launch-check]")].map(input => input.checked);
  const notes = document.querySelector("[data-launch-notes]")?.value || "";
  await run("/api/shopify/product-launch/decision", { releaseId: state.launch.releaseId, decision, checks, notes, actor: "Executive" });
}
async function publish() {
  const confirmation = document.querySelector("[data-launch-confirm]")?.value || "";
  await run("/api/shopify/product-launch/publish", { releaseId: state.launch.releaseId, confirmation, actor: "Executive" });
}
async function rollback() {
  const confirmation = document.querySelector("[data-launch-rollback-confirm]")?.value || "";
  await run("/api/shopify/product-launch/rollback", { releaseId: state.launch.releaseId, confirmation, actor: "Executive" });
}
async function run(url, payload) {
  state.busy = true; state.error = ""; render();
  try {
    const response = await originalFetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD }, body: JSON.stringify(payload) });
    const body = await response.json();
    if (!response.ok && response.status !== 202) throw new Error(body?.error?.message || "Product launch control failed.");
    state.launch = body;
    sessionStorage.setItem("kairos.product.launch", JSON.stringify(body));
  } catch (error) { state.error = error?.message || "Product launch control failed."; }
  finally { state.busy = false; render(); }
}
function read(key) { try { return JSON.parse(sessionStorage.getItem(key) || "null"); } catch { return null; } }
function esc(value) { return String(value ?? "").replace(/[&<>'"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[c]); }
function attr(value) { return esc(value).replace(/`/g, "&#96;"); }
const observer = new MutationObserver(render);
observer.observe(document.documentElement, { childList: true, subtree: true });
