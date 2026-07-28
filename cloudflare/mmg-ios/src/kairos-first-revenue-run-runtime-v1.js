import { executeFirstRevenueStage, KAIROS_FIRST_REVENUE_RUN_EXECUTOR_BUILD } from "./kairos-first-revenue-run-executor-v1.js";

export const KAIROS_FIRST_REVENUE_RUN_RUNTIME_BUILD = "kairos-first-revenue-run-runtime-20260728-1";

export async function executePersistedFirstRevenueStage(run = {}, input = {}, env = {}) {
  const transport = async (request) => {
    if (!env?.KAIROS_RUNTIME_FETCH) throw runtimeError("FIRST_REVENUE_RUNTIME_TRANSPORT_UNAVAILABLE", "Kairos runtime transport is unavailable.", 503);
    const response = await env.KAIROS_RUNTIME_FETCH(request.path, {
      method: request.method,
      headers: {
        "Content-Type": "application/json",
        Authorization: input.authorization || "",
        "CF-Access-Authenticated-User-Email": input.operatorEmail || "",
      },
      body: JSON.stringify(request.body || {}),
    });
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body, error: body?.error };
  };
  const result = await executeFirstRevenueStage(run, input, transport);
  return Object.freeze({
    ...result,
    runtimeBuild: KAIROS_FIRST_REVENUE_RUN_RUNTIME_BUILD,
    executorBuild: KAIROS_FIRST_REVENUE_RUN_EXECUTOR_BUILD,
    automaticPublicationAllowed: false,
  });
}

export function attachFirstRevenueStageReceipt(run = {}, execution = {}, input = {}) {
  if (!execution.completedStageId) throw runtimeError("FIRST_REVENUE_STAGE_RECEIPT_INVALID", "A completed stage execution is required.");
  const completed = [...new Set([...(run.completedStageIds || []), execution.completedStageId])];
  const receipts = [...(run.stageReceipts || []), Object.freeze({
    receiptId: `first_revenue_stage_${hash(`${run.runId}:${execution.completedStageId}:${execution.executedAt}`)}`,
    stageId: execution.completedStageId,
    executedAt: execution.executedAt || new Date().toISOString(),
    operatorIdentityHash: clean(input.operatorIdentityHash, 180) || null,
    result: execution.result || null,
    publicationPerformed: false,
  })].slice(-100);
  return Object.freeze({
    ...run,
    completedStageIds: Object.freeze(completed),
    stageReceipts: Object.freeze(receipts),
    currentStage: nextStage(run.stages || [], completed),
    status: completed.length >= (run.stages || []).length ? "completed_awaiting_manual_shopify_review" : "in_progress",
    updatedAt: new Date().toISOString(),
    automaticPublicationAllowed: false,
  });
}

function nextStage(stages, completed) { const done = new Set(completed); return stages.find((stage) => !done.has(stage.id))?.id || null; }
function hash(value) { let result = 2166136261; for (const char of String(value)) result = Math.imul(result ^ char.charCodeAt(0), 16777619); return (result >>> 0).toString(16).padStart(8, "0"); }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function runtimeError(code, message, status = 400) { const error = new Error(message); error.code = code; error.status = status; return error; }
