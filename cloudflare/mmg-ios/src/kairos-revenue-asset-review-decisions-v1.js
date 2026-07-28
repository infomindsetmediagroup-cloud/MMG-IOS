export const KAIROS_REVENUE_ASSET_REVIEW_DECISIONS_BUILD = "kairos-revenue-asset-review-decisions-20260728-1";

export async function decideRevenueAssetReview(stores = {}, input = {}) {
  const decision = String(input.decision || "").toLowerCase();
  if (!new Set(["approved", "rejected"]).has(decision)) throw reviewError("REVIEW_DECISION_INVALID", "Asset review decision must be approved or rejected.", 400);
  if (!input.operatorIdentityHash) throw reviewError("OPERATOR_IDENTITY_REQUIRED", "Operator identity is required.", 401);
  if (decision === "rejected" && !String(input.notes || "").trim()) throw reviewError("REJECTION_NOTES_REQUIRED", "Rejection notes are required.", 409);
  const product = await stores.revenueStore?.getRevenueProduct?.(clean(input.revenueProductId, 180));
  if (!product) throw reviewError("REVENUE_PRODUCT_NOT_FOUND", "Revenue product was not found.", 404);
  const assets = Array.isArray(product.assets) ? product.assets : [];
  const target = assets.find((asset) => asset.assetId === input.assetId);
  if (!target) throw reviewError("REVENUE_ASSET_NOT_FOUND", "Revenue asset was not found.", 404);
  if (!target.storageRef || !target.checksum) throw reviewError("REVENUE_ASSET_EVIDENCE_REQUIRED", "Stored checksum-backed asset evidence is required.", 409);
  const reviewedAt = new Date().toISOString();
  const review = Object.freeze({ decision, notes: clean(input.notes, 2000) || null, reviewedAt, reviewedByIdentityHash: clean(input.operatorIdentityHash, 180) });
  const updatedAsset = Object.freeze({ ...target, editorialReview: review, status: decision === "approved" ? "approved" : "rejected" });
  const updatedProduct = Object.freeze({ ...product, assets: Object.freeze(assets.map((asset) => asset.assetId === target.assetId ? updatedAsset : asset)), updatedAt: reviewedAt, automaticPublicationAllowed: false });
  if (typeof stores.revenueStore?.putRevenueProduct !== "function") throw reviewError("REVENUE_STORE_UNAVAILABLE", "Revenue product storage is unavailable.", 503);
  await stores.revenueStore.putRevenueProduct(updatedProduct);
  return Object.freeze({ revenueProductId: updatedProduct.revenueProductId, asset: updatedAsset, review, automaticPublicationAllowed: false, build: KAIROS_REVENUE_ASSET_REVIEW_DECISIONS_BUILD });
}

export function evaluateContentApproval(product = {}) {
  const required = ["manuscript", "prompt-library", "workbook"];
  const assets = Array.isArray(product.assets) ? product.assets : [];
  const status = required.map((type) => ({ type, asset: assets.find((asset) => asset.type === type) || null }));
  const blockers = status.filter(({ asset }) => !asset || asset.editorialReview?.decision !== "approved").map(({ type }) => type);
  return Object.freeze({ readyForVisualGeneration: blockers.length === 0, blockers: Object.freeze(blockers), automaticPublicationAllowed: false });
}

function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function reviewError(code, message, status = 400) { const error = new Error(message); error.code = code; error.status = status; return error; }
