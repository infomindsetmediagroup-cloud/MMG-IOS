export const KAIROS_FIRST_REVENUE_BOOTSTRAP_BUILD = "kairos-first-revenue-bootstrap-20260728-1";

export async function bootstrapFirstRevenueRun(stores = {}, input = {}) {
  requireConfirmation(input.confirmation, "BOOTSTRAP FIRST REVENUE RUN");
  const productId = clean(input.revenueProductId || "ai-video-prompt-mastery-v1", 180);
  const existing = await stores.firstRevenueStore?.findActiveRunByProduct?.(productId);
  if (existing) return Object.freeze({ run: existing, created: false, recovered: false, automaticPublicationAllowed: false, build: KAIROS_FIRST_REVENUE_BOOTSTRAP_BUILD });
  const product = await stores.revenueStore?.getRevenueProduct?.(productId);
  if (!product) throw runtimeError("REVENUE_PRODUCT_NOT_FOUND", "The canonical revenue product was not found.", 404);
  const run = Object.freeze({
    runId: clean(input.runId || `first_revenue_${Date.now()}`, 180),
    revenueProductId: productId,
    state: "active",
    completedStageIds: Object.freeze([]),
    stageReceipts: Object.freeze([]),
    createdAt: new Date().toISOString(),
    createdByIdentityHash: clean(input.operatorIdentityHash, 180) || null,
    automaticPublicationAllowed: false,
  });
  if (typeof stores.firstRevenueStore?.putFirstRevenueRun !== "function") throw runtimeError("FIRST_REVENUE_STORE_UNAVAILABLE", "First revenue run storage is unavailable.", 503);
  await stores.firstRevenueStore.putFirstRevenueRun(run);
  return Object.freeze({ run, created: true, recovered: false, automaticPublicationAllowed: false, build: KAIROS_FIRST_REVENUE_BOOTSTRAP_BUILD });
}

export async function recoverFirstRevenueRun(stores = {}, input = {}) {
  requireConfirmation(input.confirmation, "RECOVER FIRST REVENUE RUN");
  const run = await stores.firstRevenueStore?.getFirstRevenueRun?.(clean(input.runId, 180));
  if (!run) throw runtimeError("FIRST_REVENUE_RUN_NOT_FOUND", "First revenue run was not found.", 404);
  const receipts = Array.isArray(run.stageReceipts) ? run.stageReceipts : [];
  const completed = new Set(Array.isArray(run.completedStageIds) ? run.completedStageIds : []);
  for (const receipt of receipts) if (receipt?.completedStageId) completed.add(receipt.completedStageId);
  const recovered = Object.freeze({ ...run, state: "active", completedStageIds: Object.freeze([...completed]), recoveredAt: new Date().toISOString(), recoveredByIdentityHash: clean(input.operatorIdentityHash, 180) || null, automaticPublicationAllowed: false });
  await stores.firstRevenueStore?.putFirstRevenueRun?.(recovered);
  return Object.freeze({ run: recovered, created: false, recovered: true, automaticPublicationAllowed: false, build: KAIROS_FIRST_REVENUE_BOOTSTRAP_BUILD });
}

function requireConfirmation(actual, expected) { if (actual !== expected) throw runtimeError("REVENUE_CONFIRMATION_REQUIRED", `Exact confirmation ${expected} is required.`, 409); }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function runtimeError(code, message, status = 400) { const error = new Error(message); error.code = code; error.status = status; return error; }
