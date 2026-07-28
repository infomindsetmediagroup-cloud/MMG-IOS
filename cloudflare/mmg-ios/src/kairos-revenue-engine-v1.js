import { createKairosRevenueProductBlueprint, KAIROS_REVENUE_PRODUCT_BLUEPRINT_BUILD } from "./kairos-revenue-product-blueprint-v1.js";
import { createKairosShopifyCommercePackage, KAIROS_SHOPIFY_COMMERCE_PACKAGE_BUILD } from "./kairos-shopify-commerce-package-v1.js";
import { evaluateKairosRevenueProduct, KAIROS_REVENUE_PRODUCT_QA_BUILD } from "./kairos-revenue-product-qa-v1.js";

export const KAIROS_REVENUE_ENGINE_BUILD = "kairos-revenue-engine-20260727-1";

export function buildKairosRevenueProduct(input = {}) {
  const blueprint = createKairosRevenueProductBlueprint(input.blueprint || input);
  const assets = normalizeAssets(input.assets);
  const commercePackage = createKairosShopifyCommercePackage(blueprint, assets, input.commerce || {});
  const qualityAssurance = evaluateKairosRevenueProduct(blueprint, commercePackage, assets, input.qualityAssurance || {});
  const state = deriveState(assets, commercePackage, qualityAssurance);
  return Object.freeze({
    revenueProductId: clean(input.revenueProductId, 180) || `rev_${stableHash(`${blueprint.blueprintId}:${commercePackage.packageId}`)}`,
    state,
    blueprint,
    assets: Object.freeze(assets),
    commercePackage,
    qualityAssurance,
    nextAction: deriveNextAction(state, commercePackage, qualityAssurance),
    approval: Object.freeze({ required: true, status: clean(input.approval?.status || "pending", 40), approvedByIdentityHash: clean(input.approval?.approvedByIdentityHash, 180) || null, approvedAt: normalizeIso(input.approval?.approvedAt), rationale: clean(input.approval?.rationale, 1000) || null }),
    publicationApprovalRequired: true,
    deploymentExecutionAllowed: false,
    commerceMutationAllowed: false,
    externalPublicationAllowed: false,
    builds: Object.freeze({ engine: KAIROS_REVENUE_ENGINE_BUILD, blueprint: KAIROS_REVENUE_PRODUCT_BLUEPRINT_BUILD, commerce: KAIROS_SHOPIFY_COMMERCE_PACKAGE_BUILD, qa: KAIROS_REVENUE_PRODUCT_QA_BUILD }),
  });
}

export function approveKairosRevenueProduct(product = {}, input = {}) {
  if (product.qualityAssurance?.readyForApproval !== true) throw revenueError("QA_NOT_PASSED", "Revenue product cannot be approved until QA passes.", 409);
  const identityHash = clean(input.approvedByIdentityHash, 180);
  if (!identityHash) throw revenueError("APPROVER_REQUIRED", "Hashed approver identity is required.");
  return Object.freeze({ ...product, state: "ready_to_publish", approval: Object.freeze({ required: true, status: "approved", approvedByIdentityHash: identityHash, approvedAt: normalizeIso(input.approvedAt || new Date().toISOString()), rationale: clean(input.rationale, 1000) || null }), nextAction: Object.freeze({ type: "governed_shopify_publish", label: "Submit approved package to governed Shopify publication workflow" }), deploymentExecutionAllowed: false, commerceMutationAllowed: false, externalPublicationAllowed: false });
}

function deriveState(assets, commercePackage, qa) { if (!assets.length) return "blueprint"; if (commercePackage.missingAssets?.length) return "asset_generation"; if (!commercePackage.readyForReview) return "commerce_packaging"; if (qa.status !== "passed") return "quality_assurance"; return "approval"; }
function deriveNextAction(state, commercePackage, qa) { if (state === "blueprint") return Object.freeze({ type: "generate_content", label: "Generate product content and assets" }); if (state === "asset_generation") return Object.freeze({ type: "generate_missing_assets", label: `Generate ${commercePackage.missingAssets.length} missing assets` }); if (state === "commerce_packaging") return Object.freeze({ type: "complete_shopify_package", label: "Complete Shopify commerce package" }); if (state === "quality_assurance") return Object.freeze({ type: "resolve_qa_blockers", label: `Resolve ${qa.blockers.length} QA blockers` }); return Object.freeze({ type: "approve_product", label: "Approve product for governed publication" }); }
function normalizeAssets(value) { return (Array.isArray(value) ? value : []).slice(0, 200).map((asset) => Object.freeze({ assetId: clean(asset.assetId, 180), type: clean(asset.type, 100), filename: clean(asset.filename, 240), version: Math.max(1, Math.floor(Number(asset.version) || 1)), checksum: clean(asset.checksum, 180) || null, storageRef: clean(asset.storageRef, 500) || null, status: clean(asset.status || "ready", 40) })).filter((asset) => asset.assetId && asset.type && asset.filename); }
function stableHash(value) { let hash = 2166136261; for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return (hash >>> 0).toString(16).padStart(8, "0"); }
function normalizeIso(value) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function revenueError(code, message, status = 400) { const error = new Error(message); error.code = code; error.status = status; return error; }
