import { executeRevenueProductionJob } from "./kairos-revenue-production-executor-v1.js";

export const KAIROS_FIRST_CONTENT_BATCH_BUILD = "kairos-first-content-batch-20260728-1";
const REQUIRED_TYPES = Object.freeze(["manuscript", "prompt-library", "workbook"]);

export async function executeFirstContentBatch(context = {}, input = {}) {
  requireExact(input.confirmation, "EXECUTE FIRST CONTENT BATCH");
  requireOperator(input);
  const product = await context.revenueStore?.getRevenueProduct?.(input.revenueProductId);
  if (!product) throw fault("REVENUE_PRODUCT_NOT_FOUND", "Revenue product was not found.", 404);
  const jobs = (Array.isArray(product.productionJobs) ? product.productionJobs : [])
    .filter((job) => REQUIRED_TYPES.includes(job.assetType) && job.status !== "completed");
  const missing = REQUIRED_TYPES.filter((type) => !jobs.some((job) => job.assetType === type));
  if (missing.length) throw fault("CONTENT_JOBS_INCOMPLETE", `Missing content jobs: ${missing.join(", ")}.`, 409);

  const receipts = [];
  for (const job of jobs) {
    if (!job.authorized) throw fault("CONTENT_JOB_NOT_AUTHORIZED", `Job ${job.jobId} is not authorized.`, 409);
    const result = await executeRevenueProductionJob({
      ...context,
      product,
      job,
      authorization: input.authorization,
      operatorEmail: input.operatorEmail,
      operatorIdentityHash: input.operatorIdentityHash,
      confirmation: "EXECUTE REVENUE JOB",
    });
    receipts.push(Object.freeze({ jobId: job.jobId, assetType: job.assetType, assetId: result.asset?.assetId || null, checksum: result.asset?.checksum || null, status: result.status || "completed" }));
    if (!result.asset?.storageRef || !result.asset?.checksum) throw fault("CONTENT_ASSET_EVIDENCE_MISSING", `Job ${job.jobId} did not produce checksum-backed storage evidence.`, 502);
  }

  const refreshed = await context.revenueStore?.getRevenueProduct?.(input.revenueProductId);
  const ready = REQUIRED_TYPES.every((type) => (refreshed?.assets || []).some((asset) => asset.type === type && asset.status === "ready" && asset.storageRef && asset.checksum));
  if (!ready) throw fault("CONTENT_BATCH_INCOMPLETE", "The first content batch did not produce all required assets.", 502);
  return Object.freeze({ revenueProductId: input.revenueProductId, receipts: Object.freeze(receipts), requiredAssetTypes: REQUIRED_TYPES, editorialReviewRequired: true, visualGenerationAllowed: false, automaticPublicationAllowed: false, build: KAIROS_FIRST_CONTENT_BATCH_BUILD });
}

function requireOperator(input) {
  if (!input.authorization || !input.operatorEmail || !input.operatorIdentityHash) throw fault("KAIROS_OPERATOR_AUTH_REQUIRED", "Authenticated operator identity is required.", 401);
}
function requireExact(actual, expected) { if (actual !== expected) throw fault("REVENUE_CONFIRMATION_REQUIRED", `Exact confirmation ${expected} is required.`, 409); }
function fault(code, message, status = 400) { const error = new Error(message); error.code = code; error.status = status; return error; }
