export const KAIROS_SHOPIFY_PUBLICATION_HANDOFF_BUILD = "kairos-shopify-publication-handoff-20260727-1";

export function createKairosShopifyPublicationHandoff(product = {}, input = {}) {
  if (product.state !== "ready_to_publish" || product.approval?.status !== "approved") throw handoffError("REVENUE_PRODUCT_NOT_APPROVED", "Revenue product must be approved before Shopify handoff.", 409);
  if (product.qualityAssurance?.status !== "passed") throw handoffError("REVENUE_QA_NOT_PASSED", "Revenue product QA must pass before Shopify handoff.", 409);
  const submittedByIdentityHash = clean(input.operatorIdentityHash, 180);
  if (!submittedByIdentityHash) throw handoffError("HANDOFF_OPERATOR_REQUIRED", "Hashed operator identity is required.");
  return Object.freeze({
    handoffId: clean(input.handoffId, 180) || `shopify_handoff_${stableHash(product.revenueProductId)}`,
    revenueProductId: clean(product.revenueProductId, 180),
    projectId: clean(product.projectId, 180) || null,
    state: "submitted_for_governed_publication",
    submittedAt: normalizeIso(input.submittedAt || new Date().toISOString()),
    submittedByIdentityHash,
    shopifyPayload: Object.freeze({ ...(product.commercePackage?.shopifyProduct || {}), status: "DRAFT" }),
    mediaManifest: Object.freeze([...(product.commercePackage?.mediaManifest || [])]),
    downloadManifest: Object.freeze([...(product.commercePackage?.downloadManifest || [])]),
    approvalReference: Object.freeze({ approvedByIdentityHash: product.approval.approvedByIdentityHash, approvedAt: product.approval.approvedAt }),
    publicationExecutionAllowed: false,
    commerceMutationAllowed: false,
    requiresGovernedShopifyWorkflow: true,
  });
}

function stableHash(value) { let hash = 2166136261; for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return (hash >>> 0).toString(16).padStart(8, "0"); }
function normalizeIso(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString(); }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function handoffError(code, message, status = 400) { const error = new Error(message); error.code = code; error.status = status; return error; }
