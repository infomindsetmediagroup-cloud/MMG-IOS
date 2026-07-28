import { createRevenueBatchManifest, evaluateRevenueAssetBatchQA, KAIROS_REVENUE_BATCH_POLICY_BUILD } from "./kairos-revenue-batch-policy-v1.js";

export const KAIROS_REVENUE_BATCH_RUNTIME_BUILD = "kairos-revenue-batch-runtime-20260728-1";

export async function executeKairosRevenueBatch(product = {}, batchType = "", input = {}, env = {}) {
  const manifest = createRevenueBatchManifest(product, batchType, input);
  if (!env?.KAIROS_REVENUE_BATCH_EXECUTOR) throw runtimeError("REVENUE_BATCH_EXECUTOR_UNAVAILABLE", "Kairos revenue batch executor is unavailable.", 503);
  const receipts = [];
  for (const jobId of manifest.jobIds) {
    const result = await env.KAIROS_REVENUE_BATCH_EXECUTOR({ revenueProductId: product.revenueProductId, jobId, batchType: manifest.batchType, input });
    if (!result?.success) throw runtimeError("REVENUE_BATCH_JOB_FAILED", `Revenue batch stopped at job ${jobId}.`, result?.status || 502);
    receipts.push(Object.freeze({ jobId, executionId: result.executionId || null, assetId: result.assetId || null, completedAt: result.completedAt || new Date().toISOString() }));
  }
  return Object.freeze({
    batchExecutionId: `revenue_batch_execution_${hash(`${manifest.manifestId}:${receipts.map((item) => item.jobId).join(":")}`)}`,
    revenueProductId: product.revenueProductId,
    batchType: manifest.batchType,
    manifest,
    receipts: Object.freeze(receipts),
    completed: receipts.length === manifest.jobIds.length,
    requiresQA: true,
    automaticPublicationAllowed: false,
    completedAt: new Date().toISOString(),
    builds: Object.freeze({ policy: KAIROS_REVENUE_BATCH_POLICY_BUILD, runtime: KAIROS_REVENUE_BATCH_RUNTIME_BUILD }),
  });
}

export function attachKairosRevenueBatchExecution(product = {}, execution = {}) {
  if (execution.revenueProductId !== product.revenueProductId) throw runtimeError("REVENUE_BATCH_EXECUTION_INVALID", "Revenue batch execution does not match the product.");
  const history = [...(Array.isArray(product.batchExecutions) ? product.batchExecutions : []), execution].slice(-50);
  return Object.freeze({ ...product, batchExecutions: Object.freeze(history), updatedAt: new Date().toISOString(), automaticPublicationAllowed: false });
}

export function approveKairosRevenueBatch(product = {}, batchType = "", input = {}) {
  if (String(input.confirmation || "").trim() !== expectedApproval(batchType)) throw runtimeError("REVENUE_BATCH_QA_CONFIRMATION_REQUIRED", `Use confirmation ${expectedApproval(batchType)}.`, 409);
  if (!input.operatorIdentityHash) throw runtimeError("REVENUE_BATCH_QA_IDENTITY_REQUIRED", "Operator identity is required.", 401);
  const qa = evaluateRevenueAssetBatchQA(product, batchType);
  if (!qa.passed) throw runtimeError("REVENUE_BATCH_QA_FAILED", `Revenue ${batchType} batch failed QA.`, 409);
  const approvals = [...(Array.isArray(product.batchApprovals) ? product.batchApprovals : []), Object.freeze({ batchType, approvedByIdentityHash: input.operatorIdentityHash, approvedAt: new Date().toISOString(), qa })].slice(-50);
  return Object.freeze({ ...product, batchApprovals: Object.freeze(approvals), updatedAt: new Date().toISOString(), automaticPublicationAllowed: false });
}

function expectedApproval(batchType) { return batchType === "content" ? "APPROVE REVENUE CONTENT ASSETS" : batchType === "visual" ? "APPROVE REVENUE VISUAL ASSETS" : "APPROVE REVENUE PACKAGE ASSETS"; }
function hash(value) { let result = 2166136261; for (const char of String(value)) result = Math.imul(result ^ char.charCodeAt(0), 16777619); return (result >>> 0).toString(16).padStart(8, "0"); }
function runtimeError(code, message, status = 400) { const error = new Error(message); error.code = code; error.status = status; return error; }
