export const KAIROS_FIRST_PACKAGE_REVIEW_BUILD = "kairos-first-package-review-20260728-1";

const PACKAGE_TYPES = new Set(["digital-edition", "editable-source", "complete-package"]);

export async function reviewFirstPackageAsset(context = {}, input = {}) {
  if (!input.authorization || !input.operatorEmail || !input.operatorIdentityHash) {
    throw runtimeError("KAIROS_OPERATOR_AUTH_REQUIRED", "Authenticated operator identity is required.", 401);
  }
  if (!PACKAGE_TYPES.has(input.assetType)) throw runtimeError("PACKAGE_ASSET_TYPE_INVALID", "Unsupported package asset type.", 400);
  if (!new Set(["approved", "rejected"]).has(input.decision)) throw runtimeError("PACKAGE_QA_DECISION_INVALID", "Package QA decision must be approved or rejected.", 400);
  if (input.decision === "rejected" && !String(input.notes || "").trim()) throw runtimeError("PACKAGE_QA_NOTES_REQUIRED", "Rejection notes are required.", 409);

  const product = await context.revenueStore?.getRevenueProduct?.(input.revenueProductId);
  if (!product) throw runtimeError("REVENUE_PRODUCT_NOT_FOUND", "Revenue product was not found.", 404);
  const asset = (product.assets || []).find((candidate) => candidate.assetId === input.assetId && candidate.type === input.assetType);
  if (!asset) throw runtimeError("PACKAGE_ASSET_NOT_FOUND", "Package asset was not found.", 404);
  if (!asset.checksum || !asset.storageRef) throw runtimeError("PACKAGE_ASSET_EVIDENCE_REQUIRED", "Checksum-backed storage evidence is required before package QA.", 409);

  const reviewedAt = new Date().toISOString();
  const packageQa = Object.freeze({
    decision: input.decision,
    notes: String(input.notes || "").trim() || null,
    checksum: asset.checksum,
    reviewedAt,
    reviewedByIdentityHash: input.operatorIdentityHash,
    reviewedByEmail: input.operatorEmail,
  });
  const updated = { ...asset, packageQa };
  await context.revenueStore?.replaceRevenueAsset?.(product.revenueProductId, updated);
  return Object.freeze({ revenueProductId: product.revenueProductId, asset: Object.freeze(updated), automaticPublicationAllowed: false, build: KAIROS_FIRST_PACKAGE_REVIEW_BUILD });
}

function runtimeError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}
