const BUILD = "kairos-product-media-ui-20260713-1";
const originalFetch = window.fetch.bind(window);
const state = { productRelease: null, media: null, busy: false, error: "" };

window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  try {
    const url = String(typeof args[0] === "string" ? args[0] : args[0]?.url || "");
    if (url.includes("/api/shopify/product-publication/execute")) {
      const body = await response.clone().json();
      if (response.ok && body?.status === "draft-created-and-verified") {
        state.productRelease = body;
        state.media = null;
        sessionStorage.setItem("kairos.product.publication", JSON.stringify(body));
        queueMicrotask(render);
      }
    }
  } catch {
    // Product creation must not fail because the optional media observer failed.
  }
  return response;
};

function render() {
  const host = document.querySelector("#complete-product-overlay .creation-engine-shopify");
  if (!host) return;
  host.querySelector("#kairos-product-media")?.remove();
  const publication = state.productRelease || read("kairos.product.publication");
  if (!publication?.releaseId || publication.status !== "draft-created-and-verified") return;
  const section = document.createElement("section");
  section.id = "kairos-product-media";
  section.className = "creation-engine-media";
  section.innerHTML = view(publication);
  host.insertAdjacentElement("afterend", section);
  bind(section);
}

function view(publication) {
  if (state.busy) return `<p class="eyebrow">Product media</p><h3>Installing and verifying Shopify media…</h3><p>Kairos is attaching the approved cover, registering product graphics, preserving existing media, and creating rollback evidence.</p>`;
  if (state.error) return `<p class="eyebrow">Product media</p><h3>Media installation needs attention</h3><p class="creation-engine-error">${esc(state.error)}</p><button class="secondary" data-media-retry>Retry</button>`;
  if (!state.media) return `<p class="eyebrow">Product media</p><h3>Install cover and product assets</h3><p>The verified Shopify draft is ready. Kairos will install the approved cover as the featured product image and register the approved product and social graphics in Shopify Files.</p><button class="primary" data-media-prepare>Prepare Media Installation</button>`;
  const record = state.media;
  if (record.status === "awaiting-media-approval") {
    return `<p class="eyebrow">Product media proposal</p><h3>${esc(record.product?.title || publication.result?.title || "Draft product")}</h3><div class="creation-engine-contract"><strong>Approved cover</strong><p>${esc(record.desired?.cover?.name || "Cover")} → featured product image</p></div><div class="creation-engine-media-list">${(record.desired?.files || []).map(item => `<span>${esc(item.name)}<small>${esc(item.role)}</small></span>`).join("")}</div><p class="creation-engine-note">Existing product media is preserved. The product remains DRAFT. Storefront publication is not authorized.</p><label>Type ${esc(record.confirmationRequired)}<input data-media-confirm autocomplete="off"></label><button class="primary" data-media-execute>Approve and Install Media</button>`;
  }
  const files = record.result?.files || [];
  const featured = record.result?.featuredMedia || {};
  return `<p class="eyebrow">Product media</p><h3>${esc(record.status)}</h3><div class="creation-engine-contract"><strong>Featured cover verified</strong><p>${esc(featured.alt || "Approved product cover")} · ${esc(featured.status || "verified")}</p></div><p>${files.length} approved product and social asset${files.length === 1 ? "" : "s"} registered in Shopify Files.</p><p class="creation-engine-note">The draft product is now ready for product-page visual verification and Resource Release Control.</p><label>Rollback confirmation<input data-media-rollback-confirm placeholder="ROLL BACK PRODUCT MEDIA"></label><button class="secondary" data-media-rollback>Roll Back Product Media</button>`;
}

function bind(section) {
  section.querySelector("[data-media-prepare]")?.addEventListener("click", prepare);
  section.querySelector("[data-media-execute]")?.addEventListener("click", execute);
  section.querySelector("[data-media-rollback]")?.addEventListener("click", rollback);
  section.querySelector("[data-media-retry]")?.addEventListener("click", () => { state.error = ""; render(); });
}

async function prepare() {
  const publication = state.productRelease || read("kairos.product.publication");
  await run("/api/shopify/product-media/prepare", { productReleaseId: publication.releaseId });
}
async function execute() {
  const confirmation = document.querySelector("[data-media-confirm]")?.value || "";
  await run("/api/shopify/product-media/execute", { releaseId: state.media.releaseId, confirmation, actor: "Executive" });
}
async function rollback() {
  const confirmation = document.querySelector("[data-media-rollback-confirm]")?.value || "";
  await run("/api/shopify/product-media/rollback", { releaseId: state.media.releaseId, confirmation, actor: "Executive" });
}
async function run(url, payload) {
  state.busy = true;
  state.error = "";
  render();
  try {
    const response = await originalFetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD }, body: JSON.stringify(payload) });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message || "Product media installation failed.");
    state.media = body;
    sessionStorage.setItem("kairos.product.media", JSON.stringify(body));
  } catch (error) {
    state.error = error?.message || "Product media installation failed.";
  } finally {
    state.busy = false;
    render();
  }
}
function read(key) { try { return JSON.parse(sessionStorage.getItem(key) || "null"); } catch { return null; } }
function esc(value) { return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[character]); }

const observer = new MutationObserver(render);
observer.observe(document.documentElement, { childList: true, subtree: true });
