export const KAIROS_REVENUE_PRODUCT_QA_BUILD = "kairos-revenue-product-qa-20260727-1";

export function evaluateKairosRevenueProduct(blueprint = {}, commercePackage = {}, assets = [], input = {}) {
  const checks = [];
  const assetTypes = new Set((Array.isArray(assets) ? assets : []).map((asset) => clean(asset.type, 100)));
  for (const required of blueprint.requiredAssets || []) {
    if (required === "shopify_package") continue;
    checks.push(check(`asset:${required}`, assetTypes.has(required), `Required asset ${required} is present.`));
  }
  checks.push(check("commerce:package", Boolean(commercePackage.packageId), "Shopify commerce package exists."));
  checks.push(check("commerce:review-ready", commercePackage.readyForReview === true, "Commerce package is ready for review."));
  checks.push(check("seo:title", Boolean(commercePackage.seo?.title), "SEO title is present."));
  checks.push(check("seo:description", Boolean(commercePackage.seo?.metaDescription), "Meta description is present."));
  checks.push(check("product:description", Boolean(commercePackage.product?.descriptionHtml), "Product description is present."));
  checks.push(check("product:handle", Boolean(commercePackage.product?.handle), "Product handle is present."));
  checks.push(check("security:no-publication-authority", commercePackage.externalPublicationAllowed === false, "Publication authority remains disabled."));
  checks.push(check("security:no-commerce-mutation", commercePackage.commerceMutationAllowed === false, "Commerce mutation remains disabled."));
  const customChecks = (Array.isArray(input.customChecks) ? input.customChecks : []).slice(0, 50).map((item, index) => check(`custom:${index + 1}`, item?.passed === true, clean(item?.message, 500) || "Custom acceptance criterion."));
  checks.push(...customChecks);
  const failed = checks.filter((item) => !item.passed);
  return Object.freeze({
    qaId: clean(input.qaId, 180) || `rqa_${stableHash(`${blueprint.blueprintId}:${commercePackage.packageId}`)}`,
    blueprintId: clean(blueprint.blueprintId, 180),
    packageId: clean(commercePackage.packageId, 180),
    status: failed.length ? "failed" : "passed",
    score: checks.length ? Math.round(((checks.length - failed.length) / checks.length) * 100) : 0,
    checks: Object.freeze(checks),
    blockers: Object.freeze(failed.map((item) => item.message)),
    readyForApproval: failed.length === 0,
    publicationApprovalRequired: true,
    deploymentExecutionAllowed: false,
    commerceMutationAllowed: false,
    externalPublicationAllowed: false,
    evaluatedAt: normalizeIso(input.evaluatedAt || new Date().toISOString()),
    build: KAIROS_REVENUE_PRODUCT_QA_BUILD,
  });
}

function check(code, passed, message) { return Object.freeze({ code, passed: passed === true, message: clean(message, 500) }); }
function stableHash(value) { let hash = 2166136261; for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return (hash >>> 0).toString(16).padStart(8, "0"); }
function normalizeIso(value) { const date = new Date(value || 0); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
