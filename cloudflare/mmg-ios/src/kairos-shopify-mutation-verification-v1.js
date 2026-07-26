export const KAIROS_SHOPIFY_MUTATION_VERIFICATION_BUILD = "kairos-shopify-mutation-verification-20260725-1";

const PRODUCT_FIELDS = Object.freeze(["title", "descriptionHtml", "status", "seoTitle", "seoDescription"]);

export function createShopifyProductSnapshot(product, { approvalId, phase } = {}) {
  if (!product?.id) throw verificationError("SHOPIFY_SNAPSHOT_PRODUCT_INVALID", "A verified Shopify product is required for mutation snapshots.");
  const normalizedPhase = String(phase || "").trim().toLowerCase();
  if (!new Set(["before", "after"]).has(normalizedPhase)) throw verificationError("SHOPIFY_SNAPSHOT_PHASE_INVALID", "Snapshot phase must be before or after.");
  return Object.freeze({
    approvalId: String(approvalId || ""),
    phase: normalizedPhase,
    capturedAt: new Date().toISOString(),
    product: Object.freeze({
      id: text(product.id, 220),
      title: text(product.title, 500),
      descriptionHtml: text(product.descriptionHtml, 50000),
      status: text(product.status, 40),
      seoTitle: text(product.seo?.title ?? product.seoTitle, 500),
      seoDescription: text(product.seo?.description ?? product.seoDescription, 1000),
      updatedAt: iso(product.updatedAt),
    }),
    build: KAIROS_SHOPIFY_MUTATION_VERIFICATION_BUILD,
  });
}

export function verifyShopifyProductMutation({ before, after, approvedChanges } = {}) {
  if (before?.phase !== "before" || after?.phase !== "after") throw verificationError("SHOPIFY_VERIFICATION_SNAPSHOTS_INVALID", "Before and after snapshots are required.");
  if (before.product?.id !== after.product?.id) throw verificationError("SHOPIFY_VERIFICATION_PRODUCT_MISMATCH", "Snapshots must reference the same Shopify product.");
  const requested = new Set(Object.keys(approvedChanges || {}));
  const changes = [];
  const unexpected = [];
  for (const field of PRODUCT_FIELDS) {
    const prior = before.product?.[field] ?? "";
    const current = after.product?.[field] ?? "";
    if (prior === current) continue;
    const item = { field, before: prior, after: current };
    changes.push(item);
    if (!requested.has(field)) unexpected.push(item);
  }
  return Object.freeze({
    verified: unexpected.length === 0,
    productId: before.product.id,
    approvedFields: [...requested].sort(),
    changedFields: changes.map((item) => item.field),
    changes,
    unexpectedChanges: unexpected,
    rollbackPlan: buildRollbackPlan(before, changes),
    build: KAIROS_SHOPIFY_MUTATION_VERIFICATION_BUILD,
  });
}

function buildRollbackPlan(before, changes) {
  const values = {};
  for (const item of changes) values[item.field] = before.product[item.field];
  return Object.freeze({
    available: changes.length > 0,
    automatic: false,
    requiresNewApproval: true,
    toolId: "shopify.product.update",
    productId: before.product.id,
    changes: values,
    reason: "Rollback is a new production mutation and requires a separately proposed, identity-bound, single-use approval.",
  });
}

function text(value, max) { return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max); }
function iso(value) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function verificationError(code, message) { const error = new Error(message); error.code = code; error.status = 422; return error; }
