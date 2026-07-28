export const KAIROS_SHOPIFY_DRAFT_CREATOR_BUILD = "kairos-shopify-draft-creator-20260728-1";

const PRODUCT_CREATE = `#graphql
mutation KairosCreateDraftProduct($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
  productCreate(product: $product, media: $media) {
    product { id title handle status onlineStoreUrl }
    userErrors { field message }
  }
}`;

export async function createKairosShopifyDraft(product = {}, input = {}, env = {}) {
  requireDraftAuthority(product, input, env);
  const receiver = product.shopifyDraftReceiver;
  const payload = receiver?.payload || {};
  const variables = buildVariables(payload, receiver);
  const result = await shopifyGraphQL(env, PRODUCT_CREATE, variables);
  const errors = result?.data?.productCreate?.userErrors || [];
  if (errors.length) throw draftError("SHOPIFY_DRAFT_CREATE_REJECTED", errors.map((item) => item.message).join("; "), 422, errors);
  const created = result?.data?.productCreate?.product;
  if (!created?.id) throw draftError("SHOPIFY_DRAFT_CREATE_EMPTY", "Shopify did not return a created product.", 502);
  return Object.freeze({
    draftReceiptId: `shopify_draft_${fnv1a(`${product.revenueProductId}:${created.id}`)}`,
    revenueProductId: clean(product.revenueProductId, 180),
    shopifyProductId: created.id,
    title: created.title,
    handle: created.handle,
    status: created.status,
    onlineStoreUrl: created.onlineStoreUrl || null,
    createdAt: new Date().toISOString(),
    createdByIdentityHash: clean(input.operatorIdentityHash, 180) || null,
    productRemainsDraft: created.status === "DRAFT",
    publicationPerformed: false,
    build: KAIROS_SHOPIFY_DRAFT_CREATOR_BUILD,
  });
}

export function attachKairosShopifyDraftReceipt(product = {}, receipt = {}) {
  if (!receipt.shopifyProductId || receipt.revenueProductId !== product.revenueProductId) throw draftError("SHOPIFY_DRAFT_RECEIPT_INVALID", "Shopify draft receipt does not match the revenue product.");
  return Object.freeze({ ...product, shopifyDraftReceipt: Object.freeze({ ...receipt }), state: "shopify_draft_created", updatedAt: new Date().toISOString(), automaticPublicationAllowed: false });
}

function requireDraftAuthority(product, input, env) {
  if (clean(input.confirmation, 120) !== "CREATE SHOPIFY DRAFT") throw draftError("SHOPIFY_DRAFT_CONFIRMATION_REQUIRED", "Use confirmation CREATE SHOPIFY DRAFT.", 409);
  if (String(env.KAIROS_SHOPIFY_DRAFT_WRITES_ENABLED || "").toLowerCase() !== "true") throw draftError("SHOPIFY_DRAFT_WRITES_DISABLED", "Shopify draft creation is disabled.", 403);
  if (!product.shopifyDraftReceiver || product.shopifyDraftReceiver.status !== "received_pending_shopify_draft_creation") throw draftError("SHOPIFY_DRAFT_RECEIVER_REQUIRED", "A governed Shopify draft receiver is required.", 409);
  if ((product.assets || []).some((asset) => asset.editorialQAStatus !== "approved")) throw draftError("SHOPIFY_DRAFT_ASSET_QA_REQUIRED", "Every revenue asset must pass editorial QA before draft creation.", 409);
}

function buildVariables(payload, receiver) {
  const title = clean(payload.title || payload.product?.title, 255);
  if (!title) throw draftError("SHOPIFY_DRAFT_TITLE_REQUIRED", "Shopify draft title is required.");
  const product = {
    title,
    handle: clean(payload.handle || payload.product?.handle, 255) || undefined,
    descriptionHtml: String(payload.descriptionHtml || payload.description || payload.product?.descriptionHtml || "").slice(0, 100000),
    productType: clean(payload.productType || payload.product?.productType, 255) || undefined,
    vendor: clean(payload.vendor || payload.product?.vendor || "Mindset Media Group", 255),
    status: "DRAFT",
    tags: normalizeList(payload.tags || payload.product?.tags, 250),
    seo: { title: clean(payload.seo?.title || payload.seoTitle, 70) || undefined, description: clean(payload.seo?.description || payload.metaDescription, 320) || undefined },
  };
  const media = (receiver?.mediaManifest || []).slice(0, 20).map((item) => ({ originalSource: clean(item.url || item.originalSource, 2000), mediaContentType: clean(item.mediaContentType || "IMAGE", 30), alt: clean(item.alt || item.altText, 512) || undefined })).filter((item) => item.originalSource);
  return { product, media };
}

async function shopifyGraphQL(env, query, variables) {
  const domain = clean(env.SHOPIFY_STORE_DOMAIN, 255).replace(/^https?:\/\//, "").replace(/\/$/, "");
  const token = clean(env.SHOPIFY_ADMIN_ACCESS_TOKEN, 1000);
  const version = clean(env.SHOPIFY_API_VERSION || "2026-07", 20);
  if (!domain || !token) throw draftError("SHOPIFY_CONFIGURATION_MISSING", "Shopify store domain and Admin API token are required.", 503);
  const response = await fetch(`https://${domain}/admin/api/${version}/graphql.json`, { method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token }, body: JSON.stringify({ query, variables }) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.errors?.length) throw draftError("SHOPIFY_GRAPHQL_FAILED", body.errors?.map((item) => item.message).join("; ") || `Shopify returned ${response.status}.`, 502, body.errors || []);
  return body;
}

function normalizeList(value, limit) { return [...new Set((Array.isArray(value) ? value : String(value || "").split(",")).map((item) => clean(item, 255)).filter(Boolean))].slice(0, limit); }
function fnv1a(value){let hash=2166136261;for(const char of String(value))hash=Math.imul(hash^char.charCodeAt(0),16777619);return(hash>>>0).toString(16).padStart(8,"0");}
function clean(value,max){return String(value||"").replace(/\u0000/g,"").trim().slice(0,max);}
function draftError(code,message,status=400,details=[]){const error=new Error(message);error.code=code;error.status=status;error.details=details;return error;}
