export const KAIROS_REVENUE_REVIEW_LINKS_BUILD = "kairos-revenue-review-links-20260728-1";

export async function createRevenueAssetReviewLinks(product = {}, input = {}, env = {}) {
  if (!input.operatorIdentityHash) throw reviewError("OPERATOR_IDENTITY_REQUIRED", "Operator identity is required.", 401);
  const allowedTypes = new Set(["manuscript", "prompt-library", "workbook", "cover", "product-image", "digital-edition", "editable-source", "complete-package"]);
  const assets = (Array.isArray(product.assets) ? product.assets : []).filter((asset) => allowedTypes.has(asset.type) && asset.status === "ready" && asset.storageRef && asset.checksum);
  const signer = env.KAIROS_REVENUE_REVIEW_SIGNER;
  if (typeof signer !== "function") throw reviewError("REVIEW_SIGNER_UNAVAILABLE", "Revenue review-link signer is unavailable.", 503);
  const expiresAt = new Date(Date.now() + Math.min(Math.max(Number(input.ttlSeconds) || 900, 60), 3600) * 1000).toISOString();
  const links = [];
  for (const asset of assets) {
    const signed = await signer({ revenueProductId: product.revenueProductId, assetId: asset.assetId, storageRef: asset.storageRef, checksum: asset.checksum, expiresAt, operatorIdentityHash: input.operatorIdentityHash });
    if (!signed?.url) throw reviewError("REVIEW_LINK_INVALID", `Review link was not created for ${asset.assetId}.`, 502);
    links.push(Object.freeze({ assetId: asset.assetId, type: asset.type, filename: asset.filename, url: signed.url, expiresAt, checksum: asset.checksum }));
  }
  return Object.freeze({ revenueProductId: product.revenueProductId, links: Object.freeze(links), expiresAt, singleUse: true, automaticPublicationAllowed: false, build: KAIROS_REVENUE_REVIEW_LINKS_BUILD });
}

function reviewError(code, message, status = 400) { const error = new Error(message); error.code = code; error.status = status; return error; }
