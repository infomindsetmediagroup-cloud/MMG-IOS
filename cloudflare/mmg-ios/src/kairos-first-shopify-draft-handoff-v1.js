export const KAIROS_FIRST_SHOPIFY_DRAFT_HANDOFF_BUILD = "kairos-first-shopify-draft-handoff-20260728-1";

const REQUIRED_PACKAGE_TYPES = Object.freeze(["digital-edition", "editable-source", "complete-package"]);

export async function executeFirstShopifyDraftHandoff(context = {}, input = {}) {
  requireExact(input.confirmation, "CREATE FIRST SHOPIFY DRAFT");
  requireOperator(input);

  const product = await context.revenueStore?.getRevenueProduct?.(input.revenueProductId);
  if (!product) throw runtimeError("REVENUE_PRODUCT_NOT_FOUND", "Revenue product was not found.", 404);

  const packageGate = evaluatePackageApprovalGate(product);
  if (!packageGate.ready) {
    throw runtimeError("PACKAGE_APPROVAL_REQUIRED", "All required package assets must be approved before Shopify draft handoff.", 409, { blockers: packageGate.blockers });
  }

  if (product.shopifyDraftReceipt?.productId) {
    throw runtimeError("SHOPIFY_DRAFT_ALREADY_EXISTS", "A Shopify draft receipt is already attached to this revenue product.", 409);
  }

  const result = await context.createShopifyDraft?.({
    revenueProduct: product,
    confirmation: "CREATE SHOPIFY DRAFT",
    authorization: input.authorization,
    operatorEmail: input.operatorEmail,
    operatorIdentityHash: input.operatorIdentityHash,
  });

  if (!result?.productId || result.status !== "DRAFT") {
    throw runtimeError("SHOPIFY_DRAFT_EVIDENCE_REQUIRED", "Shopify did not return a valid DRAFT product receipt.", 502);
  }

  const receipt = Object.freeze({
    productId: result.productId,
    adminUrl: result.adminUrl || null,
    handle: result.handle || product.shopify?.handle || null,
    status: "DRAFT",
    createdByIdentityHash: input.operatorIdentityHash,
    createdByEmail: input.operatorEmail,
    createdAt: new Date().toISOString(),
    packageChecksums: Object.freeze(packageGate.assets.map((asset) => Object.freeze({ type: asset.type, checksum: asset.checksum }))),
    automaticPublicationAllowed: false,
  });

  const persisted = await context.revenueStore?.attachShopifyDraftReceipt?.(product.revenueProductId, receipt);
  if (!persisted) throw runtimeError("SHOPIFY_DRAFT_RECEIPT_PERSIST_FAILED", "Shopify draft receipt could not be persisted.", 500);

  return Object.freeze({
    revenueProductId: product.revenueProductId,
    receipt,
    nextStage: "launch-certification",
    automaticPublicationAllowed: false,
    build: KAIROS_FIRST_SHOPIFY_DRAFT_HANDOFF_BUILD,
  });
}

export function evaluatePackageApprovalGate(product = {}) {
  const assets = Array.isArray(product.assets) ? product.assets : [];
  const blockers = [];
  const approvedAssets = [];

  for (const type of REQUIRED_PACKAGE_TYPES) {
    const asset = assets.find((candidate) => candidate.type === type);
    if (!asset) blockers.push(`${type}:missing`);
    else if (asset.packageQa?.decision !== "approved") blockers.push(`${type}:not-approved`);
    else if (!asset.checksum || !asset.storageRef) blockers.push(`${type}:evidence-missing`);
    else approvedAssets.push(asset);
  }

  return Object.freeze({
    ready: blockers.length === 0,
    blockers: Object.freeze(blockers),
    assets: Object.freeze(approvedAssets),
    requiredTypes: REQUIRED_PACKAGE_TYPES,
  });
}

function requireOperator(input) {
  if (!input.authorization || !input.operatorEmail || !input.operatorIdentityHash) {
    throw runtimeError("KAIROS_OPERATOR_AUTH_REQUIRED", "Authenticated operator identity is required.", 401);
  }
}

function requireExact(actual, expected) {
  if (actual !== expected) throw runtimeError("REVENUE_CONFIRMATION_REQUIRED", `Exact confirmation ${expected} is required.`, 409);
}

function runtimeError(code, message, status = 400, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  Object.assign(error, details);
  return error;
}
