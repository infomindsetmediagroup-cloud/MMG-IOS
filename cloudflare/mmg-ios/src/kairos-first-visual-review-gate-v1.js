export const KAIROS_FIRST_VISUAL_REVIEW_GATE_BUILD = "kairos-first-visual-review-gate-20260728-1";

const REQUIRED_VISUAL_TYPES = Object.freeze(["cover", "product-image"]);

export function projectFirstVisualReviewGate(product = {}) {
  const assets = Array.isArray(product.assets) ? product.assets : [];
  const queue = REQUIRED_VISUAL_TYPES.map((type) => {
    const asset = assets.find((candidate) => candidate.type === type) || null;
    const decision = asset?.visualQa?.decision || "pending";
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
    readyForPackaging: blockers.length === 0,
    blockers: Object.freeze(blockers),
    nextStage: blockers.length === 0 ? "package-product" : "visual-review",
    automaticPublicationAllowed: false,
    build: KAIROS_FIRST_VISUAL_REVIEW_GATE_BUILD,
  });
}
