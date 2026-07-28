export const KAIROS_FIRST_VISUAL_REVIEW_BUILD = "kairos-first-visual-review-20260728-1";

const REVIEWABLE_TYPES = new Set(["cover", "product-image"]);

export async function recordFirstVisualReview(context = {}, input = {}) {
  if (!input.authorization || !input.operatorEmail || !input.operatorIdentityHash) throw visualError("KAIROS_OPERATOR_AUTH_REQUIRED", "Authenticated operator identity is required.", 401);
  const decision = String(input.decision || "").trim().toLowerCase();
  if (!new Set(["approved", "rejected"]).has(decision)) throw visualError("VISUAL_QA_DECISION_INVALID", "Visual QA decision must be approved or rejected.", 400);
  if (decision === "rejected" && !String(input.notes || "").trim()) throw visualError("VISUAL_QA_REJECTION_NOTES_REQUIRED", "Rejection notes are required.", 409);

  const product = await context.revenueStore?.getRevenueProduct?.(input.revenueProductId);
  if (!product) throw visualError("REVENUE_PRODUCT_NOT_FOUND", "Revenue product was not found.", 404);
  const assets = Array.isArray(product.assets) ? [...product.assets] : [];
  const index = assets.findIndex((asset) => asset.assetId === input.assetId);
  if (index < 0) throw visualError("VISUAL_ASSET_NOT_FOUND", "Visual asset was not found.", 404);
  const asset = assets[index];
  if (!REVIEWABLE_TYPES.has(asset.type)) throw visualError("VISUAL_ASSET_TYPE_INVALID", "Only cover and product-image assets may receive visual QA.", 409);
  if (!asset.checksum || !asset.storageRef) throw visualError("VISUAL_ASSET_EVIDENCE_REQUIRED", "Checksum-backed storage evidence is required before visual QA.", 409);

  const visualQa = Object.freeze({
    decision,
    notes: String(input.notes || "").trim().slice(0, 2000) || null,
    reviewedByIdentityHash: input.operatorIdentityHash,
    reviewedByEmail: input.operatorEmail,
    reviewedAt: new Date().toISOString(),
    checksum: asset.checksum,
  });
  assets[index] = Object.freeze({ ...asset, visualQa });
  const updated = Object.freeze({ ...product, assets: Object.freeze(assets), updatedAt: new Date().toISOString(), automaticPublicationAllowed: false });
  if (typeof context.revenueStore?.putRevenueProduct !== "function") throw visualError("REVENUE_STORE_UNAVAILABLE", "Revenue product storage is unavailable.", 503);
  await context.revenueStore.putRevenueProduct(updated);
  return Object.freeze({ revenueProductId: updated.revenueProductId, asset: assets[index], automaticPublicationAllowed: false, build: KAIROS_FIRST_VISUAL_REVIEW_BUILD });
}

function visualError(code, message, status = 400) { const error = new Error(message); error.code = code; error.status = status; return error; }
