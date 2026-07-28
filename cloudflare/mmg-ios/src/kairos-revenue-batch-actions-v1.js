import { executeKairosRevenueBatch, attachKairosRevenueBatchExecution, approveKairosRevenueBatch, KAIROS_REVENUE_BATCH_RUNTIME_BUILD } from "./kairos-revenue-batch-runtime-v1.js";

export const KAIROS_REVENUE_BATCH_ACTIONS_BUILD = "kairos-revenue-batch-actions-20260728-1";

export async function executeRevenueBatchAction(product = {}, action = "", input = {}, env = {}) {
  const spec = ACTIONS[action];
  if (!spec) throw actionError("REVENUE_BATCH_ACTION_INVALID", "Unknown revenue batch action.");
  if (spec.mode === "execute") {
    const execution = await executeKairosRevenueBatch(product, spec.batchType, input, env);
    return Object.freeze({ product: attachKairosRevenueBatchExecution(product, execution), execution, automaticPublicationAllowed: false, build: KAIROS_REVENUE_BATCH_ACTIONS_BUILD });
  }
  const approved = approveKairosRevenueBatch(product, spec.batchType, input);
  return Object.freeze({ product: approved, approval: approved.batchApprovals.at(-1), automaticPublicationAllowed: false, build: KAIROS_REVENUE_BATCH_ACTIONS_BUILD });
}

export function getRevenueBatchActionSpec(action = "") {
  const spec = ACTIONS[action];
  return spec ? Object.freeze({ ...spec }) : null;
}

const ACTIONS = Object.freeze({
  "execute-content-batch": Object.freeze({ mode: "execute", batchType: "content" }),
  "execute-visual-batch": Object.freeze({ mode: "execute", batchType: "visual" }),
  "execute-package-batch": Object.freeze({ mode: "execute", batchType: "package" }),
  "approve-content-assets": Object.freeze({ mode: "approve", batchType: "content" }),
  "approve-visual-assets": Object.freeze({ mode: "approve", batchType: "visual" }),
  "approve-package-assets": Object.freeze({ mode: "approve", batchType: "package" }),
});

function actionError(code, message, status = 400) { const error = new Error(message); error.code = code; error.status = status; return error; }
