export const KAIROS_REVENUE_ASSET_STORAGE_BUILD = "kairos-revenue-asset-storage-20260727-1";

export async function storeKairosRevenueExecutionAsset(execution = {}, receipt = {}, env = {}) {
  const bucket = env.KAIROS_REVENUE_ASSETS;
  if (!bucket?.put) throw storageError("REVENUE_ASSET_STORAGE_UNAVAILABLE", "KAIROS_REVENUE_ASSETS object storage binding is required.", 503);
  const asset = receipt.asset || {};
  const productId = safeSegment(execution.revenueProductId);
  const jobId = safeSegment(execution.jobId);
  const filename = safeFilename(asset.filename || `${jobId}.md`);
  if (!productId || !jobId || !filename) throw storageError("REVENUE_ASSET_STORAGE_IDENTITY_REQUIRED", "Revenue product, job, and filename are required.");
  const key = `revenue-products/${productId}/${jobId}/${String(asset.version || 1).padStart(3, "0")}-${filename}`;
  const bytes = new TextEncoder().encode(String(execution.content || ""));
  if (!bytes.byteLength) throw storageError("REVENUE_ASSET_CONTENT_REQUIRED", "Generated revenue asset content is required.");
  await bucket.put(key, bytes, {
    httpMetadata: { contentType: asset.contentType || execution.contentType || "text/markdown; charset=utf-8" },
    customMetadata: {
      revenueProductId: String(execution.revenueProductId || "").slice(0, 180),
      jobId: String(execution.jobId || "").slice(0, 180),
      executionId: String(execution.executionId || "").slice(0, 180),
      checksum: String(asset.checksum || "").slice(0, 180),
      editorialQARequired: "true",
    },
  });
  return Object.freeze({
    assetId: asset.assetId,
    type: asset.type,
    filename,
    version: asset.version || 1,
    checksum: asset.checksum,
    storageRef: `r2://${key}`,
    byteSize: bytes.byteLength,
    mimeType: asset.contentType || execution.contentType || "text/markdown; charset=utf-8",
    completedAt: execution.completedAt || new Date().toISOString(),
    editorialQAStatus: "required",
    automaticPublicationAllowed: false,
    build: KAIROS_REVENUE_ASSET_STORAGE_BUILD,
  });
}

function safeSegment(value) { return String(value || "").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 180); }
function safeFilename(value) { return String(value || "").replace(/\u0000/g, "").trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 240); }
function storageError(code, message, status = 400) { const error = new Error(message); error.code = code; error.status = status; return error; }
