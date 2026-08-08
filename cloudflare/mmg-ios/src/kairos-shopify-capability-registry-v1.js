import { getKairosTool } from "./kairos-tool-registry-v1.js";

export const KAIROS_SHOPIFY_CAPABILITY_REGISTRY_BUILD = "kairos-shopify-capability-registry-20260807-2-product-page-content";

const DOCTRINE = Object.freeze({
  credentials: "Shopify Admin credentials remain server-side. Never place Admin tokens or raw authenticated Shopify requests in browser code.",
  approval: "Every Shopify mutation must use the Kairos durable proposal, explicit confirmation, single-use execution, and audit trail.",
  verification: "A Shopify mutation is not complete until the executor returns Shopify-confirmed evidence; never infer success from intent alone.",
  themes: "Broad website redesigns use Website Retool staging. Theme file writes must target a server-verified non-MAIN theme; live MAIN theme writes are prohibited.",
  productPages: "Every Shopify product page Kairos writes, rewrites, prepares, or publishes must use mmg-shopify-product-page-canonical-v1. Generate and retain the complete product-page field package: product title, listing title, full HTML description, SEO title, meta description, URL handle, product type, vendor, 3-5 collections, product tags, primary keyword, secondary keywords, price/currency/status, product format, product family, series/book number when applicable, image alt text, canonical URL, social title/description, product media, approved template, release linkage, and digital-delivery state when applicable. Preserve the approved product-page architecture, use DRAFT first, run readback/QC, require separate live approval, and verify the storefront after publication. Missing SEO, canonical, accessibility, taxonomy, commerce, template, media, or applicable delivery/release data is a blocking defect, never a publishable draft.",
  scope: "Use only registered allowlisted Shopify tools. Arbitrary Admin GraphQL, deletes, order/financial mutations, customer PII writes, and theme publishing are outside this capability slice.",
});

const APPS = Object.freeze({
  "knowledge:knowledge-library": app("read_only", ["shopify.site.inspect", "shopify.product.read"], "Use verified Shopify structure or product evidence as knowledge input. Do not mutate Shopify from Knowledge."),
  "knowledge:research-brief": app("read_only", ["shopify.site.inspect", "shopify.product.read"], "Inspect store/product state when research requires current first-party evidence. Keep the result read-only."),
  "content:website": app("staged_site_retool", ["shopify.site.inspect", "shopify.page.create", "shopify.page.update", "shopify.menu.create", "shopify.menu.update", "shopify.theme.files.upsert"], "Retrieve and reuse the approved MMG web-content blueprint before writing. Use Website Retool for full-site or template work: inspect → plan → stage on non-live theme → review → approve → execute → verify. For any Shopify product-page content produced by Website work, apply mmg-shopify-product-page-canonical-v1 exactly, including the complete SEO/canonical/social/accessibility/taxonomy field package and approved product-page architecture. Use discrete tools only for bounded page/navigation/theme-file actions."),
  "business:product-launch": app("approval_gated_commerce", ["shopify.product.create", "shopify.product.update", "shopify.product.publish", "shopify.collection.create", "shopify.collection.update"], "Create products as DRAFT only after the complete mmg-shopify-product-page-canonical-v1 content package is ready. Preserve the approved product-page architecture. Run content/SEO/taxonomy/media/template/delivery QC and Shopify readback before requesting the separate critical live-publication approval; never publish an incomplete contract."),
  "business:offer-builder": app("approval_gated_commerce", ["shopify.product.create", "shopify.product.update", "shopify.collection.create", "shopify.collection.update"], "Translate an approved offer into the complete mmg-shopify-product-page-canonical-v1 package, not a partial listing. Include SEO, canonical/social metadata, accessibility alt text, 3-5 collections, tags/keywords, price/status/format/family, approved template architecture, and applicable release/delivery data. Create or update as DRAFT; do not publish automatically."),
  "customers:customer-journey": app("approval_gated_content", ["shopify.site.inspect", "shopify.page.create", "shopify.page.update"], "Use Shopify page tools only for customer-facing journey content such as help, onboarding, FAQ, or portal gateway copy. Customer PII and account mutation are prohibited."),
  "customers:support-intelligence": app("approval_gated_content", ["shopify.site.inspect", "shopify.page.create", "shopify.page.update"], "Convert recurring support findings into approved public help content. Never write customer records, orders, or private support data to Shopify."),
  "operations:release-control": app("release_control", ["shopify.site.inspect", "shopify.menu.create", "shopify.menu.update", "shopify.theme.files.upsert"], "Verify staging target and approved change set before execution. Theme writes must pass non-MAIN role preflight and final Shopify evidence must be retained."),
  "operations:system-registry": app("read_and_control", ["shopify.site.inspect", "shopify.theme.files.upsert"], "Inspect Shopify site ownership/state and perform only explicitly approved staged theme-file actions."),
});

export function getKairosShopifyCapability(centerId, appId) {
  const key = `${normalize(centerId)}:${normalize(appId)}`;
  const entry = APPS[key];
  if (!entry) return null;
  return { centerId: normalize(centerId), appId: normalize(appId), ...entry, doctrine: { ...DOCTRINE }, build: KAIROS_SHOPIFY_CAPABILITY_REGISTRY_BUILD };
}

export function listKairosShopifyCapabilities() {
  return Object.entries(APPS).map(([key, entry]) => {
    const [centerId, appId] = key.split(":");
    return { centerId, appId, ...entry, build: KAIROS_SHOPIFY_CAPABILITY_REGISTRY_BUILD };
  });
}

export function assertKairosShopifyToolAllowed(centerId, appId, toolId) {
  const capability = getKairosShopifyCapability(centerId, appId);
  const normalizedToolId = normalize(toolId);
  return Boolean(capability && capability.toolIds.includes(normalizedToolId) && getKairosTool(normalizedToolId));
}

export function getKairosShopifyDoctrine() {
  return { ...DOCTRINE, build: KAIROS_SHOPIFY_CAPABILITY_REGISTRY_BUILD };
}

function app(mode, toolIds, instruction) {
  for (const toolId of toolIds) if (!getKairosTool(toolId)) throw new Error(`Unregistered Shopify tool in capability map: ${toolId}`);
  return Object.freeze({ mode, toolIds: Object.freeze([...toolIds]), instruction });
}

function normalize(value) { return String(value || "").trim().toLowerCase(); }
