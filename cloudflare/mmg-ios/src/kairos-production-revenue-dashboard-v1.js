export const KAIROS_PRODUCTION_REVENUE_DASHBOARD_BUILD = "kairos-production-revenue-dashboard-20260728-1";

const STAGES = Object.freeze([
  ["content", ["manuscript", "prompt-library", "workbook"], "editorialQa"],
  ["visual", ["cover", "product-image"], "visualQa"],
  ["package", ["digital-edition", "editable-source", "complete-package"], "packageQa"],
]);

export function projectProductionRevenueDashboard(input = {}) {
  const product = input.product || {};
  const readiness = input.readiness || { ready: false, blockers: ["readiness-unavailable"] };
  const assets = Array.isArray(product.assets) ? product.assets : [];

  const stageCards = STAGES.map(([stage, types, qaField]) => {
    const items = types.map((type) => {
      const asset = assets.find((candidate) => candidate.type === type) || null;
      const decision = asset?.[qaField]?.decision || "pending";
      return Object.freeze({
        type,
        assetId: asset?.assetId || null,
        filename: asset?.filename || null,
        evidenceReady: Boolean(asset?.checksum && asset?.storageRef),
        decision,
        reviewable: Boolean(asset?.checksum && asset?.storageRef),
      });
    });
    return Object.freeze({
      stage,
      items: Object.freeze(items),
      approved: items.filter((item) => item.decision === "approved").length,
      required: items.length,
      complete: items.every((item) => item.decision === "approved" && item.evidenceReady),
    });
  });

  const shopifyDraft = product.shopifyDraftReceipt || null;
  const certification = product.launchCertification || null;
  const nextAction = chooseNextAction(readiness, stageCards, shopifyDraft, certification);

  return Object.freeze({
    revenueProductId: product.revenueProductId || null,
    title: product.title || product.shopify?.title || "First Revenue Product",
    readiness,
    stageCards: Object.freeze(stageCards),
    shopifyDraft: shopifyDraft ? Object.freeze({
      productId: shopifyDraft.productId || null,
      status: shopifyDraft.status || null,
      adminUrl: shopifyDraft.adminUrl || null,
      handle: shopifyDraft.handle || null,
    }) : null,
    certification,
    nextAction,
    reviewControlsEnabled: Boolean(readiness.ready),
    publicationControlEnabled: false,
    automaticPublicationAllowed: false,
    build: KAIROS_PRODUCTION_REVENUE_DASHBOARD_BUILD,
  });
}

function chooseNextAction(readiness, stages, draft, certification) {
  if (!readiness.ready) return "configure-production-runtime";
  const incomplete = stages.find((stage) => !stage.complete);
  if (incomplete) return `${incomplete.stage}-production-or-review`;
  if (!draft?.productId) return "create-shopify-draft";
  if (!certification?.certified) return "certify-launch";
  return "manual-shopify-review";
}
