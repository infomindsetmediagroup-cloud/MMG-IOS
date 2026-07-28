export const KAIROS_REVENUE_ASSET_REGISTRATION_BUILD = "kairos-revenue-asset-registration-20260727-1";

export function registerKairosRevenueAsset(product = {}, input = {}) {
  const asset = normalizeAsset(input);
  if (!asset.assetId || !asset.type || !asset.filename || !asset.checksum || !asset.storageRef) throw assetError("REVENUE_ASSET_INVALID", "Completed revenue assets require assetId, type, filename, checksum, and storageRef.");
  const assets = (Array.isArray(product.assets) ? product.assets : []).filter((item) => item.assetId !== asset.assetId && item.type !== asset.type);
  assets.push(Object.freeze(asset));
  return Object.freeze({
    ...product,
    assets: Object.freeze(assets.slice(-200)),
    assetRegistration: Object.freeze({ lastAssetId: asset.assetId, registeredAt: asset.completedAt, registeredByIdentityHash: asset.registeredByIdentityHash }),
    updatedAt: asset.completedAt,
    commerceMutationAllowed: false,
    externalPublicationAllowed: false,
    deploymentExecutionAllowed: false,
  });
}

export function completeKairosRevenueJob(product = {}, input = {}) {
  const jobId = clean(input.jobId, 180);
  if (!jobId) throw assetError("REVENUE_JOB_REQUIRED", "Revenue production job is required.");
  let found = false;
  const jobs = (Array.isArray(product.productionJobs) ? product.productionJobs : []).map((job) => {
    if (job.jobId !== jobId) return job;
    found = true;
    if (job.authorization?.status !== "authorized") throw assetError("REVENUE_JOB_NOT_AUTHORIZED", "Revenue production job must be authorized before completion.", 409);
    return Object.freeze({ ...job, state: "completed", completedAt: normalizeIso(input.completedAt || new Date().toISOString()), outputAssetIds: Object.freeze((Array.isArray(input.outputAssetIds) ? input.outputAssetIds : []).map((value) => clean(value, 180)).filter(Boolean).slice(0, 50)) });
  });
  if (!found) throw assetError("REVENUE_JOB_NOT_FOUND", "Revenue production job was not found.", 404);
  return Object.freeze({ ...product, productionJobs: Object.freeze(jobs), updatedAt: normalizeIso(input.completedAt || new Date().toISOString()) });
}

function normalizeAsset(input) { return { assetId: clean(input.assetId, 180), type: clean(input.type, 100), filename: clean(input.filename, 240), version: Math.max(1, Math.floor(Number(input.version) || 1)), checksum: clean(input.checksum, 180), storageRef: clean(input.storageRef, 500), status: "ready", byteSize: Math.max(0, Math.floor(Number(input.byteSize) || 0)), mimeType: clean(input.mimeType, 120) || null, completedAt: normalizeIso(input.completedAt || new Date().toISOString()), registeredByIdentityHash: clean(input.operatorIdentityHash, 180) || null }; }
function normalizeIso(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString(); }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function assetError(code, message, status = 400) { const error = new Error(message); error.code = code; error.status = status; return error; }
