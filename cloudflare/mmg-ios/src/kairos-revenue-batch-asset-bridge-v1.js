import { registerKairosRevenueAsset, completeKairosRevenueJob } from "./kairos-revenue-asset-registration-v1.js";

export const KAIROS_REVENUE_BATCH_ASSET_BRIDGE_BUILD = "kairos-revenue-batch-asset-bridge-20260728-1";

export function attachRevenueBatchAssets(product = {}, execution = {}, input = {}) {
  if (!product.revenueProductId || execution.revenueProductId !== product.revenueProductId) {
    throw bridgeError("REVENUE_BATCH_ASSET_PRODUCT_MISMATCH", "Batch execution does not match the revenue product.", 409);
  }
  if (!execution.completed || !Array.isArray(execution.receipts) || execution.receipts.length === 0) {
    throw bridgeError("REVENUE_BATCH_ASSET_EXECUTION_INCOMPLETE", "A completed batch execution with receipts is required.", 409);
  }
  let next = product;
  const attachedAssetIds = [];
  for (const receipt of execution.receipts) {
    const job = (Array.isArray(next.productionJobs) ? next.productionJobs : []).find((item) => item.jobId === receipt.jobId);
    if (!job) throw bridgeError("REVENUE_BATCH_ASSET_JOB_NOT_FOUND", `Production job ${receipt.jobId} was not found.`, 404);
    if (!receipt.assetId || !receipt.storageRef || !receipt.checksum) {
      throw bridgeError("REVENUE_BATCH_ASSET_EVIDENCE_REQUIRED", `Receipt ${receipt.jobId} requires assetId, storageRef, and checksum.`, 409);
    }
    next = registerKairosRevenueAsset(next, {
      assetId: receipt.assetId,
      type: job.outputType,
      filename: receipt.filename || defaultFilename(job.outputType),
      checksum: receipt.checksum,
      storageRef: receipt.storageRef,
      byteSize: receipt.byteLength || 0,
      mimeType: receipt.mimeType || defaultMimeType(job.outputType),
      version: receipt.version || 1,
      completedAt: receipt.completedAt,
      operatorIdentityHash: input.operatorIdentityHash,
    });
    next = completeKairosRevenueJob(next, {
      jobId: receipt.jobId,
      outputAssetIds: [receipt.assetId],
      completedAt: receipt.completedAt,
    });
    attachedAssetIds.push(receipt.assetId);
  }
  const history = [...(Array.isArray(next.batchAssetAttachments) ? next.batchAssetAttachments : []), Object.freeze({
    attachmentId: `batch_asset_attachment_${hash(`${execution.batchExecutionId}:${attachedAssetIds.join(":")}`)}`,
    batchExecutionId: execution.batchExecutionId,
    batchType: execution.batchType,
    assetIds: Object.freeze(attachedAssetIds),
    operatorIdentityHash: clean(input.operatorIdentityHash, 180) || null,
    attachedAt: new Date().toISOString(),
    publicationPerformed: false,
  })].slice(-100);
  return Object.freeze({
    ...next,
    batchAssetAttachments: Object.freeze(history),
    updatedAt: new Date().toISOString(),
    automaticPublicationAllowed: false,
    build: KAIROS_REVENUE_BATCH_ASSET_BRIDGE_BUILD,
  });
}

export function evaluateRevenueBatchAssetCoverage(product = {}, batchType = "") {
  const expected = batchType === "content" ? ["manuscript", "prompt-library", "workbook"] : batchType === "visual" ? ["cover", "product-image"] : batchType === "package" ? ["digital-edition", "editable-source", "complete-package"] : [];
  if (!expected.length) throw bridgeError("REVENUE_BATCH_ASSET_TYPE_INVALID", "Batch type must be content, visual, or package.");
  const assets = Array.isArray(product.assets) ? product.assets : [];
  const missing = expected.filter((type) => !assets.some((asset) => asset.type === type && asset.status === "ready" && asset.storageRef && asset.checksum));
  return Object.freeze({ batchType, expected: Object.freeze(expected), missing: Object.freeze(missing), complete: missing.length === 0, publicationAuthorizationIncluded: false, build: KAIROS_REVENUE_BATCH_ASSET_BRIDGE_BUILD });
}

function defaultFilename(type) { return `${String(type || "asset").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.md`; }
function defaultMimeType(type) { if (["cover", "product-image"].includes(type)) return "image/png"; if (type === "digital-edition") return "application/pdf"; if (type === "editable-source") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"; if (type === "complete-package") return "application/zip"; return "text/markdown"; }
function hash(value) { let result = 2166136261; for (const char of String(value)) result = Math.imul(result ^ char.charCodeAt(0), 16777619); return (result >>> 0).toString(16).padStart(8, "0"); }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function bridgeError(code, message, status = 400) { const error = new Error(message); error.code = code; error.status = status; return error; }
