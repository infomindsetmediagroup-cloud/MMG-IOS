export const KAIROS_REVENUE_PRODUCTION_JOBS_BUILD = "kairos-revenue-production-jobs-20260727-1";

export function createKairosRevenueProductionJobs(product = {}, input = {}) {
  const blueprint = product.blueprint || {};
  const requiredAssets = Array.isArray(blueprint.requiredAssets) ? blueprint.requiredAssets : [];
  const existing = new Set((Array.isArray(product.assets) ? product.assets : []).map((asset) => clean(asset.type, 100)));
  const jobs = requiredAssets.filter((asset) => !existing.has(clean(asset.type, 100))).slice(0, 100).map((asset, index) => Object.freeze({
    jobId: `revjob_${stableHash(`${product.revenueProductId}:${asset.type}:${index}`)}`,
    revenueProductId: clean(product.revenueProductId, 180),
    projectId: clean(input.projectId, 180) || null,
    jobType: classifyJob(asset.type),
    assetType: clean(asset.type, 100),
    status: "ready",
    priority: normalizePriority(input.priority),
    dependencies: Object.freeze(dependenciesFor(asset.type, jobsSeed(requiredAssets, index))),
    specification: Object.freeze({
      title: clean(blueprint.title, 240),
      objective: clean(blueprint.objective, 3000),
      audience: clean(blueprint.audience, 1000),
      format: clean(asset.format || asset.type, 100),
      minimumPages: Number.isFinite(asset.minimumPages) ? Math.max(1, Math.floor(asset.minimumPages)) : null,
      dimensions: clean(asset.dimensions, 100) || null,
      acceptanceCriteria: Object.freeze((Array.isArray(asset.acceptanceCriteria) ? asset.acceptanceCriteria : []).slice(0, 20).map((item) => clean(item, 500)).filter(Boolean)),
    }),
    attempts: 0,
    executionAuthorized: false,
    deploymentExecutionAllowed: false,
    commerceMutationAllowed: false,
    externalPublicationAllowed: false,
  }));
  return Object.freeze(jobs);
}

export function authorizeKairosRevenueJob(job = {}, input = {}) {
  const identityHash = clean(input.authorizedByIdentityHash, 180);
  if (!identityHash) throw jobError("JOB_AUTHORIZER_REQUIRED", "Hashed job authorizer identity is required.");
  if (!["ready", "failed"].includes(job.status)) throw jobError("JOB_NOT_AUTHORIZABLE", "Only ready or failed jobs may be authorized.", 409);
  return Object.freeze({ ...job, status: "queued", executionAuthorized: true, authorizedByIdentityHash: identityHash, authorizedAt: normalizeIso(input.authorizedAt || new Date().toISOString()), attempts: Math.max(0, Number(job.attempts) || 0), deploymentExecutionAllowed: false, commerceMutationAllowed: false, externalPublicationAllowed: false });
}

function classifyJob(type) { const value = clean(type, 100); if (["manuscript","workbook","prompt_library","template_pack","product_copy","seo_metadata","customer_instructions"].includes(value)) return "content_generation"; if (["cover","product_image","thumbnail","preview_image","social_graphic"].includes(value)) return "visual_asset_generation"; if (["pdf","docx","zip_package"].includes(value)) return "document_packaging"; return "asset_generation"; }
function dependenciesFor(type, prior) { const value = clean(type, 100); if (["pdf","docx"].includes(value)) return prior.filter((item) => ["manuscript","workbook","prompt_library","template_pack"].includes(item)); if (["product_image","thumbnail","preview_image","social_graphic"].includes(value)) return prior.filter((item) => item === "cover"); if (value === "zip_package") return prior.filter((item) => ["pdf","docx","cover","product_image","customer_instructions"].includes(item)); return []; }
function jobsSeed(required, index) { return required.slice(0, index).map((item) => clean(item.type, 100)).filter(Boolean); }
function normalizePriority(value) { const priority = clean(value || "normal", 20); return ["low","normal","high","critical"].includes(priority) ? priority : "normal"; }
function stableHash(value) { let hash = 2166136261; for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return (hash >>> 0).toString(16).padStart(8, "0"); }
function normalizeIso(value) { const date = new Date(value || 0); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function jobError(code, message, status = 400) { const error = new Error(message); error.code = code; error.status = status; return error; }
