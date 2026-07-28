export const KAIROS_FIRST_PACKAGE_BATCH_BUILD = "kairos-first-package-batch-20260728-1";

const REQUIRED_VISUAL_TYPES = Object.freeze(["cover", "product-image"]);
const PACKAGE_JOB_TYPES = new Set(["digital-edition", "editable-source", "complete-package"]);

export async function executeFirstPackageBatch(context = {}, input = {}) {
  requireExact(input.confirmation, "EXECUTE FIRST PACKAGE BATCH");
  if (!input.authorization || !input.operatorEmail || !input.operatorIdentityHash) {
    throw runtimeError("KAIROS_OPERATOR_AUTH_REQUIRED", "Authenticated operator identity is required.", 401);
  }

  const product = await context.revenueStore?.getRevenueProduct?.(input.revenueProductId);
  if (!product) throw runtimeError("REVENUE_PRODUCT_NOT_FOUND", "Revenue product was not found.", 404);

  const visualGate = evaluateVisualApprovalGate(product);
  if (!visualGate.ready) {
    throw runtimeError("VISUAL_APPROVAL_REQUIRED", "Cover and product image must be approved before packaging.", 409, { blockers: visualGate.blockers });
  }

  const jobs = (Array.isArray(product.productionJobs) ? product.productionJobs : [])
    .filter((job) => PACKAGE_JOB_TYPES.has(job.assetType));
  if (!jobs.length) throw runtimeError("PACKAGE_JOBS_NOT_FOUND", "No package production jobs were found.", 404);

  const receipts = [];
  for (const job of jobs) {
    if (job.authorized !== true) throw runtimeError("PACKAGE_JOB_NOT_AUTHORIZED", `Package job ${job.jobId || job.assetType} is not authorized.`, 409);
    const result = await context.executeJob?.(job, {
      authorization: input.authorization,
      operatorEmail: input.operatorEmail,
      operatorIdentityHash: input.operatorIdentityHash,
      confirmation: "EXECUTE REVENUE JOB",
    });
    if (!result?.asset?.checksum || !result.asset.storageRef) {
      throw runtimeError("PACKAGE_ASSET_EVIDENCE_REQUIRED", `Package job ${job.jobId || job.assetType} did not produce checksum-backed storage evidence.`, 502);
    }
    receipts.push(Object.freeze({
      jobId: job.jobId || null,
      assetId: result.asset.assetId,
      assetType: result.asset.type || job.assetType,
      checksum: result.asset.checksum,
      storageRef: result.asset.storageRef,
      executedByIdentityHash: input.operatorIdentityHash,
      executedAt: new Date().toISOString(),
    }));
  }

  return Object.freeze({
    revenueProductId: product.revenueProductId,
    receipts: Object.freeze(receipts),
    completed: receipts.length === jobs.length,
    nextGate: "package-review",
    automaticPublicationAllowed: false,
    build: KAIROS_FIRST_PACKAGE_BATCH_BUILD,
  });
}

export function evaluateVisualApprovalGate(product = {}) {
  const assets = Array.isArray(product.assets) ? product.assets : [];
  const blockers = [];
  for (const type of REQUIRED_VISUAL_TYPES) {
    const asset = assets.find((candidate) => candidate.type === type);
    if (!asset) blockers.push(`${type}:missing`);
    else if (asset.visualQa?.decision !== "approved") blockers.push(`${type}:not-approved`);
    else if (!asset.checksum || !asset.storageRef) blockers.push(`${type}:evidence-missing`);
  }
  return Object.freeze({ ready: blockers.length === 0, blockers: Object.freeze(blockers), requiredTypes: REQUIRED_VISUAL_TYPES });
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
