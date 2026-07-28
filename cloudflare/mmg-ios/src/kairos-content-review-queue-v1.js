export const KAIROS_CONTENT_REVIEW_QUEUE_BUILD = "kairos-content-review-queue-20260728-1";
const CONTENT_TYPES = new Set(["manuscript", "prompt-library", "workbook"]);

export function projectContentReviewQueue(product = {}) {
  const assets = (Array.isArray(product.assets) ? product.assets : [])
    .filter((asset) => CONTENT_TYPES.has(asset.type))
    .map((asset) => Object.freeze({
      assetId: asset.assetId,
      type: asset.type,
      filename: asset.filename,
      checksum: asset.checksum || null,
      storageRef: asset.storageRef || null,
      reviewStatus: asset.editorialReview?.decision || "pending",
      reviewedAt: asset.editorialReview?.reviewedAt || null,
      reviewedByIdentityHash: asset.editorialReview?.operatorIdentityHash || null,
      rejectionNote: asset.editorialReview?.note || null,
      reviewable: Boolean(asset.status === "ready" && asset.checksum && asset.storageRef),
    }));
  const approvedTypes = new Set(assets.filter((asset) => asset.reviewStatus === "approved").map((asset) => asset.type));
  const requiredTypes = Object.freeze(["manuscript", "prompt-library", "workbook"]);
  const blockers = [];
  for (const type of requiredTypes) {
    const asset = assets.find((candidate) => candidate.type === type);
    if (!asset) blockers.push(`missing:${type}`);
    else if (!asset.reviewable) blockers.push(`evidence:${type}`);
    else if (asset.reviewStatus !== "approved") blockers.push(`approval:${type}`);
  }
  return Object.freeze({
    revenueProductId: product.revenueProductId,
    assets: Object.freeze(assets),
    pendingCount: assets.filter((asset) => asset.reviewStatus === "pending").length,
    rejectedCount: assets.filter((asset) => asset.reviewStatus === "rejected").length,
    approvedCount: approvedTypes.size,
    blockers: Object.freeze(blockers),
    visualGenerationReady: blockers.length === 0,
    automaticPublicationAllowed: false,
    build: KAIROS_CONTENT_REVIEW_QUEUE_BUILD,
  });
}
