export const KAIROS_SHOPIFY_COMMERCE_PACKAGE_BUILD = "kairos-shopify-commerce-package-20260727-1";

export function createKairosShopifyCommercePackage(blueprint = {}, assets = [], input = {}) {
  const title = clean(input.title || blueprint.title, 255);
  if (!title) throw commerceError("TITLE_REQUIRED", "Shopify product title is required.");
  const assetMap = new Map((Array.isArray(assets) ? assets : []).map((asset) => [clean(asset.type, 100), asset]));
  const missingAssets = (blueprint.requiredAssets || []).filter((type) => type !== "shopify_package" && !assetMap.has(type));
  const handle = slug(input.handle || title);
  const descriptionHtml = cleanHtml(input.descriptionHtml || defaultDescription(blueprint), 20000);
  const seoTitle = clean(input.seoTitle || title, 70);
  const metaDescription = clean(input.metaDescription || blueprint.objective, 160);
  const tags = unique([...(input.tags || []), "Kairos Generated", "Digital Product", blueprint.productType].map((item) => clean(item, 80)).filter(Boolean)).slice(0, 40);
  return Object.freeze({
    packageId: clean(input.packageId, 180) || `scp_${stableHash(`${blueprint.blueprintId}:${handle}`)}`,
    blueprintId: clean(blueprint.blueprintId, 180),
    product: Object.freeze({
      title,
      handle,
      status: "draft",
      productType: humanize(blueprint.productType),
      vendor: clean(input.vendor || "Mindset Media Group", 255),
      descriptionHtml,
      tags: Object.freeze(tags),
      collections: Object.freeze(unique((input.collections || []).map((item) => clean(item, 180)).filter(Boolean)).slice(0, 20)),
      price: Number(blueprint.price || 0).toFixed(2),
      currency: clean(blueprint.currency || "USD", 3),
      requiresShipping: false,
      taxable: input.taxable === true,
    }),
    seo: Object.freeze({ title: seoTitle, metaDescription }),
    mediaManifest: Object.freeze([...assetMap.values()].filter((asset) => ["cover", "product_image", "preview_image", "social_graphic"].includes(clean(asset.type, 100))).slice(0, 20).map(projectAsset)),
    downloadManifest: Object.freeze([...assetMap.values()].filter((asset) => !["cover", "product_image", "preview_image", "social_graphic"].includes(clean(asset.type, 100))).slice(0, 100).map(projectAsset)),
    missingAssets: Object.freeze(missingAssets),
    readyForReview: missingAssets.length === 0 && Boolean(descriptionHtml && seoTitle && metaDescription),
    publicationApprovalRequired: true,
    commerceMutationAllowed: false,
    externalPublicationAllowed: false,
    build: KAIROS_SHOPIFY_COMMERCE_PACKAGE_BUILD,
  });
}

function projectAsset(asset) { return Object.freeze({ assetId: clean(asset.assetId, 180), type: clean(asset.type, 100), filename: clean(asset.filename, 240), version: Math.max(1, Math.floor(Number(asset.version) || 1)), checksum: clean(asset.checksum, 180) || null, storageRef: clean(asset.storageRef, 500) || null }); }
function defaultDescription(blueprint) { return `<section><h2>${escapeHtml(blueprint.title)}</h2><p>${escapeHtml(blueprint.objective)}</p><h3>Built for</h3><p>${escapeHtml(blueprint.audience)}</p><h3>What you receive</h3><ul>${(blueprint.requiredAssets || []).filter((item) => item !== "shopify_package").map((item) => `<li>${escapeHtml(humanize(item))}</li>`).join("")}</ul></section>`; }
function cleanHtml(value, max) { return String(value || "").replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "").replace(/\son\w+\s*=\s*(["']).*?\1/gi, "").slice(0, max); }
function slug(value) { return clean(value, 255).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 180); }
function humanize(value) { return clean(value, 100).replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase()); }
function unique(values) { return [...new Set(values)]; }
function stableHash(value) { let hash = 2166136261; for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return (hash >>> 0).toString(16).padStart(8, "0"); }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function escapeHtml(value) { return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }
function commerceError(code, message, status = 400) { const error = new Error(message); error.code = code; error.status = status; return error; }
