export const KAIROS_REVENUE_EXECUTION_RECEIPT_BUILD = "kairos-revenue-execution-receipt-20260727-1";

export function createKairosRevenueExecutionReceipt(execution = {}, input = {}) {
  const content = String(execution.content || "");
  if (!content.trim()) throw receiptError("REVENUE_EXECUTION_CONTENT_REQUIRED", "Execution content is required.");
  const filename = clean(input.filename || defaultFilename(execution.outputType), 240);
  const assetType = clean(input.assetType || execution.outputType, 100);
  if (!filename || !assetType) throw receiptError("REVENUE_ASSET_IDENTITY_REQUIRED", "Asset type and filename are required.");
  const checksum = clean(input.checksum, 180) || fnv1a(content);
  return Object.freeze({
    receiptId: `rx_${fnv1a(`${execution.executionId}:${filename}:${checksum}`)}`,
    executionId: clean(execution.executionId, 180),
    jobId: clean(execution.jobId, 180),
    revenueProductId: clean(execution.revenueProductId, 180),
    asset: Object.freeze({
      assetId: clean(input.assetId, 180) || `asset_${fnv1a(`${execution.jobId}:${filename}`)}`,
      type: assetType,
      filename,
      contentType: clean(input.contentType || execution.contentType || "text/markdown; charset=utf-8", 160),
      byteSize: new TextEncoder().encode(content).byteLength,
      checksum,
      storageRef: clean(input.storageRef, 500) || null,
      status: input.storageRef ? "stored" : "generated",
      version: Math.max(1, Math.floor(Number(input.version) || 1)),
    }),
    model: clean(execution.model, 120),
    usage: Object.freeze({ ...(execution.usage || {}) }),
    editorialQARequired: true,
    registrationReady: Boolean(input.storageRef),
    automaticPublicationAllowed: false,
    createdAt: new Date().toISOString(),
    build: KAIROS_REVENUE_EXECUTION_RECEIPT_BUILD,
  });
}

function defaultFilename(type) { const safe = clean(type || "generated-asset", 100).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); return `${safe || "generated-asset"}.md`; }
function fnv1a(value) { let hash = 2166136261; for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return (hash >>> 0).toString(16).padStart(8, "0"); }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function receiptError(code, message, status = 400) { const error = new Error(message); error.code = code; error.status = status; return error; }
