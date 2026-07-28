export const KAIROS_FIRST_LAUNCH_CERTIFICATION_BUILD = "kairos-first-launch-certification-20260728-1";

export function certifyFirstRevenueLaunch(product = {}, input = {}) {
  requireExact(input.confirmation, "CERTIFY FIRST REVENUE LAUNCH");
  requireOperator(input);

  const checks = Object.freeze([
    check("content-approved", hasApprovedTypes(product, ["manuscript", "prompt-library", "workbook"], "editorialQa")),
    check("visuals-approved", hasApprovedTypes(product, ["cover", "product-image"], "visualQa")),
    check("package-approved", hasApprovedTypes(product, ["digital-edition", "editable-source", "complete-package"], "packageQa")),
    check("shopify-draft-created", product.shopifyDraftReceipt?.status === "DRAFT" && Boolean(product.shopifyDraftReceipt?.productId)),
    check("price-configured", Number(product.price?.amount ?? product.price) > 0),
    check("seo-configured", Boolean(product.seo?.title && product.seo?.description)),
    check("delivery-configured", Boolean(product.delivery || product.shopifyDraftReceipt?.packageChecksums?.length)),
    check("publication-disabled", product.automaticPublicationAllowed !== true),
  ]);

  const blockers = checks.filter((item) => !item.passed).map((item) => item.id);
  return Object.freeze({
    revenueProductId: product.revenueProductId || null,
    certified: blockers.length === 0,
    checks,
    blockers: Object.freeze(blockers),
    nextState: blockers.length === 0 ? "manual-shopify-review" : "launch-certification-blocked",
    certifiedByIdentityHash: blockers.length === 0 ? input.operatorIdentityHash : null,
    certifiedByEmail: blockers.length === 0 ? input.operatorEmail : null,
    certifiedAt: blockers.length === 0 ? new Date().toISOString() : null,
    automaticPublicationAllowed: false,
    build: KAIROS_FIRST_LAUNCH_CERTIFICATION_BUILD,
  });
}

function hasApprovedTypes(product, types, qaField) {
  const assets = Array.isArray(product.assets) ? product.assets : [];
  return types.every((type) => {
    const asset = assets.find((candidate) => candidate.type === type);
    return Boolean(asset?.checksum && asset?.storageRef && asset?.[qaField]?.decision === "approved");
  });
}

function check(id, passed) {
  return Object.freeze({ id, passed: Boolean(passed) });
}

function requireOperator(input) {
  if (!input.authorization || !input.operatorEmail || !input.operatorIdentityHash) {
    const error = new Error("Authenticated operator identity is required.");
    error.code = "KAIROS_OPERATOR_AUTH_REQUIRED";
    error.status = 401;
    throw error;
  }
}

function requireExact(actual, expected) {
  if (actual !== expected) {
    const error = new Error(`Exact confirmation ${expected} is required.`);
    error.code = "REVENUE_CONFIRMATION_REQUIRED";
    error.status = 409;
    throw error;
  }
}
