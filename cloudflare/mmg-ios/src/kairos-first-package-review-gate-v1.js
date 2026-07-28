export const KAIROS_FIRST_PACKAGE_REVIEW_GATE_BUILD = "kairos-first-package-review-gate-20260728-1";

const REQUIRED_PACKAGE_TYPES = Object.freeze(["digital-edition", "editable-source", "complete-package"]);

export function projectFirstPackageReviewGate(product = {}) {
  const assets = Array.isArray(product.assets) ? product.assets : [];
  const queue = REQUIRED_PACKAGE_TYPES.map((type) => {
    const asset = assets.find((candidate) => candidate.type === type) || null;
    const decision = asset?.packageQa?.decision || "pending";
    const evidenceReady = Boolean(asset?.checksum && asset?.storageRef);
    return Object.freeze({
      type,
      assetId: asset?.assetId || null,
      filename: asset?.filename || null,
      decision,
      evidenceReady,
      readyForReview: Boolean(asset && evidenceReady),
      blocker: !asset ? "missing" : !evidenceReady ? "evidence-missing" : decision === "rejected" ? "rejected" : decision !== "approved" ? "pending-review" : null,
    });
  });

  const blockers = queue.filter((item) => item.blocker).map((item) => `${item.type}:${item.blocker}`);
  return Object.freeze({
    revenueProductId: product.revenueProductId || null,
    queue: Object.freeze(queue),
    approvedCount: queue.filter((item) => item.decision === "approved").length,
    rejectedCount: queue.filter((item) => item.decision === "rejected").length,
    pendingCount: queue.filter((item) => item.decision === "pending").length,
    readyForShopifyDraftHandoff: blockers.length === 0,
    blockers: Object.freeze(blockers),
    nextStage: blockers.length === 0 ? "shopify-draft-handoff" : "package-review",
    automaticPublicationAllowed: false,
    build: KAIROS_FIRST_PACKAGE_REVIEW_GATE_BUILD,
  });
}
