import { executeStoredFirstRevenueBatchStage } from "./kairos-first-revenue-batch-stage-bridge-v1.js";

export const KAIROS_FIRST_REVENUE_STAGE_API_BUILD = "kairos-first-revenue-stage-api-20260728-1";

export async function handleFirstRevenueStageRequest(request = {}, context = {}) {
  const method = String(request.method || "GET").toUpperCase();
  if (method !== "POST") return response(405, { error: { code: "METHOD_NOT_ALLOWED", message: "POST is required." } });
  if (!context.authorization) return response(401, { error: { code: "AUTHORIZATION_REQUIRED", message: "Authenticated operator authorization is required." } });
  if (!context.operatorIdentityHash) return response(401, { error: { code: "OPERATOR_IDENTITY_REQUIRED", message: "Operator identity is required." } });
  if (!context.firstRevenueRunStore || !context.revenueProductStore) return response(503, { error: { code: "REVENUE_STORE_UNAVAILABLE", message: "Revenue stores are unavailable." } });

  const input = request.body && typeof request.body === "object" ? request.body : {};
  const runId = clean(request.params?.runId || input.runId, 180);
  if (!runId) return response(400, { error: { code: "FIRST_REVENUE_RUN_REQUIRED", message: "First revenue run id is required." } });
  const run = await context.firstRevenueRunStore.getFirstRevenueRun(runId);
  if (!run) return response(404, { error: { code: "FIRST_REVENUE_RUN_NOT_FOUND", message: "First revenue run was not found." } });

  try {
    const execution = await executeStoredFirstRevenueBatchStage(context.revenueProductStore, run, {
      ...input,
      operatorIdentityHash: context.operatorIdentityHash,
    }, context.env || {});
    const updatedRun = attachStageExecution(run, execution, context.operatorIdentityHash);
    await context.firstRevenueRunStore.putFirstRevenueRun(updatedRun);
    return response(200, { run: updatedRun, execution, automaticPublicationAllowed: false, build: KAIROS_FIRST_REVENUE_STAGE_API_BUILD });
  } catch (error) {
    return response(Number(error?.status) || 500, { error: { code: error?.code || "FIRST_REVENUE_STAGE_FAILED", message: error?.message || "First revenue stage failed." } });
  }
}

export function attachStageExecution(run = {}, execution = {}, operatorIdentityHash = "") {
  if (!execution.completedStageId) throw apiError("FIRST_REVENUE_STAGE_RECEIPT_INVALID", "Completed stage receipt is required.");
  const completed = new Set(Array.isArray(run.completedStageIds) ? run.completedStageIds : []);
  completed.add(execution.completedStageId);
  const stages = Array.isArray(run.stages) ? run.stages : [];
  const next = stages.find((stage) => !completed.has(stage.id));
  const history = [...(Array.isArray(run.stageReceipts) ? run.stageReceipts : []), Object.freeze({
    completedStageId: execution.completedStageId,
    action: execution.action,
    batchExecutionId: execution.execution?.batchExecutionId || null,
    assetCoverageComplete: execution.coverage?.complete === true,
    operatorIdentityHash: clean(operatorIdentityHash, 180),
    completedAt: execution.completedAt || new Date().toISOString(),
    publicationPerformed: false,
  })].slice(-100);
  return Object.freeze({ ...run, completedStageIds: Object.freeze([...completed]), currentStage: next?.id || null, status: next ? "in_progress" : "manual_shopify_review", stageReceipts: Object.freeze(history), updatedAt: new Date().toISOString(), automaticPublicationAllowed: false });
}

function response(status, body) { return Object.freeze({ status, ok: status >= 200 && status < 300, body }); }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function apiError(code, message, status = 400) { const error = new Error(message); error.code = code; error.status = status; return error; }
