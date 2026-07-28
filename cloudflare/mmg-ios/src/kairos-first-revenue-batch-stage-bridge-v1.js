import { executeRevenueBatchStoreAction } from "./kairos-revenue-batch-store-v1.js";
import { attachRevenueBatchAssets, evaluateRevenueBatchAssetCoverage } from "./kairos-revenue-batch-asset-bridge-v1.js";

export const KAIROS_FIRST_REVENUE_BATCH_STAGE_BRIDGE_BUILD = "kairos-first-revenue-batch-stage-bridge-20260728-1";

const STAGE_ACTIONS = Object.freeze({
  "execute-content": "execute-content-batch",
  "execute-visuals": "execute-visual-batch",
  "editorial-qa": "approve-content-assets",
  "visual-qa": "approve-visual-assets",
  "build-package": "execute-package-batch",
  "package-qa": "approve-package-assets",
});

export async function executeStoredFirstRevenueBatchStage(store = {}, run = {}, input = {}, env = {}) {
  if (!run.runId || !run.revenueProductId) throw stageError("FIRST_REVENUE_BATCH_RUN_INVALID", "A persisted first revenue run is required.");
  const stageId = clean(run.currentStage, 80);
  const action = STAGE_ACTIONS[stageId];
  if (!action) throw stageError("FIRST_REVENUE_BATCH_STAGE_UNSUPPORTED", `Stage ${stageId} is not a batch-backed stage.`, 409);
  const result = await executeRevenueBatchStoreAction(store, run.revenueProductId, action, input, env);
  let product = result.product;
  if (result.execution) {
    product = attachRevenueBatchAssets(product, result.execution, { operatorIdentityHash: input.operatorIdentityHash });
    if (typeof store.putRevenueProduct === "function") await store.putRevenueProduct(product);
  }
  const batchType = stageId === "execute-content" || stageId === "editorial-qa" ? "content" : stageId === "execute-visuals" || stageId === "visual-qa" ? "visual" : "package";
  const coverage = evaluateRevenueBatchAssetCoverage(product, batchType);
  if (stageId.startsWith("execute-") || stageId === "build-package") {
    if (!coverage.complete) throw stageError("FIRST_REVENUE_BATCH_ASSETS_INCOMPLETE", `Stage ${stageId} completed without all required ${batchType} assets.`, 409);
  }
  return Object.freeze({
    runId: run.runId,
    revenueProductId: run.revenueProductId,
    completedStageId: stageId,
    action,
    product,
    execution: result.execution || null,
    approval: result.approval || null,
    coverage,
    automaticPublicationAllowed: false,
    completedAt: new Date().toISOString(),
    build: KAIROS_FIRST_REVENUE_BATCH_STAGE_BRIDGE_BUILD,
  });
}

export function getFirstRevenueBatchStageAction(stageId = "") {
  const action = STAGE_ACTIONS[clean(stageId, 80)];
  return action || null;
}

function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function stageError(code, message, status = 400) { const error = new Error(message); error.code = code; error.status = status; return error; }
