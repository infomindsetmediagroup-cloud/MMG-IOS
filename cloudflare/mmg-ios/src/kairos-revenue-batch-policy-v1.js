export const KAIROS_REVENUE_BATCH_POLICY_BUILD = "kairos-revenue-batch-policy-20260728-1";

const CONTENT_TYPES = Object.freeze(["manuscript", "prompt-library", "workbook"]);
const VISUAL_TYPES = Object.freeze(["cover", "product-image"]);
const PACKAGE_TYPES = Object.freeze(["digital-edition", "editable-source", "complete-package"]);

export function createRevenueBatchManifest(product = {}, batchType = "", input = {}) {
  const normalized = clean(batchType, 40);
  const outputTypes = normalized === "content" ? CONTENT_TYPES : normalized === "visual" ? VISUAL_TYPES : normalized === "package" ? PACKAGE_TYPES : null;
  if (!outputTypes) throw policyError("REVENUE_BATCH_TYPE_INVALID", "Revenue batch type must be content, visual, or package.");
  const expectedConfirmation = normalized === "content" ? "EXECUTE REVENUE CONTENT BATCH" : normalized === "visual" ? "EXECUTE REVENUE VISUAL BATCH" : "BUILD REVENUE DELIVERY PACKAGE";
  if (clean(input.confirmation, 120) !== expectedConfirmation) throw policyError("REVENUE_BATCH_CONFIRMATION_REQUIRED", `Use confirmation ${expectedConfirmation}.`, 409);
  const jobs = Array.isArray(product.productionJobs) ? product.productionJobs : [];
  const selectedJobs = jobs.filter((job) => outputTypes.includes(job.outputType) && job.state !== "completed");
  const unauthorized = selectedJobs.filter((job) => job.authorization?.status !== "authorized");
  if (unauthorized.length) throw policyError("REVENUE_BATCH_AUTHORIZATION_REQUIRED", `Authorize jobs before batch execution: ${unauthorized.map((job) => job.jobId).join(", ")}.`, 409);
  return Object.freeze({
    manifestId: `revenue_batch_${hash(`${product.revenueProductId}:${normalized}:${selectedJobs.map((job) => job.jobId).join(":")}`)}`,
    revenueProductId: clean(product.revenueProductId, 180),
    batchType: normalized,
    outputTypes,
    jobIds: Object.freeze(selectedJobs.map((job) => job.jobId)),
    sequential: true,
    stopOnFailure: true,
    editorialQARequired: normalized === "content" || normalized === "package",
    visualQARequired: normalized === "visual",
    automaticPublicationAllowed: false,
    createdAt: new Date().toISOString(),
    build: KAIROS_REVENUE_BATCH_POLICY_BUILD,
  });
}

export function evaluateRevenueAssetBatchQA(product = {}, batchType = "") {
  const normalized = clean(batchType, 40);
  const types = normalized === "content" ? CONTENT_TYPES : normalized === "visual" ? VISUAL_TYPES : normalized === "package" ? PACKAGE_TYPES : [];
  const assets = (Array.isArray(product.assets) ? product.assets : []).filter((asset) => types.includes(asset.type));
  const missing = types.filter((type) => !assets.some((asset) => asset.type === type));
  const unapproved = assets.filter((asset) => asset.editorialQAStatus !== "approved").map((asset) => asset.assetId || asset.type);
  const passed = missing.length === 0 && unapproved.length === 0;
  return Object.freeze({
    batchType: normalized,
    passed,
    expectedAssetTypes: types,
    missing: Object.freeze(missing),
    unapproved: Object.freeze(unapproved),
    publicationAuthorizationIncluded: false,
    build: KAIROS_REVENUE_BATCH_POLICY_BUILD,
  });
}

function hash(value) { let result = 2166136261; for (const char of String(value)) result = Math.imul(result ^ char.charCodeAt(0), 16777619); return (result >>> 0).toString(16).padStart(8, "0"); }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function policyError(code, message, status = 400) { const error = new Error(message); error.code = code; error.status = status; return error; }
